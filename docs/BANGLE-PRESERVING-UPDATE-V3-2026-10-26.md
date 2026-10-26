# Aggiornamento preservante Vera Node v3

Il pacchetto è distinto dall'inizializzazione: sostituisce esclusivamente gli
otto file Vera già catalogati e prepara quattro file di manutenzione separati.
Firmware, impostazioni, profilo, journal, timestamp e conferme di trasferimento
non sono destinazioni di scrittura. Il runtime di destinazione resta545d;
un Bangle già545d viene riconosciuto come allineato, prima della manutenzione.

## Isolamento e integrità

Il bootstrap autorizzato prepara sidecar e journal a doppio banco, poi riavvia
in isolamento. L'app salva e rilegge un backup completo prima delle scritture.
Ogni file software passa per staging con SHA256, copia precedente verificata e
journal di transazione. Una perdita durante la copia finale recupera soltanto
quel file, scegliendo fra origine e destinazione già approvate.

La prima scrittura alloca e trasferisce insieme il primo blocco: due scritture
offset-zero troncano il file nel vero Storage Espruino. Le espressioni regolari
non usano ripetizioni contate, non supportate in2v29. L'inventario StorageFile
conserva i nomi base restituiti dal firmware; la lettura sequenziale evita di
ricaricare tutto il segmento per ogni blocco512byte.

L'identità amministrativa dell'operazione comprende sette campi separati dal
proprietario del profilo. Sono conservati anche un profilo di altro utente o
l'assenza del profilo, usando SHA256/null. Il tokenRAM dura al massimo60s;
l'app lo rinnova entro il permesso di fase di Vera, senza richiesteHTTP perchunk.

## Ripresa e ripristino

La ripresa usa la medesima operazione, snapshot e pacchetto bloccato per hash.
I file già verificati non vengono ricopiati. La conferma dopo il riavvio è
ripetibile; una risposta persa non impone un'altra installazione.

Il recupero autorizzato dopo scadenza crea un'operazione distinta rollback-only.
In isolamento adotta il journal esistente. Se il target ha già riavviato la
raccolta, l'app congela lo stato CORRENTE e verifica un secondo backup. Dal
backup del parent provengono soltanto gli otto file software originali; i
campioni più recenti e il profilo corrente vengono protetti dal nuovo backup.
Non si ripristina un archivio vecchio sopra i nuovi dati.

Il boot guard confronta gli hash software e il profilo, poi la salute prevista
della raccolta. Gli hash dei journal sono confrontati prima dell'attivazione;
dopo il riavvio possono crescere legittimamente. La ricevutaAPI resta evidenza
del client, non attestazione hardware o prova di autonomia.

## Verifiche

Test NodeVM di isolamento, perdita alimentazione, binding, inventario, profilo
assente/altro proprietario e rollback. Runner
`bin/test-maintenance-espruino.cjs`: interprete ufficialeEspruino2v29 conStorage
ecrypto nativi; radio, identità e salute sensori sostituite esplicitamente.
Prove native comprendono più blocchi, nuovi segmenti dopo boot, conservazione
esatta dei byte, rollback e conferma ripetibile.

Il builder legge solo sorgenti committati e mantiene il builder storico quando
si richiede una revisione precedente. Gli artefatti già pubblicati non vengono
alterati. Una releaseGitHub, un deployAPI e una prova fisica sono esiti distinti.
Il collaudo24ore è sospeso; queste prove non modificano un orologio fisico.
