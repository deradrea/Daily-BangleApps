# Vera Node — nucleo e quadrante 0.2.0

Prototipo di sviluppo per Bangle.js2. Non certificato per allarmi di sicurezza o misure corporee; Installato e verificato parzialmente su Bangle DF:B7:68:30:4C:46 (firmware 2v29): raccolta e persistenza attive. Autonomia e trasferimento end-to-end ancora da collaudare. Anton Clock resta nel repository come riferimento, ma non è una dipendenza del nuovo software. Nessuna modifica firmware.

## Comportamento implementato

- Runtime in boot, indipendente dal quadrante: HRM continuo come nell'attuale raccolta, lettura temperatura del barometro e accelerazione ogni 30 secondi (configurabile 10–45 secondi per questo prototipo).
- La disconnessione non ferma la misura. Campioni persistiti sia online sia offline, senza attribuzione a un utente per supposizione. Profilo assente: scope `unprovisioned`, nessuna regola fisiologica preimpostata.
- Notifiche BLE live compatibili con Vera Mobile: 2a37, 2a1f e accelerometro legacy. La composizione JSON resta interamente in Flutter e non è stata modificata. Magnetometro e sleep non sono simulati né inventati in questo nucleo.
- HRM valido con confidence >= 50; valori assenti/vecchi non ripubblicati come nuovi. Temperatura dal barometro, label del quadrante esattamente **Temperatura**. Non misura la temperatura corporea.
- Display inizialmente spento; una pressione lo accende per 10 secondi dopo 400 ms; un doppio clic a display spento è nullo; due rilasci entro 400 ms, solo se già acceso, lo mantengono acceso; dalla modalità fissa una pressione lo spegne. Retroilluminazione al 70% quando il quadrante è visibile, spenta a display spento. Tempi iniziali da verificare sul dispositivo, non requisiti energetici misurati.
- Un alert locale apre il display e abilita il touch; «Chiudi» scrive una risposta persistente prima di rimuovere l'avviso. Timeout/tasto non segnano visto o risolto. Fino a 8 avvisi nella coda di presentazione; tutti gli eventi restano nel journal fino al limite dichiarato.
- Motore locale dichiarativo: durata, isteresi, qualità/freshness e massimo intervallo fra campioni. Rivalutare lo stesso campione non dimostra persistenza della condizione. Profilo scaduto segnalato; l'ultima regola resta operativa in questo prototipo, senza consentire un aggiornamento scaduto.
- Eventi e risposte recuperabili dopo riavvio; checkpoint duplicati e replay del journal evitano di riaprire la medesima condizione già attiva.

## Persistenza e limiti

StorageFile append-only, CRC per integrità (non autenticazione), checkpoint alternati/readback. Campioni: 8 segmenti da 32 record, massimo 256 record; con intervallo 30 s circa 128 minuti prima di saturare senza recupero. Eventi: 4 segmenti da 16 record, massimo 64 record separati. Sono limiti del prototipo, non l'obiettivo finale di autonomia offline. Il codice interrompe le nuove scritture di campioni a quota/spazio insufficiente, mantenendo sensori e motore alert attivi con stato degradato. Non sovrascrive dati non confermati.

API interne: `VeraNode.samples.readBatch(after, limit)` e `VeraNode.events.readBatch(after, limit)`; ACK con epoch e sequenza per liberare solo segmenti interamente confermati. Il gateway futuro dovrà rispondere esclusivamente dopo persistenza e deduplicazione. Non rispondere con ACK di custodia dopo la sola ricezione Bluetooth. PUBACK MQTT non prova persistenza Vera.

## Profilo e interoperabilità ancora da collegare

`VeraNode.installPolicy(profile, true)` è un hook di sviluppo: il booleano non è un'autenticazione. Richiede un chiamante realmente verificato; al momento non è esposto come caratteristica BLE scrivibile. Sono applicati validazione del MAC/UUID, scope, revisione monotona, scadenza e readback. Il formato è dichiarativo e limitato a battito e temperatura del barometro. Non inserire soglie reali arbitrarie: i valori nei test sono sintetici e non raccomandazioni operative.

Restano da implementare nell'app e in Vera: esportazione autorizzata delle regole utente/mansione; provisioning verificabile/bonding e autenticazione dei comandi; caricamento del profilo via Vera App; trasferimento storico BLE con persistenza mobile; API di sincronizzazione alert/risposte; gestione dei conflitti e modifiche consentite dal quadrante. Queste funzioni non sono dichiarate operative dal solo hook JS.

Il pacchetto di sviluppo mantiene UART per recupero/debug. Non distribuirlo su orologi operativi: UART consente programmazione da client BLE e deve essere protetto o confinato alla manutenzione prima di una release reale. Non contiene password/broker né codice ricevuto dal Web.

## File e installazione di prova

Il metadata è compatibile con App Loader: core/runtime, boot, quadrante e icona. Dopo installazione tramite loader di prova, selezionare Vera Node come quadrante e riavviare per ricostruire il boot. Il boot integra `bleServices` del bootloader, senza far sovrascrivere i servizi live dalla sua configurazione finale.

Il runtime viene ricreato dalle normali sequenze di boot/load; il journal resta. UI remove cancella solo timer/listener grafici e ripristina le opzioni di risveglio precedenti. Le applicazioni terze che modificano servizi/sensori devono essere collaudate prima di garantire coesistenza.

Non installato automaticamente su un orologio non identificato. Prima del collaudo: identificare MAC/modello, leggere firmware/bootloader, confermare il device di fabbrica e la procedura di recupero ufficiale. Nessun firmware personalizzato richiesto.

## Verifica riproducibile

Da `Daily_BangleApps`:

```
node --test test/veranode/core.test.cjs test/veranode/app.test.cjs test/veranode/boot.test.cjs
npx eslint apps/veranode/core.js apps/veranode/runtime.js apps/veranode/boot.js apps/veranode/app.js
node bin/sanitycheck.js
```

Il test Flutter `veranode_compatibility_test.dart` legge fixture prodotte dal core JS e controlla il decoder reale e il JSON attuale. Prove locali non sostituiscono: display/touch fisici, recupero offline end-to-end, affidabilità flash reale, qualità HRM e consumo a parità di carico.

Retroilluminazione del quadrante al 70% quando visibile; zero a display spento. Verificato sul dispositivo il CRC32 del file app aggiornato (1880990383), con journal conservato. Leggibilità finale da confermare dall’utente.

### Revisione quadrante e tasto

Misure su due righe: Battito con cuore e valore grande, Temperatura con termometro; orario secondario e solo ultime quattro cifre esadecimali del MAC senza prefisso (4C46 sul device di prova). Retroilluminazione attivata esplicitamente tramite Bangle.setBacklight, luminosità massima solo mentre il display è visibile. Il display fissato resta illuminato fino allo spegnimento manuale: l’impatto sull’autonomia richiede misura.

Una sequenza di clic ravvicinati è consumata come un solo gesto; dopo doppio clic o spegnimento serve una pausa di 400 ms dall’ultimo clic prima di un nuovo gesto. Una sequenza iniziata da spento resta nulla se contiene almeno due clic; da acceso fissa; da fisso spegne. La comparsa di un alert cancella un clic di risveglio in attesa. 25 test Node passati, incluse raffiche di nove pressioni.

Ultima revisione visiva: nessun pannello di sfondo; battito centrale 44 px, Temperatura secondaria 25 px, orario 14 px. Solo colori pieni supportati dal display (nero/bianco/rosso/ciano), per evitare il dithering dei toni intermedi. Rimosso lo storico grafico inutilizzato dal quadrante; la raccolta e il journal restano invariati.

### Stato di ricarica

Fulmine bianco accanto alla batteria quando Bangle.isCharging() rileva ricarica; indipendente dal collegamento BLE. Aggiornamento immediato tramite evento charging solo se il display è visibile, senza risveglio automatico, animazioni o estensione del timeout. Simbolo presente anche nella schermata alert. Listener rimosso all’uscita dal quadrante. Livello della batteria limitato a 0–100 per evitare disegni fuori area.

Euristiche applicate: stato del sistema visibile, simboli familiari con significato distinto, misure prioritarie, stessa fascia di stato su quadrante/alert, assenza di pannelli superflui e controllo del display affidato all’utente. Prova software: 26 test Node e lint passati.

### Collegamento Bluetooth

Icona Bluetooth ciano quando il link è attivo, bianca e barrata quando scollegato, accompagnata da testo. Stato derivato da NRF.getSecurityStatus, distinto da ricarica e assegnazione Vera. A display acceso toccare lo stato in basso oppure scorrere a sinistra per aprire Bluetooth. Mostra indirizzo BLE remoto (eventualmente privato e variabile), cifratura e associazione; nome non disponibile se non comunicato dal peer. Non presume S21 o PC. Tornare toccando Indietro o scorrendo a destra. Gli alert hanno precedenza; nessuna navigazione riconosce un alert. Le pagine interne seguono lo stesso autospegnimento e non risvegliano il display a ogni connessione.

28 test Node passati: navigazione, indirizzo remoto, nessuna identità inventata, rimozione dei dati remoti alla disconnessione e precedenza alert. Il nome leggibile del telefono/utente da Vera App resta un successivo incremento del protocollo, distinto dall’identità hardware BLE.

### Quadrante centrato e anello del ciclo

Rimossa la label Temperatura dal quadrante (resta negli alert); icone e valori sono raccolti attorno all’asse centrale. Anello blu/ciano staticamente calcolato in 60 segmenti, con aggiornamento massimo una volta al secondo solo sul quadrante visibile. Intervallo e prossima scadenza provengono dal runtime, senza alterare il JSON dei campioni. Il battito viene acquisito continuamente: l’anello rappresenta il ciclo di acquisizione/salvataggio periodico, non ogni evento HRM. Nessuna promessa di campione salvato quando la memoria segnala errore.

Il messaggio authorize accetta peerName opzionale (max 32 caratteri senza controlli), applicato solo dopo cifratura e conferma fisica. Nome volatile: cancellato al distacco, non usato come autorizzazione o assegnazione del device. Vera App lo ricava da manufacturer/model Android o nome iOS; il PC di manutenzione non è etichettato automaticamente. La pagina Bluetooth mostra il nome comunicato, quando disponibile.

30 test Node e 6 test Flutter passati; lint JS e analyzer Dart senza rilievi. Nome reale via App e consumo dell’animazione ancora da collaudare end-to-end.

### Effetti selezionabili

Da quadrante acceso, scorrere verso l’alto per Effetti battito. Ciclo sensori segue l’intervallo del runtime; Cerchio pulsante segue il valore bpm recente; Traccia battito è un movimento decorativo sotto i numeri, non un elettrocardiogramma o una forma d’onda acquisita; Senza movimento elimina il timer di animazione. Navigare tra le anteprime e premere Applica salva in veranode.face.json con verifica di rilettura. Annullare con la freccia in alto a sinistra o scorrendo verso il basso; le frecce orizzontali cambiano anteprima.

Pulse e trace al massimo 4 frame/s, solo nel quadrante visibile; ciclo 1 frame/s. Se il dato cardiaco manca o è vecchio oltre 45 s, cerchio neutro o linea piatta senza battito inventato. Animazioni ferme su pagine interne, alert e display spento. Nessuna nuova vibrazione, suono o attivazione di sensori. Autonomia non ancora misurata comparativamente.

32 test Node e lint passati, incluse selezione/salvataggio, dato scaduto, pausa su pagine interne e assenza di timer nello stile statico.

### Revisione ergonomica e selezione esplicita

La barra inferiore usa tre colonne uguali, con icone/caption allineate: Bluetooth (On/Off), campioni conservati (apre Stato), display (Fisso/10 s). Identificativo, ora e batteria sono distribuiti simmetricamente in alto; le misure rimangono centrate. Stato mostra raccolta, conteggio, ciclo e disponibilità delle regole. Bluetooth: nome, indirizzo e cifratura centrati, testi più grandi, ritorno con pulsante ampio.

Effetti mostra una scelta alla volta: frecce alte 40 px distanziate, Applica separato alto 40 px, nessun salvataggio durante la navigazione. Spazi tra i pulsanti inattivi; tocchi ripetuti entro 300 ms filtrati; uscita dall’anteprima non modifica la scelta. Sul device prima della revisione risultava salvato still (Statico): la vecchia selezione compatta non garantiva una scelta deliberata.

Pulsazione ampliata a raggi 40/42/44/46, tempo relativo all’avvio del movimento; traccia illustrativa attraversa lo spazio sotto il valore in 2.4 s, senza simulare un ECG acquisito. Dato cardiaco scaduto conserva il disegno neutro. 33 test Node passati, con variazione effettiva dei punti tra frame, annullamento dell’anteprima, bounces e aree inattive; lint senza rilievi. Consumi e leggibilità fisica dei nuovi effetti restano da misurare.

### Traccia resa percepibile

Confermato dall’utente il movimento della Pulsazione. La prima Traccia era fisicamente animata (90 pixel differenti tra due frame reali), ma picco piccolo e linea rossa dominante la rendevano poco percepibile. Ampliate larghezza/altezza del picco, tratto mobile rosso a doppio spessore con punto di avanzamento e linea di riferimento blu, attraversamento in 3.6 s. Area dedicata pulita a ogni frame, senza sovrapporre numeri/unità. La traccia resta decorativa, non una misura ECG. Conferma percettiva finale ancora richiesta.

Percentuale di batteria indicativa aggiunta accanto all’icona in alto, con fulmine distinto e percentuale limitata a 0–100; --% se la lettura non è disponibile. 34 test Node e lint passati. Stima di autonomia documentata in vera-mobile/docs/BANGLE-AUTONOMIA-STIMA-2026-10-14.md; non è una prova di scarica.

Doppio clic corretto: passaggio temporaneo→fisso senza nuova chiamata di alimentazione del display né azzeramento della fase animata. Finestra da acceso 700 ms; da spento resta 400 ms, con doppio clic nullo. Animazione riavviata solo quando davvero avviata o cambiato stile, non ad ogni pressione. Gli alert fermano esplicitamente il timer e la chiusura lo ripristina se il quadrante resta visibile. 36 test Node passati, inclusi fissaggio oltre 15 s, nessun reset della traccia e gestione alert.


### Traccia sincronizzata al ciclo di raccolta

La traccia illustrativa percorre il quadrante nello stesso intervallo configurato usato dall’anello, tramite `recordIntervalMs` e `nextRecordAt` del runtime. Sostituisce il precedente attraversamento fisso di 3,6 secondi. Accensione e doppio clic non azzerano il progresso; un ciclo in ritardo mantiene il punto finale fino al nuovo ciclo reale. Senza temporizzazione valida non viene inventato un movimento. La pulsazione resta legata al bpm recente. JSON, campioni conservati e firmware invariati. Verifica locale: 38 test Node superati e lint del quadrante superato; la verifica visiva del nuovo tempo sul dispositivo resta da completare.


### Recupero avvio con archivio pieno

Il caricamento verificato tramite CRC non conferma l’avvio del runtime. Sul Bangle reale sono state rilevate interruzioni del tasto e sospensione nel debugger durante la verifica CRC16 dell’archivio. La verifica di un record da 341 byte ha richiesto circa 0,46 secondi: il controllo completo di 256 record ritarda l’avvio. Sono state mantenute le verifiche e aggiunti indici opzionali per segmenti completi: metadati con CRC16 ed epoch, più CRC32 nativo e lunghezza del contenuto integrale, ricalcolati ad ogni avvio. Se contenuto/indice cambiano, viene ripetuta la lettura completa; errori di cache non cancellano né nascondono i record. L’indice viene scritto solo alla chiusura del segmento o al primo recupero verificato, senza una scrittura aggiuntiva per ogni campione. Il primo avvio dei dati preesistenti deve comunque terminare il controllo completo. Nessun ACK o cancellazione eseguiti. JSON e timestamp invariati. Funzioni CRC e recupero eseguite in RAM; nessun JIT sperimentale incluso nel pacchetto.

Caricati e verificati: core 19423 byte CRC32 2984587022; runtime 12112 byte CRC32 3920487925; boot 3451 byte CRC32 1592322200; quadrante 19376 byte CRC32 3323733491. Test locali: 40 superati; collaudo avvio fisico in corso.

Esito fisico del ripristino: primo recupero completo terminato, `running:true`, 256 campioni e otto indici `veranode.s0idx`–`veranode.s7idx`. Un secondo `load()` è stato eseguito senza modificare i dati: nuova connessione e risposta diagnostica entro il timeout di 20 secondi, `running:true`, 256 campioni. Conferma del risveglio del quadrante tramite pressione breve ancora richiesta all’utente. L’archivio resta pieno e non è stato liberato.


### Risveglio quadrante dopo blocco di sistema

La conferma della raccolta attiva non prova il risveglio del display. Dopo l’avvio il dispositivo reale risultava `lcd:false`, `light:false`, `locked:true`, con tasto rilasciato e UI installata. L’utente ha confermato il messaggio di prova acceso via BLE, escludendo in questa prova il guasto di display/retroilluminazione. Il quadrante ora sblocca esplicitamente dopo setUI e gestisce gli eventi lock tardivi finché la UI è attiva; il listener viene rimosso all’uscita. Display e backlight restano spenti in standby; nessuna animazione nascosta o wake automatico aggiunto. Test di regressione su blocco tardivo, risveglio, autospegnimento e cleanup: 41 test complessivi superati. Conferma del tasto reale dopo l’installazione ancora necessaria.

Conferma fisica utente, 14 ottobre 2026: «Sì, ora si accende» dopo pressione breve del tasto sul Bangle DF:B7:68:30:4C:46. Risveglio del quadrante confermato con app CRC32 4284460266. Questa prova conferma il risveglio; non estende il collaudo a recupero offline, invio Vera o autonomia.

### Gestione BLE locale e compatibilità Espruino — 15 ottobre 2026

La pagina Bluetooth del quadrante offre Scollega/Disattiva BLE e Consenti collegamento. La sospensione usa NRF.sleep, impedisce la riconnessione e viene conservata in veranode.ble.json; la riabilitazione usa NRF.wake. La raccolta offline continua. Non vengono cancellati i legami Bluetooth del sistema. L'utente ha confermato la visualizzazione Disponibile; il ciclo fisico sospensione/riabilitazione resta da collaudare.

La prova reale S21 ha isolato un problema non rilevabile con i soli test Node: sul firmware Espruino 2v29 le ripetizioni limitate nelle espressioni regolari non riconoscevano UUID e identificativi validi. Confermato direttamente sul device confrontando la vecchia espressione con la variante compatibile. Corrette le validazioni RPC e profilo/regole, mantenendo limiti di lunghezza e formato UUID v4. Aggiunti test per identificativi RPC e controllo dei literal regex mediante parser. 44 test Node e lint dei quattro componenti superati.

Caricamento verificato: core 19832 byte CRC32 1674229583; wire 6731 byte CRC32 2532753997. Dopo il riavvio: running=true, BLE abilitato, 256 campioni ancora conservati. Nessun ACK o cancellazione eseguiti. Il consenso e la lettura diagnostica end-to-end dall'S21 sono ancora in collaudo; il caricamento CRC non ne costituisce conferma.

Ulteriore verifica fisica: la richiesta mobile veniva riconosciuta (authorizations=1) ma il consenso falliva perché Number.isInteger non è disponibile su questo firmware. Sostituito con controllo numerico finito e Math.floor; stessa correzione per la revisione del profilo. Separati errori di parsing da errori interni del gestore, con revoca dell'autorizzazione e risposta generica senza contenuti della richiesta. Test aggiunti: ambiente senza Number.isInteger, limiti UUID/regole, comparsa e scelta esplicita del consenso sul quadrante. 47 test Node superati, lint superato. Verifica diretta sul Bangle: validatePresentation restituisce question, running=true, 256 campioni. CRC finali caricati: core 19910 byte 2436736567; wire 7266 byte 2021640148. Conferma end-to-end da S21 ancora richiesta.

### Esito recupero fisico e aggiornamento S21 — 15 ottobre 2026

APK 1.0.92 aggiornato con adb install -r, SHA-256 68716A15EB978AA324F9EF4892360DEEBBAAC836428F6849CD2BAFE79D578F50. Account e selezione del Bangle DF:B7:68:30:4C:46 presenti dopo aggiornamento. Nuovo consenso fisico approvato dall'utente. Ripresa dal cursore persistito 212, conclusa con 86 ulteriori campioni conservati sul telefono: totale 298, inclusi tutti i 256 iniziali e quelli aggiunti prima della nuova fotografia d'archivio. L'app ha concluso l'operazione ed è tornata disponibile al comando Recupera dati conservati. Snapshot finale alle 12:03: raccolta Attiva, 13 campioni ancora da recuperare, 0 eventi, nessuna revisione regole comunicata. I 13 sono dati successivi al gruppo fotografato per il recupero: la raccolta continua, non si tenta di inseguire indefinitamente la coda.

Tutti i campioni della prova erano precedenti alla configurazione utente/fuori contesto: custodia locale separata, zero inseriti nella coda di invio. Nessuna attribuzione automatica e nessuna prova di registrazione backend o di analisi/alert reali. JSON originale conservato nel record di custodia. Prova di ripresa dopo interruzione e dopo aggiornamento APK completata; prova automatica di perdita risposta coperta dai test software, non da un guasto radio iniettato fisicamente. Il primo trasferimento lento e interrotto resta un limite osservato, non viene descritto come collaudo continuo riuscito.

Evidenze locali: build/s21-gestione-status-92.png e build/s21-gestione-recovery-92.png. Test finali: 15 Flutter mirati e 48 Node Bangle superati, analisi Dart e lint Bangle senza rilievi. Firmware 2v29 invariato. Nessuna pubblicazione Play eseguita in questo intervento. Diagnostica estesa (batteria/firmware/spazio), visualizzatore dei campioni separati, inventario e installer app Bangle restano sviluppi successivi.

Conferma fisica utente, fine collaudo 15 ottobre 2026: dalla pagina Bluetooth del Bangle la sequenza Scollega/Disattiva BLE → BLE sospeso → Consenti collegamento funziona («Sì, sospende e poi riabilita il Bluetooth»). La funzione controlla connessione e riconnessione locale; non cancella i bond Android/Espruino. L'S21 è stato lasciato con Vera aperta sulla Gestione del Bangle. Selezione mobile salvata immediatamente e persistente, preferenza centrale Vera Web ancora non sincronizzata.

## Ottimizzazione trasferimento e archivio consultabile — 1.0.93, 15 ottobre 2026

Bangle: Journal mantiene un solo lettore volatile del segmento, senza cache di batch e senza scritture flash aggiuntive. Nei trasferimenti sequenziali il file non viene riaperto per ogni batch. CRC16 obbligatorio per ogni record restituito; richieste ripetute o arretrate riaprono la lettura, mentre append al segmento, variazioni dei metadati, cancellazione dopo ACK, errore e riavvio invalidano il cursore. Custodia e checkpoint invariati, nessun aumento della frequenza dei sensori o del display. Test da 256 record in batch da quattro: 256 letture di record contro 1152 del precedente algoritmo. 50 test Node superati e lint del nucleo superato.

Confronto fisico sul Bangle.js2 DF:B7:68:30:4C:46, firmware Espruino 2v29: 22 medesimi campioni, sequenze 299–320, in batch fino a quattro. Tempo aggregato misurato con Date.now attorno a readBatch: prima 100336,21 ms, dopo 22876,04 ms (-77,20%). Misura della sola lettura/elaborazione nel device, non del tempo totale UI/BLE né dell'autonomia in ore. ACK rimasto 298 in entrambe le prove, nessuna cancellazione; running=true. Nucleo ottimizzato installato e verificato: 20689 byte, CRC32 1462060033. Backup precedente locale conservato (CRC32 2436736567). Risultati numerici in build/bangle/transfer-benchmark-before.json e transfer-benchmark-after.json.

Mobile: Device → Gestione → Dati → Consulta campioni recuperati apre l'archivio locale, senza BLE, polling o invii. Pagine da 25 record (massimo 50 nel lettore), ordine ultimi recuperati, ricerca e filtri esplicitamente sui campioni caricati, dettaglio delle misure e JSON originale copiabile. Account/origine/azienda/MAC delimitano l'indice; chiavi estranee rifiutate prima della lettura e contesto ricontrollato dopo ogni attesa. Al cambio account/assegnazione il contenuto viene nascosto, anche nel dettaglio. I campioni di altri contesti mostrano solo stato e metadati, con misure e JSON nascosti. Dati preconfigurazione consultabili separatamente e mai riattribuiti dal visualizzatore. Record mancanti o illeggibili segnalati, senza cancellazioni. Per i nuovi salvataggi si conserva la data di recupero e il motivo della separazione nel solo involucro locale; source e JSON legacy invariati. Per i precedenti la data di recupero non viene inventata.

Verifiche locali: 21 test Flutter mirati superati (gateway, archivio, widget, scelta device), analisi dei sei file controllati senza rilievi. Build e prova visiva S21 della 1.0.93 in corso. Nessuna pubblicazione Play in questo intervento.

### Chiusura verifica 1.0.93

APK finale installato sull'S21 con adb install -r: versionName=1.0.93, versionCode=93, SHA-256 A947D940D7815F2961DE9E7A07396ABECB31FF1EFB19C9F66D909884198C8B2A. Account, selezione e 298 record precedenti preservati. Verifica UI fisica dell'archivio: 25 record caricati su 298, filtri su riga orizzontale, apertura del campione 298, stato Separato/non inviato, Data da verificare. Valori visualizzati 79 bpm e Temperatura 30.2 °C; controllo del pannello JSON originale conferma presenza di 30.15801493325 e pulsante Copia JSON originale raggiungibile. Nessuna modifica del campione e nessuna copia automatica negli appunti eseguita. S21 lasciato aperto nell'archivio.

Simulatore ricompilato e servito dal server locale già attivo: HTTP 200 su http://127.0.0.1:8766/ e version.json con versione 1.0.93/build 93. Questa è verifica di build/servizio, non una nuova prova BLE nel browser: l'archivio del telefono resta locale al telefono. Build APK e Web completate; nessuna pubblicazione su Google Play. Prova fisica dell'ottimizzazione limitata alla lettura non distruttiva del gruppo di 22 campioni sul Bangle; non ripetuto in questo intervento un nuovo recupero completo app→custodia→ACK, già collaudato nella 1.0.92. Beneficio di autonomia in ore ancora da misurare con prova di scarica.


## Clock provenance sidecar

`clock.js` adds a bounded CRC journal (`veranode.t`, 4 segments × 16 records), separate from sensor JSON. `clock` reads state; `clock_sync` requires encrypted management consent, expected time epoch/boot/revision, UUID syncId, phone_auto UTC and timezone offset. It records sync_intent before setting time and sync_applied after readback; a failed/torn operation remains uncertain. Full audit blocks sync, not acquisition. Duplicate successful sync IDs are idempotent; clients must not automatically retry writes after timeout.

Status advertises clockTracking/timeEpoch/timeHigh/timeAck. `batch`/`ack` accept stream clock with the same durable-custody contract. Recover clock before samples. Boot and observed wall-clock discontinuities require revalidation; 24 h is an operational recheck policy, not measured RTC accuracy. UTC is authoritative for new measurements; timezone offset only controls local display (no offline DST rule). Phone AUTO_TIME and a fresh post-write offset comparison are checked by mobile. No new sampling timer, polling or per-sample audit flash write. Existing records and legacy sensor JSON remain unchanged. Corrections of historical timestamps are not implemented.


## Management capacity snapshot

`status` remains protocol 0.2.0 and adds optional `buffers` (`samples`, `events`, `clock`), each with capacity/stored/pending/available/full. `available` is append capacity, not capacity minus pending: acknowledged partial segments and sealed torn tails may still occupy quota. Journal.stats performs no record reads or flash writes. Existing high/ack/epoch fields and sensor JSON are unchanged. recordIntervalMs, recordingBlocked, storageError and contextConfigured explain acquisition readiness. Optional hardware reports board, firmware, batteryPercent, charging and storageFreeBytes; hardware lookup failure leaves management usable (hardwareError). No independent uptime is claimed. Legacy clients may ignore these fields.

Defaults remain 256 samples, 64 event rows, 64 clock rows. At 30 s, a completely empty sample quota covers roughly 2 h 8 min; this is storage capacity, not battery life. At full quota acquisition continues but new records cannot be preserved; unacknowledged records are never overwritten. A longer offline quota requires migration/resource/rollback testing before adoption.

## Offline day quota (16 October 2026)
Runtime sample quota now reserves 24 hours at the configured 10–45 s cadence plus two 32-row segments. Default 30 s: 2944 records (24 h 32 min from empty). Existing rows, epochs and legacy sensor JSON are retained. Core discovers higher numbered StorageFiles when the cadence/quota decreases; no additional per-record write was added. Older cores do not discover segments beyond their own scan bound: drain the archive before downgrading to a pre-expansion core. Flash/battery availability and torn segments still limit actual duration; this is not a measured battery-life guarantee. Node tests simulate 24 h at all three supported reference cadences, reboot and readback, migration from 256 records and quota reduction. Physical 24 h soak remains required.
Mobile recovery now always checks clock first; phone automatic UTC is authoritative, existing timestamps remain unchanged. Accidental mobile link loss retries with bounded backoff while explicit app disconnect stays paused. Recovery remains guided and requires physical management consent.

## Internal menu and recording pages (local development)

Wake with the side button, then swipe down or touch the menu icon beside the short identifier. The menu offers Recording (Raccolta), Bluetooth and Settings (Impostazioni). Settings contains Effects, Profile and Clock. Each menu row is 160 by 44 pixels with a 5-pixel inactive gap. Back returns to the previous page; switching the display off resets navigation to the clock. Existing left-swipe Bluetooth and up-swipe Effects shortcuts remain.

Raccolta distinguishes active acquisition, stopped acquisition and blocked saving. It shows Offline when there is no BLE link, or BLE collegato when there is a link. A BLE link is not proof of a Vera Mobile session, Internet availability, MQTT delivery or platform receipt. The latest cycle age describes an acquisition attempt, not a guarantee that a record was saved; memory failures take priority over that label.

The transfer-count button opens Memoria: pending samples awaiting custody acknowledgement, retained samples and actual append capacity are distinct counters. ACK of transfer to the app does not mean ingestion by Vera. Acknowledged partial segments can remain on flash, so free slots must come from Journal.stats().available, never capacity minus pending. UI snapshots use cached counters and add no flash writes, record scans or off-screen polling. Alerts/physical consent retain priority over menu navigation; the existing one-button/two-button display behavior is unchanged.

This UI update changes only app.js. The acquisition runtime, journal format, cadence, RPC protocol and mobile JSON serialization are unchanged. The same legacyPayload function composes live and recovered wearable samples. Offline recovery preserves the original measurement timestamp, excludes stale/low-quality values and leaves unavailable badge/phone fields null. Rows with uncertain time or another context remain separate rather than being sent as new data. The optional client_event_id field is an existing, capability-gated mobile receipt feature, not a sensor schema change introduced here.

Validation: 68 Node tests and 20 focused Flutter gateway/telemetry tests passed. Includes simulated 24-hour retention at 10/30/45 seconds, reboot/readback, original timestamps and JSON keys, menu hit targets, back navigation, memory counters, display-off behavior and alert priority. Physical 24-hour battery/retention/recovery validation is still outstanding.

Installed on DF:B7:68:30:4C:46 on 16 October: app.js 24924 bytes, CRC32 286565106. Runtime/core CRCs unchanged (4054942114/1872718263); firmware unchanged. Initial live replacement failed because old callbacks referenced the replaced flash source (Function code is null). A controlled software restart restored operation; staging alone does not make overwriting executing flash safe. The update helper now detaches the old UI before replacing its file. Backup veranode.ui.bak retained. Original archive epoch remained mv7u5zob.yr2j4isbk; high sequence advanced 1680 to 1685, retained 464 to 469, pending 439 to 444. After restart acquisition was active, heart 70 bpm/quality100 and temperature 32.43 degrees. The update is not a demonstration of uninterrupted acquisition; the error/restart window was not quantified. Clock trust must be revalidated through the app before a new physical 24-hour trial. Button navigation/legibility await the user's on-device confirmation.

Preview: node bin/preview-veranode.cjs, then py -3.12 bin/render-veranode-preview.py. Uses actual app drawing commands with synthetic data; Arial approximates the device Vector font. Output is under vera-mobile/build/bangle/ui-preview, with layout overflow results. It is not a hardware screenshot.

### Legibility revision after physical feedback

User reported that the first menu was visible but hard to read. Menu labels now use Vector20, collection states18/22 and secondary lines16, pending count36, memory details16; effects and profile use shorter labels and larger text. BLE peer names use measured Vector16 width with word wrapping and explicit truncation after two lines; address/footer use14 instead of10/12. Long Bluetooth enable wording replaced by Abilita BLE. Navigation and sampling logic unchanged. The software preview has no text overflow (approximate font); on-device legibility still requires human confirmation. All69Node tests pass, including bounded long BLE names. The CRC-corruption fixture now targets sequence4 explicitly rather than replacing the first occurrence of random digits in the archive.

This revision is installed: app25298bytes, CRC32150722076; runtime/core unchanged. Old UI detached before commit, no software restart required. Helper verification parsing failed on the console prefix after successful activation; a separate direct read confirmed the expected CRC, running collection and the same archive epoch, with high1698->1702 and pending457->461. Helper parsing now uses a dedicated snapshot marker. Staging removed after verification; backup retained. User legibility confirmation remains pending.

Physical user confirmation after this revision: recording/memory states, counters and text are now readable on the Bangle. No further device changes or new 24-hour trial started with this confirmation.

### Management consent from standby

User reported that pressing the side button appeared to cancel a question from a dark display. The consent UI now wakes and stays lit while the request is valid, rather than inheriting the ordinary20-second alert display timeout. The protocol still expires/cancels authorization after60seconds or link loss. Side-button gestures only reveal/preserve the pending consent; only explicit Si/No touches decide. Touch targets match the enlarged visible buttons, excluding the centre gap and margins. A400ms guard ignores touches overlapping display wake or a side-button gesture. Cancellation returns to the previous display state without fabricating a response. Ordinary one-button alert dismissal is unchanged.

73Node tests pass, including standby/timeouts, button gestures, deliberate Yes/No, edge/gap touches and external cancellation. The wire expiry test confirms that a late Yes after60seconds cannot authorize. Hardware validation uses a real management request, not a synthetic authorization. Existing recovery/clock work remains pending until physical consent succeeds; no new24htrial has started.

Physical retest failed: the user reports that a side-button press still returns to the clock. The previous test result is not hardware acceptance. Added coverage for a capacitive touch occurring while the button is held (previously only the post-release guard was checked): consent touches are ignored throughout the button hold and for400ms after release. A RAM-only trace of at most16 events records presentation, button down/up, ignored/accepted touch, external cancellation and UI removal, without user identity or flash writes. This is diagnostic evidence, not an authorization bypass.75tests pass; the new revision still needs installation and physical confirmation. Recovery/time synchronization and the new24htrial remain pending.

Follow-up installation: app27677bytes, CRC32991969800, with the same core/runtime hashes. Startup now shows the face for10seconds once per runtime boot before returning to standby; pending consent/alerts take precedence.77tests pass. A controlled software restart was followed by a successful independent UART read: correct app, readiness flag true, acquisition running, same sample epoch,869stored/844pending, no JavaScript error flags, LCD off and unlocked in standby. Fresh WinRT service discovery timed out after restart; a cached-services read succeeded with the unchanged service contract. This confirms restart of acquisition/UI initialization, not physical button/consent acceptance. The user must still validate those interactions before recovery and a new24htrial.

2026-10-17 follow-up: a physical trace showed a consent presentation followed by external cancellation after60.05seconds, with no button/touch event during validity. The old off path retained the authorization framebuffer. The UI now clears that framebuffer before LCDoff and shows Request terminated/Riprova da Vera on the next wake after external cancellation. An intentional Yes/No does not produce this notice. A still-valid consent explicitly powers LCD/backlight on presentation and button gestures and restores an external lcdPowerfalse event; this adds no offscreen polling or flash writes. The60second protocol deadline and physical-touch authorization remain unchanged.79tests pass, including expired image removal, termination notice and external LCD power loss. Physical acceptance and recovery remain pending; no data erase or24hstart is implied by this change.


## Shared package audit - 19 October 2026

The previous candidate `veranode-0.2.0-dev-59a749e1503a6019` is superseded and must not be selected for new initialization. Its immutable bytes remain available for audit, not as a recommended install.

Startup is now transactional: an HRM startup exception or scheduling failure rolls back the running flag, requested power, event subscriptions and collector timer. A later explicit start can retry without duplicate listeners. `health()` exposes schemaVersion=1, running, scheduled, hrmRequested, maintenancePaused, recordingBlocked, tickCount, heartEvents, temperatureReads, temperatureFailures, lastRecordAt, nextRecordAt and startError. Counters live only in RAM; no extra flash write, polling interval or fake measurement is introduced. `status.acquisitionHealth` exposes the same snapshot through the existing authenticated management protocol. Sensor sample rows and legacy BLE frames remain unchanged.

Initialization must validate MAC, exact file hashes, app name, boot failure status AND health: running/scheduled/hrmRequested true, tickCount >= 1, maintenancePaused/recordingBlocked false, startError null. This validates collector startup, not physical sensor accuracy. A numeric heart reading must not be invented or required from an unworn watch. A deliberate maintenance pause is a distinct state, not active recording.

The software integration test executes boot, clock UI and modules decoded from the generated package; it checks HRM and temperature ingestion, offline journal continuation, unchanged legacy frames, UI removal, BLE disconnection and explicit pause/resume. These are simulated hardware tests. No physical watch was accessed, reset, updated or cleared during this audit; no 24-hour trial was started. The previous Web `signal timed out` report did not identify a failing phase, so it cannot be attributed conclusively to this startup defect. Web owns wizard diagnostics, deployment and catalog revocation/promotion. Candidates remain test-only and hardwareValidated=false.


## Candidato UI e revisione del 20 ottobre 2026

Il candidato locale `veranode-0.2.0-dev-89e15f0bf2380395` conserva il formato dei campioni e dei frame BLE. Include pagine interne riviste, quadranti selezionabili, dettagli batteria, inventario di avvio indicizzato e ACK duplicati senza riscrittura del checkpoint. I metadata comprendono i segmenti con indice fino a 511.

Generazione: `node bin/build-veranode-release.cjs`. Il builder produce un pacchetto immutabile con otto file, registry e inventario dati, provenienza, licenza e SHA-256. Verificare il risultato anche con il parser dell'app (`vera-mobile/flutter-app/tool/verify_bangle_candidate.dart`) prima di proporlo al catalogo condiviso.

Questo candidato rimane di sviluppo, first-install-only e non collaudato fisicamente. Non sostituisce il pacchetto c212 già approvato, non autorizza upgrade conservativi o reset e non abilita la cancellazione amministrativa. Il PIN personale viene gestito da Vera Web; autorizzazione verificabile dal Bangle, transazione di cancellazione e modello di accesso UART restano blocchi espliciti. Nessun PIN predefinito o locale può sostituirli.

Rapporto completo: `vera-mobile/docs/BANGLE-REVISIONE-CANDIDATO-2026-10-20.md`. Il collaudo fisico di 24 ore rimane sospeso.
