# Release corrente: inizializzazione dedicata Vera Node

Revisione: `veranode-zero-1-f076ba0efa3cac5c`.
Sorgente canonico: `d3870d170e9af259778650931c961c8ee0d92da4`.
Schema: `vera-bangle-zero-initialize/1`, protocollo 1.
Profilo: `veranode-only`; modello BANGLEJS2, firmware esatto 2v29.

## Contenuto e contratto

14 file target, 7 supporti di recupero. Vera Node e l'unica app d'uso.
Il piccolo launch.app.js ritorna a Vera; Settings, Launcher standard e relativi
moduli/registri sono assenti. Gli otto file runtime e il JSON dei campioni
sono identici alla release precedente. Tutti i14target restano byte identici a d812 e al candidato717c. La correzione
interessa il caricamento della UI di manutenzione, due file di supporto e le
espressioni di preparazione; il runtime sul target non cambia.

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

- initialize.json: f076ba0efa3cac5c838021c00a8ec0e39f8d92762149552abcfea8221282dbd1,207108byte
- descriptor.json: 99ca802ec0b92ffa4ccb42bd88dd00654429c5c95b2d4e43517de2a7098caa01
- source-manifest.json: ef52a3b9e9d40f5db270966a2b16d8a6d29c7f77bccbc68c20eb938bc74b84a1

Target fingerprint83b51c1628cc4c05f5670e29568d87ce8628f601ffda8b058c18839253b28733.
13 target prima dell'attivazione, bootcde per ultimo, UTC prima dell'avvio,
boot0 come ultimo commit. Checkpoint a doppio banco, wipe-once, ripresa della
stessa esecuzione e conferma del vero cold boot restano invariati.

## Validazione e limiti verificati

198 test software superati, incluso un test con il vero interprete Espruino2v29
che esegue6 regressioni native. Verificati21
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


## Correzione del bootstrap su firmware2v29

Nel firmware ufficiale Modules.removeCached lancia Module not found se il nome
non e gia presente nella cache, anche quando il file esiste correttamente in
Storage. La precedente espressione d812 lo chiamava incondizionatamente sul
provider: su factory interrompeva il bootstrap prima del suo caricamento.
Fonte ufficiale: https://github.com/espruino/Espruino/blob/RELEASE_2V29/src/jswrap_modules.c#L193-L205

La nuova espressione legge Modules.getCached e rimuove solo le quattro voci
presenti: provider, platform, display e target. Include il target per non
riusare in RAM un inventario precedente. Nessuna cancellazione di campioni.
La UI di preparazione sostituisce la UI precedente in RAM e imposta i timeout
LCD, retroilluminazione e lock a0 durante la manutenzione. Non modifica le
impostazioni persistenti. Il tasto richiama il ridisegno della preparazione.

feedbackBootstrapExpression ritorna {feedbackReady:true,visualVerified:false}.
uiBootstrapExpression ritorna lo status del provider con appUiReady:true e
visualVerified:false. Errori nella UI vengono propagati e la mancanza della
UI montata impedisce l'ack. Il consumer deve controllare entrambi gli ack prima
di proseguire. Questi ack non attestano quello che la persona vede sul display:
serve riscontro visivo durante il prossimo collaudo fisico, prima del wipe.

## Regression test con interprete reale

bin/test-zero-espruino.cjs --package <initialize.json> --download usa i tre asset
ufficiali EspruinoWebIDE al commit fb9f890377f45851577c658bcfc8b60e973a2d6a,
verificati con gli SHA in test/veranode/fixtures/espruino-emulator-2v29.json.
L'interprete dichiara2v29, boardEMSCRIPTEN2. Soltanto il nome della board viene
mappato al guard BANGLEJS2; Storage, Modules e require sono quelli nativi C,
senza mock require di Node. La flash e interamente virtuale, senza BLE.
Il test e incluso nella suite e scarica in cache temporanea i file ufficiali
mancanti, sempre verificando gli hash prima dell'esecuzione.

Casi: errore d812 riprodotto; cachevuota; cachemista con target obsoleto;
rimozione della vecchia UI e mantenimento LCD; file realmente assente con
errore propagato; dati preesistenti nella flash virtuale conservati.

Il rapporto81de403c prewipe e il suo binding d812 non vengono riscritti con
nuovi byte. Una futura esecuzione della nuova release richiede un nuovo
binding/conferma attuale, senza reset manuale e senza ripetere una pulizia
mai autorizzata. d812 e5b6c restano artefatti immutabili storici.
