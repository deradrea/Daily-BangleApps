# Release corrente: inizializzazione dedicata Vera Node

Revisione: `veranode-zero-1-d812397c6325d227`.
Sorgente canonico: `6bde001e2c895909f4480e392fade0bbec6185cf`.
Schema: `vera-bangle-zero-initialize/1`, protocollo 1.
Profilo: `veranode-only`; modello BANGLEJS2, firmware esatto 2v29.

## Contenuto e contratto

14 file target, 7 supporti di recupero. Vera Node e l'unica app d'uso.
Il piccolo launch.app.js ritorna a Vera; Settings, Launcher standard e relativi
moduli/registri sono assenti. Gli otto file runtime e il JSON dei campioni
sono identici alla release precedente. Il target e il bootstrap sono byte
identici al candidato locale717c. Cambiano abilitazione e provenienza.

Policy generica: scope=server-authorized-initialization;
allowedRoles=[super_admin,platform_admin]; requiresDeviceBinding=true.
Nessuna allowlist MAC nel pacchetto. Backend e consumer verificano permessi,
dispositivo canonico, MAC/board/firmware letti, grant e binding di esecuzione.
executionEnabled=true consente l'integrazione autorizzata: non avvia operazioni
e non sostituisce la conferma distruttiva e il consenso fisico attuali.
BLE cifrato, carica minima50%, staging integro e spazio sufficiente restano
obbligatori. Firmware invariato; Inizializza cancella i contenuti locali,
Aggiorna Vera e separato e preservante.

## Asset immutabili

- initialize.json: d812397c6325d2277b3b1193186b7b91f30ea370523b49205a3adfad6a0b02a9,206423byte
- descriptor.json: 10ac751a043f0c7f8fae05469216b293aaccc0aaf1bb8c9f0d6d4f2ab5ddf3b3
- source-manifest.json: 120cd1fc13371b6a30b4bf47d2fff7ea2b179bca113dd2a336ccc0d59a7ac193

Target fingerprint83b51c1628cc4c05f5670e29568d87ce8628f601ffda8b058c18839253b28733.
13 target prima dell'attivazione, bootcde per ultimo, UTC prima dell'avvio,
boot0 come ultimo commit. Checkpoint a doppio banco, wipe-once, ripresa della
stessa esecuzione e conferma del vero cold boot restano invariati.

## Validazione e limiti verificati

195 test software superati: suite190 piu5 audit della release. Verificati21
payload, descriptor, source manifest, input Git, espressioni bootstrap,
ricostruzione byte per byte dei tre asset, avvio della base ridotta con vero
runtime e quadrante in VM, standby e campioni sensore simulati.

F0AA letto realmente in sola diagnosi: FC:0C:5D:40:F0:AA, BANGLEJS2,2v29,
batteria94%. Questa lettura conferma identita/compatibilita, non installazione,
riavvio del nuovo software o acquisizione sensori. hardwareValidated=false
rimane corretto. Nessuna operazione hardware durante il rilascio.

Il precedente5b6c resta immutato. Il consumer deve integrare esplicitamente il
profilo14, la policy generica e l'hash di questa release; cambiare il catalogo
senza aggiornare le validazioni non rende compatibile il consumer precedente.
