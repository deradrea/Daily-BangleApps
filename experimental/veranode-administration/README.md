# Amministrazione campioni: candidato sperimentale

Stato al 20 ottobre 2026: implementazione e test locali, esecuzione reale disabilitata.
Nessun modulo di questa cartella è importato dal boot/runtime attivo o esposto da un comando BLE.
Il Bangle fisico non è stato modificato. Il collaudo di 24 ore resta sospeso.

## Percorso previsto per l'utente

1. Aprire Gestione Bangle → Memoria → Amministrazione campioni: prerequisiti letti automaticamente.
2. Controllare device, totale, quota non trasferita ed effetti della cancellazione.
3. Inserire il PIN personale dell'amministratore e dare una sola conferma esplicita.
4. Attendere controllo server e futura verifica della firma sul device, con fase e conteggi reali.
5. Leggere l'esito riletto dal dispositivo, oppure «Esito da verificare» dopo un'interruzione.

Questo è il flusso previsto: il comando distruttivo e la firma server non sono attivi.
La pagina mobile corrente resta di consultazione. Con prerequisiti bloccati, non chiedere
un PIN per una cancellazione già dichiarata indisponibile. Nessun PIN offline sul watch.
Il PIN è personale per account amministrativo, non per device o condiviso per ruolo;
il servizio Web applica i permessi e il perimetro aziendale a ogni richiesta.
Il PIN non viene incluso nella firma, nei registri o nel software dell'orologio.
L'eventuale consenso per aprire la sessione BLE resta un controllo distinto e necessario.
Una variazione dello snapshot prima dell'intent richiede di rileggere e mostrare il riepilogo;
la finestra breve della firma non deve consumarsi mentre l'utente sta leggendo.

Il servizio PIN è stato pubblicato, come confermato dalla chat Vera Web sul commit
65607b6cc56c75e3f0dcb070f860716455d98aaf: erase_samples=0, device_authorization=0,
execution_enabled=false. Non si converte la ricevuta PIN di 120s nel grant sperimentale di 60s.
La revisione coordinata completa e i blocchi di rilascio sono in
`vera-mobile/docs/BANGLE-AUTORIZZAZIONE-CANCELLAZIONE-2026-10-20.md` nel workspace condiviso.
Resta da definire come verificare provisioning, binding, console/UART, nonce e timer;
il MAC e un messaggio dell'app non sono attestazioni hardware.

## Contratto proposto a Vera Web

La chiave privata Ed25519 resta sul server. Il dispositivo riceve la sola chiave pubblica
con un provisioning fidato, non tramite un campo libero nel comando ricevuto.
Il controllo online di ruolo, PIN, revoca e assegnazione resta responsabilità di Vera.
L'orologio verifica la firma; non verifica direttamente il PIN dell'amministratore.
Non è un nuovo endpoint già rilasciato. Il servizio PIN esistente resta separato.

La busta contiene esattamente `body` e `signature` (firma hex minuscola, 64 byte).
Le proprietà del body, nell'ordine canonico, sono:

```
v, issuer, keyId, operationId, mac, userUuid, companyId, assignmentId,
scope, epoch, high, stored, pending, planHash, nonce, counter,
issuedAt, expiresAt, clockRevision
```

I byte firmati sono ASCII JSON di un array con prefisso
`["vera-bangle-erase/1","Ed25519","erase_samples", ...valori]`.
Nessuna dipendenza dall'ordine delle proprietà JSON ricevute; proprietà aggiuntive respinte.
MAC maiuscolo; UUID e hash minuscoli. Timestamp UTC in millisecondi.
Nonce 32 byte, contatore persistente crescente, scadenza massima 60 secondi.
Il server può restringere la finestra temporale, mai ampliarla.
Il controllo conservativo include l'incertezza del tempo: con incertezza positiva
l'inizio deve ricadere interamente nella finestra firmata, non basta che il valore centrale vi ricada.
Il clock verificato e il contatore monotono sono dipendenze richieste, non ancora adattatori hardware.
La challenge non è persistita: dopo riavvio non si può iniziare con una vecchia risposta.

`planHash` è SHA256 del JSON array di tuple `[nome,count,last,hash]`;
`hash` è SHA256 delle righe raw complete con il newline, ogni record verificato per CRC/epoch/seq.
Un nuovo campione, ACK o piano diverso prima dell'intenzione richiede una nuova verifica.
Il prototipo limita il piano a 96 segmenti, massimo 32 record ciascuno (3072 record).
Archivi più grandi sono rifiutati integralmente, non cancellati in parte.
Non promette una quota di 24 ore per ogni intervallo di acquisizione.

## Interruzioni e semantica dei dati

- Registro alternato `erase0` / `erase1`, riletto dopo scrittura.
- Un'intenzione durevole blocca append, lettura batch e ACK del journal interessato.
- Un passo elimina al massimo un segmento; l'adattatore futuro dovrà cedere il controllo
  tra passi e presentare avanzamento, senza bloccare l'interfaccia.
- Il riavvio mantiene il blocco anche se l'interruzione precede il checkpoint dei cursori.
- La ripresa riverifica firma, binding, piano e contenuto dei segmenti ancora esistenti.
- Una transazione già accettata può essere completata dopo la scadenza; una nuova non può iniziare.
- Non è una cancellazione atomica istantanea: un'interruzione può lasciare segmenti già eliminati,
  con intenzione persistente e ripresa obbligatoria prima di riutilizzare l'archivio.
- `sampleAck` resta la conferma di custodia. `sampleDiscardedThrough` è il limite cancellato.
  App e journal riprendono da `max(ack, discardedThrough)`; le sequenze non ripartono da zero.
- Nuovi campioni successivi non sono cancellati ripetendo una vecchia richiesta completata.
- Profilo, eventi, tracciatura temporale e JSON delle misure restano separati.
- La ricevuta ha `hardwareAttested:false`: è un esito dichiarato dal client, non un'attestazione hardware.
- Il CRC dei registri individua corruzione accidentale, non attacchi con accesso fisico alla memoria.
  Rollback ostili della flash e secure element non sono risolti da questo prototipo.
- È cancellazione logica tramite StorageFile; non è una garanzia di cancellazione forense della flash.

## Crittografia, provenienza e limiti

TweetNaCl.js 1.0.3 è conservata invariata con licenza e provenienza npm.
L'integrità SHA512 del tarball è stata verificata prima dell'estrazione.
Il wrapper esporta solo verifica; nessuna firma o generazione casuale viene esposta.
Il controllo aggiuntivo rifiuta firme con scalare S non canonico.

```
node experimental/veranode-administration/build-verifier.cjs
node --test test/veranode/administration.test.cjs
```

L'artefatto `evaluation/verifier.js` è di valutazione: `installable:false`,
`releaseReady:false`, `hardwareValidated:false`, `executionEnabled:false`.
Il controllo sintattico ES5 e la VM Node senza require NON provano esecuzione Espruino,
RAM disponibile, autonomia o latenza sul Bangle. Nessuna funzione nativa di verifica è assunta.
Prima dell'abilitazione servono provisioning/rotazione chiavi, fonte nonce sicura verificata,
clock monotono e ora affidabile, controllo console/UART, misure memoria/tempi e contratto server.
`E.hwRand()` non viene trattato per assunzione come CSPRNG.
Non si può abilitare il protocollo impostando solo un flag sulla UI.

Fonti primarie: https://github.com/dchest/tweetnacl-js e https://www.espruino.com/ReferenceBANGLEJS.
