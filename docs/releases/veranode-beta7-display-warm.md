# Vera Node 0.2.0 Beta 7 — consultazioni ravvicinate

Il sensore resta acceso al massimo 15 secondi dopo lo standby del display.
Una riapertura entro la finestra riusa il sensore e i valori con timestamp;
una riapertura successiva avvia una lettura nuova. Il controllo di freschezza
del quadrante resta invariato. Nessun campione o alert viene scritto fuori
sessione App. Spegnimento, cambio modalità, installer e nuova sessione hanno
proprietà dei timer separate. La Stable resta immutata.

Validazione: 297 test Node superati, inclusi emulatori Espruino 2v29;
11 test mirati ripetuti dopo l'ultima guardia sul runtime dismesso.
Il risparmio di riaccensioni è provato nel simulatore, non ancora misurato
sul 4C:46. La prima acquisizione a freddo non viene dichiarata più rapida.
Il costo massimo aggiuntivo è 15 secondi di sensore per standby isolato;
nessuna durata batteria è stata misurata. Collaudo 24 ore sospeso.

Pacchetto Zero 1c75e811, runtime 03da46fb, Mobile minimo 1.0.233.
Pubblicazione, catalogo, installazione e prova fisica sono stati distinti.

Pubblicata come prerelease GitHub veranode-zero-1-1c75e811fad731c2; quattro
asset riscaricati e confrontati byte per byte. PR15 integrata nel commit
7836d3fbd21d12cdbd9c9e6a1ca534e37a98171d. CI build e functional passati;
il job separato mention-app-authors fallisce con GitHub422 sul nome aziendale,
non e una prova funzionale fallita e non e stato disabilitato.
