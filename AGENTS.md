# Responsabilità del software Vera Node / Bangle

Decisione esplicita dell'utente: tutto lo sviluppo del software Bangle viene
svolto nella chat Vera Mobile (titolo attuale Vera Moble), inclusi test, builder,
pacchetti, commit/push, tag e release GitHub di questo repository.
La chat Vera Web non deve modificare, rigenerare, ripacchettare o pubblicare
codice Bangle. Usa i pacchetti immutabili pubblicati dalla chat Mobile e gestisce
soltanto l'integrazione Web (API, autorizzazioni, catalogo, UI/trasporto installer).
Per problemi al runtime dell'orologio inoltrare la diagnosi alla chat Mobile.

Leggere docs/BANGLE-RESPONSABILITA-E-RILASCI.md per fonte unica e flusso di rilascio.
Non alterare artefatti esistenti sotto dist/veranode/<revisione>: una modifica
software richiede una nuova revisione. Non confondere pubblicazione GitHub con
installazione hardware o collaudo concluso. Preservare JSON, dati e profili.
