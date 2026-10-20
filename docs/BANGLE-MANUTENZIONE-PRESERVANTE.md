# Vera Node: manutenzione protetta e aggiornamento preservante

## Campo di applicazione

Sorgenti canonici in `maintenance/veranode/`, builder `bin/build-veranode-upgrade.cjs`.
Questo componente aggiorna un Vera Node gia configurato. Non e una factory image,
non rimuove altre app, non cambia il firmware e non autorizza la formattazione.
Il pacchetto first-install 545d rimane immutato.

## Procedura

1. Vera verifica account, assegnazione, dispositivo e disponibilita del pacchetto.
2. L'app verifica gli otto file di origine e il bootloader supportato.
3. Installa e rilegge quattro file separati di manutenzione. La guardia viene scritta per ultima.
4. Registra il contesto e passa all'ambiente isolato: raccolta sospesa, dati immutati, consenso touch esplicito.
5. Copia sul telefono i file normali e gli StorageFile, con verifica completa del backup.
6. Sostituisce solo gli otto file software: staging, copia precedente, journal, scrittura e SHA256.
7. Verifica dati e profilo prima di attivare. Dopo l'avvio verifica software, profilo e health del runtime prima di confermare.

La gestione Android della connessione e l'isolamento dei file sul Bangle sono
controlli differenti. Il PIN locale o la sola integrita del pacchetto non
sostituiscono l'assegnazione e l'autorizzazione di Vera.

## Interruzioni

- Trasferimento parziale verso staging: il file in uso non viene sostituito.
- Copia finale interrotta: al successivo ingresso il provider accetta il file precedente o nuovo verificato; un file incompleto viene ripristinato dalla copia precedente verificata.
- Registro: due slot con generazione e hash, con fallback allo slot integro. Entrambi corrotti mantengono il collector fermo e mostrano il recupero da app.
- Nessuna scrittura software: Annulla/Riprendi riattiva il software originale dopo verifica.
- Software misto: nessun riavvio automatico verso una combinazione incompleta. Serve completamento o rollback dall'app.
- Scadenza o perdita BLE: la raccolta non riparte su software parziale. Nuova sessione e nuovo consenso; nessun dato viene eliminato.

## Backup e limiti

Il backup comprende file software, profilo, impostazioni, eventi, campioni e
tracce temporali. Sono esclusi soltanto i nomi operativi espliciti `veram.*`
elencati nel manifesto e le cache generate `.boot0`, `.widcache`, `.clkinfocache`.
Non vengono esclusi i dati delle altre app. Uno StorageFile oltre 64 KiB viene
rifiutato: i segmenti Vera sono piccoli, ma un file estraneo enorme non deve
esaurire la RAM. Le operazioni si fermano se non c'e spazio libero sufficiente;
nessuna compattazione o cancellazione automatica e prevista.

Origini accettate: pacchetti c212 e 545d identificati da SHA256 e dall'intero
inventario degli otto file. Non basta la stringa di versione. Modifiche locali
sconosciute richiedono analisi, non una compatibilita inventata.

Il bootloader richiesto e quello esplicitamente identificato nel manifesto
con gli hash di `bootupdate.js` e `.bootcde`. Altri bootloader non vengono sovrascritti.

## Prove e stato

Suite Node locale: 138 test passati, inclusi codice reale del provider,
piattaforma Storage, guardia boot, due slot, bytes binari e conferma finale.
Compatibilita del journal c212 verificata con fixture offline; JSON/CRC invariati.
Queste prove non certificano durata batteria, alimentazione interrotta reale,
bootloader installato o aggiornamento fisico riuscito.

Backend: le API pubblicate da Vera Web registrano il piano e restituiscono ancora
`execution_enabled=false`. L'app si ferma prima di BLE/consenso/backup quando il
server blocca l'operazione. La pubblicazione del pacchetto non cambia questo stato.

L'attivazione eseguibile richiede il contratto delle fasi con Vera Web e una
verifica d'integrazione. Il collaudo fisico delle 24 ore resta sospeso.

## Riferimenti tecnici

- https://www.espruino.com/ReferenceBANGLEJS2 (Storage, StorageFile, crypto SHA256)
- https://www.espruino.com/Saving (load e codice in Flash)
- `apps/boot/bootupdate.js` e `bootloader.js` del repository, hash nel manifesto.

Inventario BLE paginato in blocchi di massimo 32 voci per rispettare il limite
delle risposte UART anche con molti segmenti offline.
