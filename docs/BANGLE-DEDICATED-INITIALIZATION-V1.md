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

Release canonica: `veranode-initialize-1-54eef6a1037274d8`, SHA256 `54eef6a1037274d8656cf5a63aad31586d347f051857c23085da9576d620e9e9`, 263156 byte. Gli asset precedenti 3245 e 536e rimangono storici e non vanno catalogati.

Il sistema base viene costruito da `git show <sourceCommit>:<path>`, non dai byte CRLF del checkout Windows. `baseSources.sourceState` e `git-tree`. Il decoder di icone e nel submodule ufficiale: `baseSources.externalSources['webtools/heatshrink.js']` dichiara repository, commit, path e SHA256. Il suo commit deve corrispondere al gitlink `webtools` del commit radice. Tutti i 23 input sono stati verificati come Git blob esatti, senza normalizzazione nel consumer.

Il provider riconosce solamente i digest LF e CRLF dichiarati dello stesso bootloader e bootupdate standard. Il target usa i sorgenti Git ufficiali LF; non ammette altri bootloader. Il recupero avvia la propria UI da `.boot0`, anche se `.bootcde` non puo essere eseguito, mantenendo UART per riprendere il piano. Il test di questa condizione e in VM, non su hardware.
