# Vera Node 0.2.0 Beta 3

Runtime: veranode-0.2.0-dev-d92ce025666ca89f. Pacchetto Zero: veranode-zero-1-c7341b087682ac77.

Questa Beta aggiunge letture temporanee dei sensori mentre il display e acceso in modalita App senza sessione. Le letture di sola visualizzazione non generano record, eventi, ACK o invii. Lo spegnimento del display interrompe solo la lettura temporanea, lasciando attiva una vera sessione di raccolta. I valori iniziano vuoti, senza riutilizzare misure precedenti. La finestra temporanea e limitata a 65 secondi.

La sessione BLE di raccolta puo allineare il riferimento orario solo con sorgente vera_server. La sonda link_security espone esclusivamente lo stato cifrato, mantenendo le protezioni ATT e l'autorizzazione dei dati. Mobile 1.0.215 usa questa sonda per evitare una nuova associazione non necessaria.

Verifiche sorgente: 280 test superati. La fixture storica c212 e mantenuta nei byte distribuiti e marcata -text per evitare alterazioni CRLF/LF. Pacchetto dedicato con 14 file finali, stesso protocollo e bootstrap del precedente e1f6c61f. Stable non modificata. Verifica fisica, sensori nell'app, recupero e MQTT da eseguire sul 4C:46 dopo l'inizializzazione da zero autorizzata dall'utente. Collaudo 24 ore sospeso.
