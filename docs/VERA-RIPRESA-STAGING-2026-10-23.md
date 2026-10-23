# Ripresa verificata della copia — 23 ottobre 2026

La nuova revisione include la correzione nativa dei StorageFile e introduce
`status.stagingResume = verified-prefix-v1` e `stagingProgress(index)`.
Il registro alternato conserva index/offset solo dopo la scrittura del blocco.
La risposta include binding, targetFingerprint, index, verified, offset e SHA-256
del prefisso: il consumer confronta i byte con il pacchetto immutabile prima di
riprendere. File completi verificati sono saltati; replay identici sono idempotenti.
Una perdita fra scrittura e checkpoint permette di ripetere solo gli stessi byte.
Nessuna nuova inizializzazione, cancellazione o autorizzazione implicita.

La protezione si applica alla preparazione, non modifica il JSON dei campioni
né il runtime Vera Node. Il firmware resta Espruino 2v29. Installazione fisica e
collaudo 24 ore non sono eseguiti da builder, test o pubblicazione.

Il consumer deve mantenere il pacchetto e il binding della pratica esistente.
La promozione del catalogo richiede risoluzione della revisione storica soltanto
per ripresa autorizzata, mai per creare nuove pratiche con pacchetti superati.
