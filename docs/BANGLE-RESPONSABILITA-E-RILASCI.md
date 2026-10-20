# Bangle / Vera Node: responsabilità e rilascio

Decisione dell'utente del 20 ottobre 2026. Questa regola sostituisce eventuali
accordi precedenti che assegnavano interventi sul software Bangle a Vera Web.

## Responsabilità

La chat Vera Mobile (titolo attuale: Vera Moble) gestisce integralmente il software
Bangle: progettazione, Vera Node, quadrante e pagine, raccolta sensori, archivio
offline, protocollo BLE lato orologio, orario, regole locali, diagnostica,
autorizzazione verificata sul device, test, ottimizzazioni, builder, pacchetti,
versioni, commit, push, tag e pubblicazione delle release GitHub.
Anche la gestione del Bangle nell'app mobile viene sviluppata in questa chat.

La chat Vera Web non modifica codice eseguito sul Bangle, copie del runtime,
manifest generati, builder o pacchetti. Non ricostruisce né pubblica release
Bangle su GitHub. Mantiene API, autorizzazioni, catalogo e pagine/trasporto BLE
dell'installer Web come integrazione dei pacchetti prodotti dalla chat Mobile.
I problemi del software dell'orologio vengono inoltrati alla chat Mobile per
la correzione e la pubblicazione di una nuova revisione.

## Fonte unica e distribuzione

- Repository canonico: https://github.com/deradrea/Daily-BangleApps
- Sorgenti Vera Node: apps/veranode/.
- Generatore: bin/build-veranode-release.cjs.
- Artefatti: dist/veranode/<revisione>/package.json e source-manifest.json.
- Pubblicazione: commit, tag e asset della release GitHub gestiti da questa chat.
- App e Web consumano gli stessi byte, con revisione, SHA-256 e provenienza
  verificabili. Le copie distribuite non sono una seconda fonte di sviluppo.
- Vera Web può aggiornare il catalogo per rendere disponibile una release
  pubblicata qui, senza modificarla o rigenerarla. Se servono modifiche al
  pacchetto, si richiede una nuova revisione a questa chat.
- Una modifica alla documentazione non ricostruisce un artefatto immutabile e
  non implica installazione sull'orologio o completamento di un test hardware.

## Flusso di lavoro

1. Analisi, sviluppo e test del Bangle in questa chat.
2. Costruzione e verifica del pacchetto canonico.
3. Commit/push e pubblicazione della release GitHub da questa chat.
4. Comunicazione a Vera Web di revisione, provenienza e hash.
5. Allineamento dei consumatori App/Web e prove di installazione concordate.

I rilasci mantengono il JSON concordato e preservano dati e profilo secondo
il tipo di operazione. Pubblicare un pacchetto non autorizza automaticamente
formattazioni o altre operazioni distruttive sui dispositivi.
