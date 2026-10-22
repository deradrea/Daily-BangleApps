/* Explicit diagnostic mode only. App Loader Comms/UART and watch software stay unchanged. */
(() => {
  const minimal = location.pathname.endsWith('/vera-uart-readonly.html');
  if (!minimal && new URLSearchParams(location.search).get('veraReadonly') !== '1') return;
  const api = minimal ? 'UART.eval' : 'Comms.eval';
  const panel = document.createElement('section');
  panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:white;color:#242424;padding:24px;font:16px/1.5 system-ui,sans-serif';
  panel.innerHTML = '<h1>' + (minimal ? 'UART ufficiale' : 'App Loader') + ' · Lettura F0:AA</h1><p>Dispositivo atteso: FC:0C:5D:40:F0:AA. Una sola lettura di MAC e firmware tramite ' + api + '.</p><button type="button" disabled style="min-height:44px;padding:10px 18px">Leggi MAC e firmware</button><p role="status">Preparazione diagnostica. Nessun collegamento avviato.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
  document.body.appendChild(panel);
  // Prevent access to ordinary install/reset/time actions while this mode is open.
  document.addEventListener('click', event => {
    if (!panel.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const button = panel.querySelector('button'), status = panel.querySelector('[role=status]'), output = panel.querySelector('pre');
  const report = { mode: minimal ? 'minimal-uart-readonly' : 'apploader-comms-readonly', api, expectedMac: 'FC:0C:5D:40:F0:AA', connectionStarted: false, events: [] };
  const started = performance.now(); let sequence = 0, attempted = false;
  const render = () => { output.textContent = JSON.stringify(report, null, 2); };
  const record = (event, detail = {}) => {
    report.events.push({ sequence: ++sequence, elapsedMs: Math.round(performance.now() - started), event, ...detail });
    if (report.events.length > 200) report.events.shift();
    render();
  };
  const observed = new WeakSet();
  const watch = device => {
    if (observed.has(device)) return;
    observed.add(device);
    device.addEventListener('gattserverdisconnected', () => record('gattserverdisconnected', { connected: device.gatt.connected }));
  };
  const wrap = (prototype, method, label, onResult) => {
    const original = prototype?.[method];
    if (typeof original !== 'function') throw Error('API diagnostica non disponibile: ' + label);
    prototype[method] = function(...args) {
      record(label + '.called', { stack: new Error().stack, connected: typeof this.connected === 'boolean' ? this.connected : undefined,
        uuid: ['gatt.getPrimaryService', 'gatt.getCharacteristic'].includes(label) ? args[0] : undefined });
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) { record(label + '.threw', { name: error.name }); throw error; }
      if (result?.then) result.then(value => {
        if (onResult) { try { onResult(value); } catch (error) { record(label + '.observer-error', { name: error.name }); } }
        record(label + '.resolved');
      }, error => record(label + '.rejected', { name: error.name }));
      else record(label + '.returned');
      return result;
    };
  };
  try {
    if (!isSecureContext || !navigator.bluetooth || (!minimal && typeof Comms === 'undefined') || typeof UART === 'undefined' || UART.version !== '1.26') throw Error('Bluetooth Web o App Loader non disponibile.');
    if (UART.isConnected()) throw Error('Sessione UART gia attiva: nessuna prova avviata.');
    if (minimal) UART.ports = ['Web Bluetooth'];
    wrap(Object.getPrototypeOf(navigator.bluetooth), 'requestDevice', 'requestDevice', watch);
    const prototype = BluetoothRemoteGATTServer.prototype;
    wrap(prototype, 'connect', 'gatt.connect');
    wrap(prototype, 'getPrimaryService', 'gatt.getPrimaryService');
    wrap(prototype, 'disconnect', 'gatt.disconnect');
    wrap(BluetoothRemoteGATTService.prototype, 'getCharacteristic', 'gatt.getCharacteristic');
    wrap(BluetoothRemoteGATTCharacteristic.prototype, 'startNotifications', 'gatt.startNotifications');
    button.disabled = false;
    status.textContent = 'Pronto. Nessun collegamento avviato. Il resto dell’App Loader e bloccato in questa modalita.';
  } catch (error) { status.textContent = error.message; }
  render();
  button.addEventListener('click', async () => {
    if (attempted || button.disabled) return;
    attempted = true; button.disabled = true;
    report.connectionStarted = true; report.startedAt = new Date().toISOString();
    record('read-requested'); status.textContent = 'Scelta del dispositivo e apertura UART. Lettura sola di MAC e firmware.';
    try {
      const expression = '({mac:NRF.getAddress().split(" ")[0].toUpperCase(),firmware:process.env.VERSION})';
      const value = await (minimal ? UART.eval(expression) : Comms.eval(expression));
      report.identity = value;
      if (value?.mac !== report.expectedMac || typeof value.firmware !== 'string') throw Error('Identita diversa dal dispositivo atteso.');
      report.success = true;
      status.textContent = 'MAC e firmware letti. Chiusura della sessione.';
    } catch (error) {
      report.success = false; report.error = { name: error?.name || 'Error', message: error?.message || String(error) };
      status.textContent = 'Lettura non riuscita. Nessun nuovo tentativo automatico.';
    } finally {
      record('readonly-cleanup'); UART.close(); render();
    }
  });
})();
