# Vera Node 0.2.0 Beta 4

Runtime: veranode-0.2.0-dev-64093b9cac3bff0c.
Pacchetto Zero: veranode-zero-1-ffa11cce417459b2.
SHA-256: ffa11cce417459b24a8a7d075cb47b34531fb18b7233de758556c022012e3973.
Sorgenti: b6a2884f18a5a3bed9bb55c8a64083e29630a52d.

Corregge la durata dei riferimenti ai timer del sensore di pressione: dopo risposta,
errore o scadenza, il riferimento viene rilasciato. Espruino 2v29 riutilizza gli
identificativi dei timer; conservare un identificativo gia concluso consentiva
allo spegnimento del display di cancellare il successivo timer Bluetooth.
Il risultato osservato sul 4C:46 era una risposta al consenso interrotta dopo
20 byte, pur avendo ricevuto il Si fisico, e nessuna misura nei grafici della
sessione. La pulizia del timer delle notifiche usa lo stesso stato undefined.

Verifiche: 284 test superati, inclusi quattro casi nuovi con identificativi
riutilizzati (pressione riuscita, rifiutata, eccezione, timeout). Nell'interprete
ufficiale 2v29 la prova riproduce la cancellazione con il codice precedente e
preserva il timer con la correzione. Il nuovo pacchetto ha completato nel
simulatore nativo staging, verifica dei 14 file, cancellazione, installazione,
orario, attivazione e ricevuta del boot guard. Queste sono prove simulate.

Non cambia modalita App, intervallo, formato dei campioni, ACK, consenso o
policy di autorizzazione. Stable invariata. Nessuna cancellazione fisica o
inizializzazione del 4C:46 eseguita per questa Beta. La convalida fisica deve
avvenire senza osservatori temporanei. Collaudo delle 24 ore sospeso.
