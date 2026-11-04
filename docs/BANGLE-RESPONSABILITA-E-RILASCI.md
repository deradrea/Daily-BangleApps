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

## Ciclo corrente — 2 novembre 2026

Decisione utente: sviluppare e distribuire prima i pacchetti completi Vera Node,
poi inizializzare da zero dopo ripristino di fabbrica eseguito dall'utente.
Aggiornamenti preservanti e repair/recovery sono sospesi; nessuna scadenza,
pratica o backup esistente viene modificato per adottare questo ciclo.
Il collaudo24h resta sospeso.

`releases/veranode-runtime.json` seleziona il runtime canonico;
`releases/veranode-initialization.json` identifica il pacchetto completo che lo
include e la versione minima Mobile che lo riconosce. Il catalogo Web viene
allineato solo dopo la distribuzione del client compatibile. I vecchi asset
restano immutabili. Un nuovo sviluppo richiede nuova revisione e nuovi hash.

La release zero-f543 include runtime1ab4 e richiede Mobile1.0.158. Ricostruzione
da commit e download GitHub confrontati byte per byte; test Mobile/runtime e
inizializzazione completa in Espruino2v29 passati. Queste prove non attestano
un'installazione sul Bangle fisico.

Correzione1.0.158: il download HTTP e la verifica del pacchetto usano la stessa
lista di coppie revisione/hash e commit. La157 aggiornava il verificatore ma
non il secondo elenco nel trasporto, fermandosi prima di qualsiasi accessoBLE.
La versione minima effettiva per installare zero-f543 da Mobile è quindi158.


## Allineamento della distribuzione — 3 novembre 2026

Il pacchetto corrente e `veranode-zero-1-25ef42ed9ae86296`, con verifica nativa
SHA-256 per blocchi ordinati da 1024 byte. Mobile minimo 1.0.160; versione
consigliata 1.0.161, che presenta un solo percorso di inizializzazione e rimuove
gli ingressi agli aggiornamenti del software Bangle.

La 1.0.161 e disponibile nei Test interni Google Play. Il catalogo Vera Web
serve lo stesso pacchetto ufficiale: download autenticato di 272013 byte e
SHA-256 25ef42ed9ae862967532f55921665fd89aa1154a4d1783721489e87870d44c58,
verificati dopo il deploy del commit 3aa2bca7b745b73cab1c06e15a272cc696f7acbd
con pipeline 41672445771 conclusa con successo. I pacchetti storici restano
immutabili; le pratiche esistenti conservano i riferimenti originari.

Questi esiti attestano pubblicazione e allineamento. L'installazione Mobile
sul Galaxy, il pacchetto letto nella nuova sessione e la prova fisica del
F0:AA richiedono conferma separata. La verifica hardware di25ef non e ancora
conclusa e il collaudo24ore resta sospeso. Nessun firmware modificato.
