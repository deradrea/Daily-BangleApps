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
# Verifica fisica e distribuzione del 24 novembre

Mobile1.0.235 pubblicata nei Test interni (release96) e installata da Google Play
sul Galaxy Daily Tre. La Beta9 è stata applicata al4C:46 conservando i dati:
backupDPAPI36file/215548byte, verifica completa prima del load, soltanto app e
info sostituiti. Controllo breve dopo l'avvio riuscito; rilettura completa
postboot interrotta con OSError, successivo tentativo senza advertising.
Non presentare queste letture interrotte come verifiche complete riuscite.

Prova App30s: interruzioneBluetooth40s, riconnessione,4campioni presi in
custodia e ACK successivi; grafici Bangle/badge visibili, coda0, ricevute
automatiche Vera4/4. Nessun auditSQL indipendente di questo lotto.
Al termine417/417, nessun pendente. Successiva prova display senza raccolta:
battito valido14.573s; valore recente alla riapertura122ms (età8.588s),
battito nuovo15.442s. Temperatura nuova0.672s e0.725s alla riapertura.
Contatori invariati e potenza ottica spenta dopo la finestra di sola lettura.
Tempi di disponibilità del runtime, non misura fisica tasto-pixel.

La prima temperatura non è uniformemente più rapida. Il refresh alla
riapertura migliora rispetto alle finestre Beta7 di6.781–25.676s; il campione
attuale è piccolo e non dimostra un miglioramento generale del primo battito.
Stable resta invariata; nessuna inizializzazione Zero eseguita e nessuna
attestazione hardwareValidated aggiunta al pacchetto. Collaudo24h sospeso.

Il puntatore Beta di inizializzazione è allineato ai byte già pubblicati della
Beta9/minMobile235, senza ricostruire gli asset. Le ricevute hardware e Mobile
sono nel progetto consumer: output/beta9-visible-sensors-20261124/ e
output/release-1.0.235-stabilization/. Il catalogo Web ha un rilascio separato.

