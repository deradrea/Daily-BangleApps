# Vera Node 0.2.0 Beta 9 - lettura per tutto il display visibile

Corregge un limite riprodotto con standby display di 120 secondi: la lettura
display durava soltanto 65 secondi. Il timer di aggiornamento gia esistente
rinnova ora la richiesta prima della scadenza, anche per il quadrante fisso.
Standby e rimozione della UI cancellano lo stesso timer: nessun nuovo polling,
nessuna acquisizione nascosta, campione, evento o messaggio BLE aggiuntivo.
Le soglie di qualita e i timestamp originali rimangono invariati.

Test prima della correzione: fallimento a 70 secondi, display acceso ma
richiesta sensori scaduta. Dopo la correzione: 68 test mirati e 303 test
completi passati, inclusi quelli con Espruino 2v29. Non equivale a una prova
hardware di questa revisione. Stable invariata finche il confronto fisico
non passa; nessuna cancellazione o modifica broker. Collaudo24h sospeso.

La diagnostica Beta8 al polso ha ricevuto 1375 eventi grezzi e 60 eventiHRM
in60s, con19letture utilizzabili. Le precedenti finestre senza segnale
non provano un blocco permanente del runtime. I risultati Beta8 non vengono
attribuiti alla Beta9 e non certificano un miglioramento dell'acquisizione
fisiologica a freddo.
