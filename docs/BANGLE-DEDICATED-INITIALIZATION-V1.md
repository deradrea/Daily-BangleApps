# Inizializzazione dedicata Vera, protocollo 1

Artefatto `vera-bangle-dedicated-initialize/1`, distinto dal first-install 545d e dall'upgrade d749. Firmware invariato; solo BANGLEJS2 2v29 e bootloader standard identificato dagli hash nel manifest. Nessun `eraseAll`, nessun firmware o reset hardware.

## Confine delle autorizzazioni

Vera autorizza l'amministratore, l'assegnazione, il MAC e il pacchetto nel consumer Web/Mobile. Il provider non pretende di verificare crittograficamente una firma server non ancora definita. Sul watch richiede sessione BLE cifrata, MAC fisico e consenso touch locale. Il controllo PIN remoto verificabile dal watch resta una funzionalità separata: un booleano del client non ne costituisce una prova.

## API UART canonica

Dopo caricamento e rilettura dei file `bootstrap`, il consumer crea `global.VeraInitialize=require('verai.provider.js').create(require('verai.platform.js').create())`. Nessuna espressione di cancellazione viene generata dai consumer.

- `inspect()` restituisce board, firmware, mac, batteria, spazio e compatibilità. Non cancella o installa.
- `requestSecurity()` avvia solo `NRF.startBonding(false)`, senza forzare nuove chiavi o modificare la policy Bluetooth. Restituisce lo stato immediato; `securityStatus()` distingue requested, awaiting-encryption, encrypted, failed e timed-out. Il consumer attende `encrypted:true`, non la sola risoluzione della Promise. Timeout 45 secondi, messaggio di associazione sul telefono, nessuna rimozione o preparazione mentre il collegamento non e cifrato.
- `prepare(binding)` richiede `{operationId,mac,packageSha256,assignment}`; è una preparazione non distruttiva che registra il contesto e isola l'esecuzione. Il consumer rilegge lo stato dopo riconnessione. Il bootloader deve essere compatibile prima di questa operazione.
- `status()` restituisce fase, contatori reali, contesto e stato del consenso.
- `plan()` in ambiente isolato congela l'inventario reale e restituisce `planHash`, `removeApps`, `removeData`, `replace`, `files`. Ogni voce è `{name,kind,size,sha256}`. `kind` è `normal` oppure `storage-file`. Non assumere che il device sia vuoto.
- `inventoryPage(offset,limit)` restituisce le voci del piano in blocchi fino a 24. Totali e hash non dipendono dalla paginazione.
- `stage(index,offset,total,base64)` trasferisce i target del manifest in blocchi di massimo 384 byte, con offset contiguo e SHA256 completo prima di dichiarare il file pronto. Restituisce byte verificati, file verificati e totale.
- `apply(planHash)` richiede tutti i target verificati, piano invariato, MAC, BLE cifrata e consenso locale. Ogni chiamata esegue al massimo un'operazione; restituisce conteggi reali. Il journal precede ogni cancellazione/sostituzione. Non ripetere l'intera inizializzazione dopo timeout: usare `recover` sulla stessa operazione.
- `verify()` controlla inventario finale, target e home Vera senza attivare.
- `activate()` richiede verifica completa, abilita boot e home Vera e riavvia il solo software. Non significa ora/profilo verificati.
- `recover(binding)` riprende la stessa operazione e lo stesso pacchetto dal journal; un nuovo contesto viene rifiutato. Nessuna cancellazione aggiuntiva fuori dal piano.
- `confirm()` dopo riconnessione verifica home e health reale di Vera Node; restituisce `softwareReady:true`. Solo dopo il consumer sincronizza l'ora con Vera, applica il profilo approvato e registra il completamento dell'intero wizard.
- `cancel()` prima di `apply` ripristina il boot originale verificato e riavvia il software precedente. Dopo il primo effetto e consentita solo la ripresa della stessa inizializzazione, non un annullamento ingannevole.

## Interfaccia e sequenza

Un avvio nel wizard. Conferma iniziale esplicita che tutti i dati locali, il profilo locale precedente e le app non necessarie del MAC scelto verranno eliminati. Dopo chooser il MAC fisico deve coincidere. Preparazione, piano reale e autorizzazione server precedono la prima rimozione. Il watch mostra VERA, fase, anello e conteggio reale. Touch locale per consentire; tasto laterale mantiene visibile la richiesta. La perdita di collegamento revoca il consenso RAM. La ripresa richiede nuovo consenso, non un nuovo piano distruttivo.

La base mantiene soltanto boot, launcher, impostazioni e moduli necessari; Vera Node conserva gli otto byte-file della release 545d. `setting.json` seleziona permanentemente `veranode.app.js`. I file operativi `verai.*` e lo staging sono esclusi dalle rimozioni. Lo staging viene rimosso solo dopo la conferma della raccolta reale. Nessun dato campione viene trasformato: i nuovi campioni continuano a usare il JSON corrente. Software pronto non equivale a profilo approvato: se manca un profilo valido, il consumer lo indica e non avvia sessioni Mobile o invii MQTT. Il runtime locale e quello canonico 545d.

Il piano contiene al massimo 128 file ASCII (nome 1-28 caratteri), 32 KiB di metadati; uno StorageFile oltre 64 KiB e rifiutato. Lo spazio iniziale richiesto e almeno due volte il target piu 64 KiB di riserva; ulteriori controlli precedono ogni scrittura. Il piano immutabile e separato dal piccolo journal, per evitare riscriverlo a ogni blocco e ridurre usura/tempo Flash.

Schema JSON del pacchetto: `bootstrap` sei file `{name,size,sha256,base64}`, `target.files` 22 file nello stesso formato, `target.stagingBytes`, `target.bootloaderSha256`, `target.bootupdateSha256`, `targetFingerprint`, `sourceManifestSha256`, `runtimeRevision`, `runtimePackageSha256`, `home`, `authorization`, `limits`, `recovery`. Il descriptor separato usa schema `vera-bangle-initialize-descriptor/1` con revision, sha256, size, board, firmware, hardwareValidated, sourceRepository, mode, home e targetFingerprint. La policy del canale appartiene al catalogo, non e un campo produttore inventato.

`targetFingerprint` = SHA256 UTF8 del JSON canonico di `target.files.map(({name,size,sha256}) => ({name,size,sha256}))`. `planHash` = SHA256 UTF8 del JSON canonico di `{binding,targetFingerprint,files,removeApps,removeData,replace}`. Oggetti ordinati per chiave ricorsivamente; array con ordine invariato; JSON senza spazi. L'inventario e ordinato lessicograficamente su `kind+':'+name`. Nessun float, chiavi arbitrarie o nomi Unicode sono necessari. `binding.assignment` e l'ID intero positivo del registro Vera; `operationId` UUID stringa; MAC maiuscolo e packageSha256 esadecimale minuscolo.

In caso di errore prima delle rimozioni i dati sono intatti; dopo il primo effetto la ripresa completa il piano di inizializzazione, non ricrea i dati intenzionalmente cancellati. Il journal doppio slot rileva scritture interrotte. Uno slot corrotto usa quello integro; entrambi corrotti impongono recupero assistito. Non sono consentite compattazioni automatiche mentre codice Flash è in esecuzione. Spazio insufficiente e StorageFile oltre il limite dichiarato fermano la preparazione.

## Verifiche

Test VM e trasporto simulato possono provare hash, inventario, offset, piano, riprese, isolamento, boot e health fittizia. Non dimostrano durata batteria, latenza BLE, cold boot fisico o interruzioni dell'alimentazione reale. `hardwareValidated:false` resta nel manifest fino a una prova effettiva.

## Provenienza della revisione 54ee

Release storica: `veranode-initialize-1-54eef6a1037274d8`, SHA256 `54eef6a1037274d8656cf5a63aad31586d347f051857c23085da9576d620e9e9`, 263156 byte. Sostituita dalla d335 per compatibilita Espruino2v29; gli asset restano immutati per verifica e recupero delle operazioni pendenti. Gli asset precedenti 3245 e 536e rimangono storici e non vanno catalogati.

## Correzione canonica d335

Questa revisione e storica: il successivo controllo indipendente ha rilevato una discrepanza CRLF/LF nella provenienza del provider. Non catalogare d335; usare4652 seguente.

`veranode-initialize-1-d335c6ff747279b3`, SHA256 `d335c6ff747279b30ccf8d16cdc9917218fa0b6bc0f44b2c3eee2b07aff0a382`, 263364byte. Sorgenti6f93a2f4f, tagcacb08637. Corregge Number.isInteger non disponibile nel provider, senza cambiare target22file, JSON o runtime. 156 test software passati, incluso errore54ee riprodotto e ciclo completo senza Number.isInteger. Per operazioni interrotte, non basta cambiare il catalogo: vedere [confini della riparazione](BANGLE-INITIALIZE-ESPRUINO-2V29-FIX.md). Nessuna esecuzione hardware da questa chat.

## Release canonica corrente 4652

`veranode-initialize-1-46527ffbad6b154e`, SHA256 `46527ffbad6b154e5a0ebba41c7feeb7b1eba986a74d7b533e43f4077ebfe28b`, 263208byte. Sorgenti37b16985c, taga0b012b87. Corregge la compatibilita numerica e legge tutti gli input del bootstrap con git show del commit dichiarato. 157 test passati, inclusa verifica esatta dei byte Git. Provider SHA `468bd60ca0a11ab835950b92f9fb67ad8961b123dda7c402dad4cc9faad9c6b2`; tutti22target invariati. 54ee e d335 restano immutati come asset storici, non release correnti. La nuova provenienza non modifica le condizioni di recupero esplicito delle pratiche54ee gia avviate.

Il sistema base viene costruito da `git show <sourceCommit>:<path>`, non dai byte CRLF del checkout Windows. `baseSources.sourceState` e `git-tree`. Il decoder di icone e nel submodule ufficiale: `baseSources.externalSources['webtools/heatshrink.js']` dichiara repository, commit, path e SHA256. Il suo commit deve corrispondere al gitlink `webtools` del commit radice. Tutti i 23 input sono stati verificati come Git blob esatti, senza normalizzazione nel consumer.

Il provider riconosce solamente i digest LF e CRLF dichiarati dello stesso bootloader e bootupdate standard. Il target usa i sorgenti Git ufficiali LF; non ammette altri bootloader. Il recupero avvia la propria UI da `.boot0`, anche se `.bootcde` non puo essere eseguito, mantenendo UART per riprendere il piano. Il test di questa condizione e in VM, non su hardware.


## Binding di manutenzione senza assegnazione — 20 ottobre 2026

Nuova revisione immutabile: protocollo comandi 1 invariato, bindingContract versione 2.
Il binding assegnato storico continua a richiedere assignment intero positivo.
La manutenzione di un dispositivo non assegnato usa esattamente i campi:
`{bindingVersion:2,scope:"device-maintenance",deviceId:97,assignment:null,operationId,mac,packageSha256}`.
L'ID del dispositivo è l'identità canonica Vera, non un'assegnazione inventata.
Scope/versione/deviceId mancanti, assignment 0 o storico, campi aggiuntivi e contesti misti vengono rifiutati prima dell'isolamento.
Il provider conserva confronto canonico dell'intero binding per piano e ripresa; non converte journal esistenti.

L'autorizzazione resta nel consumer/server: amministratori piattaforma su tutti i dispositivi, amministratori aziendali nel proprio ambito, utenti sui propri dispositivi secondo policy Vera corrente. Il binding non è una firma né un'autorizzazione autonoma dell'orologio. BLE cifrato, consenso fisico, piano verificato e grant del consumer restano necessari. Il profilo operativo approvato resta separato e non viene fabbricato per un dispositivo senza utente.

Per una vecchia pratica PREPLAN il consumer deve mantenere request_hash e snapshot originali immutabili, registrare un execution_context di manutenzione distinto e auditato, revocare grant precedenti, verificare inventario fresco e assenza di journal/piano/apply. Dopo staging/apply è vietato cambiare binding o riutilizzare un'altra assegnazione; si completa la stessa operazione. Questa revisione non autorizza reset, cancellazioni ripetute o migrazioni automatiche sul device.

Runtime target, JSON campioni e i 22 file di destinazione sono identici al pacchetto4652. Cambiano validatore bootstrap e metadati del contratto. La pubblicazione non costituisce installazione hardware o esito di collaudo.

Artefatto pubblicabile: `veranode-initialize-1-866f85f37a599201`, 264159 byte, SHA256 `866f85f37a599201e0fa275ccbd8cad88604f0a3eb373f91f780571b8a0f6ac4`. Sorgenti canonici al commit `6e85cf84aedd94ff04f8dbc572e67b873647eb02`; descriptor SHA256 `8b13cd70a7b904b6b353c496980813a5ca83490981ac385d2aa346b20a82ce9c`, source-manifest SHA256 `19c84d7a79563bd05435adcdb644ca5cfc7f26bea64787786accd9b7d51fa951`. Il solo bootstrap cambiato rispetto a4652 è `verai.provider.js`, SHA256 `238425d44dc5adfd51cbf4d5da882cf690123425a2a62922ace5e5a65b7f9fdc` (10265 byte).

Validazione: 162 test Node superati, inclusi24 di inizializzazione. Verifica indipendente di dimensioni/hash di tutti28 file, provenienza Git degli input bootstrap/builder e uguaglianza integrale dei22 target/runtime con4652. Nessuna connessione BLE o scrittura su orologi durante sviluppo/pubblicazione. Consumo Web/App e migrazione auditata della pratica E075 restano attività distinte dal rilascio GitHub.


## Evoluzione richiesta: Inizializza Bangle da zero — contratto minimo proposto,21ottobre2026

Questa sezione definisce il nuovo motore richiesto; NON descrive una funzione gia implementata da866f e non modifica il pacchetto pubblicato. UI: due sole operazioni, Inizializza Bangle (distruttiva) e Aggiorna Vera (conservativa). Diagnosi e ripresa tecnica non sono ulteriori procedure da scegliere.

### Semantica dell'operazione

Una nuova inizializzazione esplicitamente confermata elimina i contenuti logici precedenti: app, campioni, eventi, profili e impostazioni. Installa base essenziale e Vera da pacchetto immutabile, imposta il quadrante, sincronizza l'orario con Vera e controlla la raccolta. Non preserva il profilo precedente e non lo inventa se il device non ha un utente. Il successivo caricamento di un profilo approvato e distinto e avviene solo se il server lo fornisce. Firmware, identita hardware e registro dei dispositivi non sono oggetto di formattazione. Non si promette cancellazione forense della flash.

Il punto di partenza applicativo puo essere factory, Vera esistente o installazione parziale. La vecchia pratica non deve essere un prerequisito UX: una nuova intenzione distruttiva genera una nuova esecuzione; eventuali precedenti vengono conservati e collegati come superseded, non falsificati o riutilizzati come autorizzazione. Una perdita BLE della STESSA esecuzione deve invece riprendere il checkpoint tecnico senza lanciare una nuova formattazione. In caso di checkpoint illeggibile nessuna cancellazione alla cieca: verifica o nuova intenzione distruttiva esplicita.

### Nuovo contratto, separato dal protocollo866f

Nome proposto `vera-bangle-zero-initialize/1`, mode `zero-initialization`; richiede un nuovo pacchetto/driver e API corrispondenti. Campi minimi del manifest: board, elenco firmware esatto, artifactSHA, file base+Vera con dimensioni/SHA, loader di recupero e relativa integrita, preserveFirmware:true, preserveUserData:false, replaceSettings:true, requiresExistingVera:false. Il JSON dei campioni rimane quello concordato.

Binding di esecuzione: executionId nuovo, deviceId canonico, MAC, board/firmware effettivamente letti, packageSHA, generation/nonce, intent `initialize-from-zero`. Grant server distinti per prepare, wipe-once, install e activate; autorizzazione secondo MaintenanceAccess, scadenza/revoca e consenso distruttivo attuale riferito al MAC. Non si assume firma verificata sul device dove il driver non la implementa. Mai ampliare implicitamente firmware o permessi con una modifica al catalogo.

Checkpoint minimo: executionId/generation/packageSHA, fase, wipeConsumed, indice/insieme cancellazioni completate, staging verificato, installazione verificata, activation e ricevuta finale. Copia locale e copia server/consumer, confronto completo del binding e gestione delle risposte perse. Revocare le autorizzazioni precedenti e impedire due esecuzioni concorrenti sullo stesso device; vecchi token o istanze provider non devono poter continuare a scrivere.

### Sequenza del nuovo driver

1. Lettura non distruttiva di identita/firmware/batteria/capacita e controllo autorizzazione, scelta MAC e conferma perdita attuale.
2. Ingresso controllato nel loader ufficiale di manutenzione e isolamento del software precedente, senza fidarsi di provider o journal gia presenti. Verificare per rilettura tutti i componenti di recupero prima di attivare il percorso di boot. Il trattamento di boot sconosciuti/alternativi richiede implementazione e prove specifiche, non la rimozione della guardia866f.
3. Preparazione e verifica del target e delle risorse necessarie al recupero. Enumerazione normal/StorageFile con memoria limitata; rimozione del limite applicativo128file/64KiB attraverso un nuovo algoritmo, non la lettura integrale degli archivi in RAM. Per cancellare i dati vecchi non serve caricarne l'intero contenuto: i normali e gli StorageFile richiedono API distinte. Restano i limiti fisici di RAM, flash, energia e connessione.
4. Registrazione persistente del wipe-once prima delle cancellazioni. Rimozione dei contenuti precedenti per passi verificabili, preservando esclusivamente il loader, checkpoint e staging di QUESTA esecuzione. Se serve erasure completa dello Storage, progettare un recupero indipendente: eraseAll elimina anche loader e journal salvati nello stesso Storage e NON puo essere aggiunto ingenuamente a866f.
5. Copia verificata della base+Vera, impostazioni nuove, verifica che non rimangano contenuti estranei, commutazione finale all'avvio ufficiale e riavvio.
6. Ricevuta distinta per integrita software, avvio/quadrante, orario e raccolta. La richiesta HRM non prova da sola il battito: osservare campioni nuovi/contatore e timestamp in avanzamento; quando necessario l'utente indossa l'orologio. Un device senza utente non riceve un profilo operativo inventato.

### Limiti verificati del pacchetto866f

Richiede BANGLEJS2/2v29, bootloader e bootupdate ufficiali LF/CRLF; blocca boot alternativi o non riconosciuti. Usa un provider/journal gia coerente con la sua esecuzione: rifiuta un altro binding attivo o un registro corrotto, percio non e un motore universale da zero. Inventario massimo128file, StorageFile letto integralmente con limite64KiB, piano massimo32KiB, riserva flash almeno2*stagingBytes+65536 e controlli di batteria/spazio. Una volta iniziate le rimozioni non puo annullarle: completa la stessa operazione da staging verificato. Se staging o journal sono corrotti serve recupero assistito; non va ripetuta la pulizia.

Prima di promuovere il nuovo contratto servono test da factory, Vera installato, caricamento parziale e journal estraneo/corrotto; oltre128file e StorageFile oltre64KiB; boot sconosciuto/alternativo; flash insufficiente; spegnimento e perdita BLE prima/durante/dopo wipe, copia e attivazione. Una nuova esecuzione confermata puo sostituire quella vecchia, ma una risposta persa non e mai interpretata come nuovo consenso a cancellare. Firmware non supportato, console irraggiungibile o assenza della riserva minima devono restare arresti espliciti: qualunque stato applicativo non significa qualunque guasto hardware.


## Pacchetto zero implementato e congelato - 21 ottobre 2026

Revisione `veranode-zero-1-5b6c77bc76571b8a`, sorgente
`f4f892e3b4a5540fabdab3c8540108f5878eb83e`.
Builder canonico: `bin/build-veranode-zero.cjs`; sorgenti: `initialization/zero/`.
Asset: `dist/veranode-zero/veranode-zero-1-5b6c77bc76571b8a/`.

- initialize.json: `5b6c77bc76571b8ae2e83d614f297d3b1b6ac553c29feee569edbb4b6ec6a5f3`
- descriptor.json: `2684482b67a9bfb1c88e7725fbc24fa8f44d354d369c1361aa830eaf4bf0d327`
- source-manifest.json: `5304ec78af2c5984be4ab92707a9b6ae18c34b6c438b9e1ffe8cbba2e7ea603e`

Schema `vera-bangle-zero-initialize/1`, protocollo 1. Compatibilita stretta
BANGLEJS2 / firmware 2v29. La politica consumer e server abilita soltanto
super_admin o platform_admin sul MAC D1:4D:6D:D2:E0:75, nella pratica corrente.
Il pacchetto non prova un'autorizzazione server da solo: l'installer verifica
MaintenanceAccess, ruolo, MAC, hash e grant prima di ogni scrittura.

Il binding ha esattamente executionId, generation, deviceId, mac, board,
firmware, packageSha256, intent; intent vale initialize-from-zero.
La conferma distruttiva e il consenso fisico attuali precedono beginWipe.
La ripresa conserva executionId e generation e non ripete beginWipe come nuova
operazione. Non riassegna il dispositivo. Aggiorna Vera resta distinto e
preservante: questo pacchetto e esclusivamente l'inizializzazione da zero.

7 file di supporto vengono verificati, poi 22 target sono caricati in staging.
Doppio checkpoint con SHA e sequenza, fase e operazione pendente precedono ogni
modifica. I singoli segmenti StorageFile sono cancellati con nome fisico,
checkpoint e verifica di assenza: la ripresa non dipende dall'esistenza del
primo segmento. Nessuna eraseAll, nessuna lettura integrale dei dati precedenti.

21 target sono installati prima dell'attivazione, con bootcde per ultimo.
L'orario UTC di Vera e applicato nella fase verified prima del primo avvio;
boot0 e scritto per ultimo. Il guard registra la generazione del vero cold boot.
confirm richiede quel riscontro, il quadrante configurato e un collector attivo,
programmato e con richiesta HRM. Non equivale a rilevamento fisico riuscito:
sensorSamplesVerified e clockVerified restano false fino alle verifiche del
consumer. Esso legge tickCount, heartEvents, temperatureReads, lastRecordAt,
nextRecordAt e sampleCount per controllare che avanzino e verifica lo scarto UTC.

Il display ha fase, anello, conteggio reale, attivita periodica, consenso touch
e messaggio di ripresa/errore. Il tasto non chiude la domanda. Il consumer
usa feedbackBootstrapExpression prima dell'upload e uiBootstrapExpression per
montare il consenso dopo la verifica dei moduli, anche su dispositivo di fabbrica.

Verifica locale: 178 test generali piu 5 del pacchetto, 183 superati. Inclusi
interruzione dopo ogni mutazione, archivio con primo segmento gia assente,
consenso factory, vero guard cold boot, checkpoint malformato, 29 hash payload,
provenienza Git e ricostruzione byte per byte dei tre asset. Runtime e contratto
JSON invariati rispetto al pacchetto base 866f; soltanto il boot0 del target
base aggiunge l'esecuzione esplicita del guard.

Nessuna prova BLE o installazione E075 eseguita da questa chat durante questo
rilascio. Vera Web e l'unico proprietario della sessione BLE di verifica fisica;
nessun reset o pulizia aggiuntiva e implicito nel rilascio GitHub.


## Preparazione Vera Node come unica app d'uso - F0AA

Il builder supporta `--dedicated`, selettore canonico
`bin/veranode-dedicated-target.cjs` e configurazione Git
`initialization/zero/dedicated-release.json`. Il profilo `veranode-only` ha
14 target invece dei precedenti 22. I sette supporti di recupero restano separati.

Target esatti: .boot0, .bootcde, boot.info, bootupdate.js, launch.app.js,
setting.json, veranode.clock.js, veranode.app.js, veranode.core.js,
veranode.runtime.js, veranode.wire.js, veranode.img, veranode.boot.js,
veranode.info. Il launcher e un breve rientro in Vera, senza menu di app.
Le app Settings/Launcher standard, i loro registri, icone, impostazioni e
moduli dipendenti sono rimossi. Runtime8file e JSON restano byte identici.

Anagrafica letta da Vera Web: device8, FC:0C:5D:40:F0:AA. Non e ancora una
verifica BLE dell'identita o del firmware. La configurazione candidata ha
executionEnabled=false e hardwareIdentityVerified=false; non va catalogata
come eseguibile finche MAC e firmware effettivi non sono letti. Il vincolo
firmware resta BANGLEJS2/2v29, senza ampliamenti dedotti da un reset o dal
riferimento generico all'ultima versione. La policy resta per amministratori
piattaforma e un solo MAC completo. Il consumer deve validare l'inventario
14 file della nuova release e il suo hash; il pacchetto22 precedente resta
immutato. La preparazione non autorizza una cancellazione fisica.

I test verificano anche rigenerazione del boot Espruino, avvio del vero runtime
e quadrante dai file congelati, visualizzazione iniziale, standby automatico,
HRM e temperatura simulati salvati offline, senza dipendenze Settings/Launcher.
Queste sono prove software in memoria; nessun dispositivo e modificato.
