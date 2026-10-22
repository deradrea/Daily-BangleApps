# Vera Node: consenso dedicato durante l'inizializzazione

La schermata di consenso sostituisce l'attesa generica con una richiesta esplicita e un pulsante grande CONSENTI. Il tocco è accettato solo nel rettangolo visibile; il tasto laterale ridisegna la domanda senza approvarla. Prima di montare la UI viene eliminata l'istanza temporanea del display, evitando di riutilizzare un oggetto di feedback precedente.

Il bootstrap espone consentUi (stato software, non conferma visiva umana) e rifiuta un'interfaccia che non renda disponibile il consenso. Nessuna approvazione automatica. Policy, binding, cifratura e autorizzazione distruttiva invariati.

Sorgente 1a059d1151d538fb6c64893bf8e71369da2dc827. Revisione veranode-zero-1-7a6a6aabf9998dc4, SHA256 7a6a6aabf9998dc48e4b133101ef3074fc106399666810c05436f69fcfd2d699, 208480 byte. I 14 file target, runtime e JSON sono byte-identici a f076. Gli artefatti precedenti restano immutati; la pratica della prova precedente non viene modificata. Un nuovo hash richiede un nuovo intento esplicito, mai una sostituzione automatica del binding precedente.

199 test software superati. Interprete ufficiale Espruino2v29: verifica pixel del pulsante, rifiuto tocco esterno e accettazione del tocco interno. Nessuna installazione o cancellazione hardware eseguita per questo rilascio.
