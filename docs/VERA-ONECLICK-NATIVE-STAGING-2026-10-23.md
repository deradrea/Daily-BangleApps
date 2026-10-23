# One-click: file temporanei dimensionati correttamente

Il Bangle FC:0C:5D:40:F0:AA con firmware 2v29 ha superato `prepare` usando il
pacchetto 3fcc, senza consenso aggiuntivo sul dispositivo. Il tentativo
3ece3b2e-c11c-4e31-b81a-ea1dc93dbf05 si è poi fermato nel trasferimento con
«Too much data for file size». Rapporto: un file temporaneo verificato su 14,
`wipeAuthorized=false`, `wipeConsumed=false`, nessuna cancellazione avviata.

La riproduzione nell'interprete Espruino ufficiale ha isolato il problema nel
secondo file (.bootcde, 1304 byte), al blocco con offset 384. `Storage.write` con
offset zero e senza dimensione totale ricrea il file della lunghezza del blocco.
La precedente allocazione vuota veniva quindi ridotta a 384 byte.

Il provider ora alloca il file e scrive il primo blocco nella stessa chiamata,
specificando la dimensione totale. I blocchi successivi rispettano la dimensione
riservata. Restano attivi verifica di ordine, limiti, SHA-256 e autorizzazioni.
Anche il simulatore Node riproduce ora questa semantica della memoria nativa.

- Revisione: `veranode-zero-1-2c74ed8520dc7429`.
- SHA-256: `2c74ed8520dc74293b09521bea9b644aaa44b28ae2140ebf9c0a1fe19f5a06de`.
- Dimensione: 209654 byte.
- Sorgenti: `42f3eda40ee7ed035779c9c897019dbae34ee3e8`.
- I 14 file finali, il runtime, il JSON e la policy sono identici a 3fcc.
- Firmware invariato. PIN e conferma distruttiva iniziale nell'app; nessun
  consenso aggiuntivo sull'orologio.

209 test Bangle passati. La regressione nativa trasferisce e verifica tutti
i 14 file reali, interrompe e ricomincia un file parziale, esegue cancellazione
selettiva e installazione sulla memoria Storage reale dell'emulatore, verifica
il journal dell'orario, attivazione, guardia ufficiale e ricevuta finale.
I vecchi artefatti immutabili riproducono esplicitamente i rispettivi difetti.

Limiti della prova: identità, cifratura, carica, cambio di ambiente al riavvio e
salute del collector sono adattatori simulati. EMSCRIPTEN2 legge l'orario host
e non applica setTime a getTime: anche la scrittura dell'orologio usa un adattatore
nel test. Hash, moduli, Storage e journal restano nativi. Non si tratta di una
conferma fisica di quadrante o sensori: questi controlli richiedono il tentativo
successivo dall'S21. Il collaudo di 24 ore resta sospeso.
