# Vera Node — consolidamento del 27 ottobre 2026

## Pacchetti della stessa versione runtime

| Uso | Revisione | SHA-256 |
|---|---|---|
| Runtime | veranode-0.2.0-dev-f4f3226f8bca4f26 | 91d5ae89f4c715ddec004dd98a30277ca7251671604ad69913873c78d928aa01 |
| Inizializzazione | veranode-zero-1-ff4580346d090844 | ff4580346d09084412154b98226d081d39179ff1468a7283875daec3b32b60ae |
| Aggiornamento conservativo | veranode-upgrade-1-68d81eaaaa993450 | 68d81eaaaa993450e33a743655247b43b45c891f8e2d91acff8daeebf83edd9f |

Commit sorgente degli installer: `0e88c2768a175e89f0010f8c9ccabe8c51a56d21`.
Firmware e protocollo restano Bangle.js2 / Espruino2v29 e Vera Node0.2.0.

`releases/veranode-runtime.json` seleziona una sola origine verificata dai builder
di inizializzazione e upgrade. Entrambi controllano gli stessi byte degli otto
file runtime; boot di base e supporto di recupero restano distinti.
L'upgrade mantiene tra le origini compatibili la545d installata sul F0:AA.
I vecchi pacchetti immutabili non vengono modificati o sostituiti.

## Correzioni

- Conferma finale complete idempotente anche rispetto alle scritture flash:
  mantiene verifica di boot/file/sensori ma non riscrive un checkpoint invariato.
- Batteria richiesta strettamente oltre50%, coerente con Mobile.
- Pausa/ripresa della raccolta idempotenti: niente campioni aggiuntivi o richieste
  HRM ripetute quando lo stato è già quello richiesto.
- Ripresa HRM rifiutata: stato ancora in pausa, errore esplicito, nessuna falsa ripresa.
- Pressione precedente alla pausa invalidata, timer di misura/notifica disarmati
  quando opportuno. Offline elimina il timer TX differito senza fermare le misure.
- JSON, formato dei journal e dati/profilo dell'aggiornamento restano invariati.

## Verifiche

Il consumer Mobile146 confronta UTC con Vera tramite tempo monotono, rileva
45secondi di risposte senza avanzamento e segnala profilo assente nel riepilogo.
L'APK è preparato separatamente dai pacchetti: non prova un'installazione hardware.

Log di verifica in `output/hardening-*.log`:

- Test di raccolta, journal, clock, manutenzione, interruzioni, packaging e provenance.
- Pacchetto zero nuovo eseguito nell'interprete Espruino2v29 con Storage e crypto
  nativi; staging/partial retry/wipe/install/time/boot receipt verificati.
- Identità, radio e salute dei sensori sostituite esplicitamente nel test nativo:
  questa è una prova software, non un collaudo fisico dei nuovi pacchetti.

Le prove reali già concluse riguardano545d/498e su S21, in carica e non in carica.
Per il nuovo runtime occorrono aggiornamento545d→f4f con campioni/profilo presenti,
confronto degli inventari protetti e prova di ripresa controllata. Nessun nuovo
comando è stato inviato al Bangle per questa revisione. Il collaudo24ore resta sospeso.

## Distribuzione

Artefatti preparati nel repository locale. Il catalogo online corrente e le
pratiche esistenti mantengono i loro pacchetti; la revisione non li modifica.
L'allineamento Web riguarda catalogo/API, non rigenerazione dei sorgenti Bangle.
Usare i digest sopra e la provenienza Git, senza ricostruzioni lato consumer.
