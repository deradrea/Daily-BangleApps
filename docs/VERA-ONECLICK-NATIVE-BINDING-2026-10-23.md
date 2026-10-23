# One-click: binding compatibile con Espruino 2v29

Il tentativo S21 1.0.129 sul Bangle FC:0C:5D:40:F0:AA, pratica
12a68ecb-4648-4f3b-a469-d2e4656d513a, ha identificato BANGLEJS2/2v29,
80% di batteria e 8037476 byte liberi. Il bootstrap era stato copiato e
verificato; `prepare` ha rifiutato il binding prima dell'autorizzazione alla
cancellazione (`wipeAuthorized=false`). Non sono state verificate installazione,
quadrante, orario o nuove misurazioni in quel tentativo.

L'interprete ufficiale Espruino 2v29 riproduce il problema: il motore RegExp non
implementa le ripetizioni numeriche `{n}` usate per UUID, MAC e SHA-256. Il binding
valido viene respinto. Il database Vera conferma deviceId fisico 1 corretto;
il problema non deriva dal PIN o dall'assegnazione commerciale.

La nuova revisione sostituisce le ripetizioni con lunghezze esatte, separatori
espliciti e classi di caratteri. Mantiene tutti i vincoli: otto campi esatti,
UUID minuscoli, MAC maiuscolo, hash esadecimale di 64 caratteri, deviceId intero
positivo sicuro, modello, firmware e intento. Nessuna conferma aggiuntiva sul
Bangle. PIN e conferma distruttiva iniziale rimangono nell'app.

- Revisione: `veranode-zero-1-3fcc1055a7b21f69`.
- SHA-256: `3fcc1055a7b21f6920db33c563fb4ca557d027b5a678f2ce6fa1bd85eed25aa8`.
- Dimensione: 209458 byte.
- Sorgenti: `ee9a85b64ead93842bdf8b41410702bb37fb21fc`.
- I 14 file target, il runtime di raccolta, il JSON e la policy di autorizzazione
  sono identici alla revisione 50ae. Cambiano solo provider di preparazione e
  manifest di provenienza/coerenza.

Verifica: 206 test Bangle passati. La regressione nell'interprete nativo esegue
`prepare`, salva e ricarica il journal Storage reale, verifica l'idempotenza della
stessa richiesta e respinge 15 binding alterati senza scritture. Il precedente
pacchetto riproduce il rifiuto nell'identica prova. Identità, stato BLE cifrato e
batteria sono sostituiti nell'emulatore: questa prova non equivale a un'installazione
fisica riuscita. Il collaudo di 24 ore resta sospeso.
