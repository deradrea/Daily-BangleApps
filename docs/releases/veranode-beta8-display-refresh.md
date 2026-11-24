# Vera Node 0.2.0 Beta 8 - lettura e aggiornamento display

La riapertura richiede subito una nuova temperatura, senza attendere il tick
di raccolta a 30 secondi. Una richiesta gia pendente rimane unica e conserva
il timeout e la proprieta del proprio timer.

La prima apertura dopo lo standby conserva i valori ancora recenti, con il
loro timestamp originale e la stessa scadenza di 45 secondi del quadrante.
Valori scaduti, futuri o con timestamp non valido vengono scartati. La soglia
di qualita del battito e le modalita di raccolta restano invariate.

Una pressione deliberata del tasto avvia la lettura display prima del rilascio
che accende il quadrante. Questo percorso non sceglie un consenso, non apre
una sessione App e non registra campioni, eventi o messaggi BLE aggiuntivi.
La finestra di mantenimento del sensore resta di 15 secondi.

Il tempo di acquisizione fisiologica a sensore spento non viene dichiarato
inferiore: va misurato sul dispositivo separatamente dalla disponibilita di
un valore recente. Pubblicazione Beta, prova conservativa sul 4C:46 e promozione
Stable sono stati distinti; la promozione richiede esito hardware favorevole.
Nessuna cancellazione di dati o modifica broker. Collaudo 24 ore sospeso.
