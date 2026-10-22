# Inizializzazione one-click autorizzata nell'app

Decisione esplicita dell'utente,22ottobre2026: ogni avvio confermato è una nuova inizializzazione indipendente dai tentativi precedenti. Gli esiti passati sono soltanto registro; non richiedono ripresa o sblocco. La conferma distruttiva iniziale nell'app e il PIN personale restano, le richieste sul display del Bangle sono eliminate da questo pacchetto.

Il consumer verifica il ruolo e le autorizzazioni di Vera, MAC, firmware, cifratura e hash. Nuovo authorization: enforcement consumer,physicalConsentfalse,confirmationSourceapp,encryptedBletrue. Il Bangle non simula un consenso fisico: status.consent resta il campo legacy, mentre authorizationModeapp-confirmed e physicalConsentRequiredfalse descrivono la politica. Non sono introdotti PIN tecnici nel software o autoapprovazioni touch.

Il flusso procede senza domande sul watch attraverso staging verificato, formattazione selettiva, installazione, ora Vera, riavvio e verifiche del raccoglitore. I registri tecnici interni rendono atomiche le scritture durante l'operazione; una nuova prepare con nuovoUUID sostituisce qualsiasi stato precedente, anche parziale o corrotto. Nessun eraseAll. Nessun nuovo tentativo distruttivo automatico dopo un errore: il pulsante Ricomincia dà inizio a una nuova operazione esplicita.

Revisione veranode-zero-1-50aecec182f2fdec; SHA25650aecec182f2fdec07eaa2a241273725888414ad2a8357dc4f956c653f35ed28;208998byte;source01078c13525e164f20aa9b431890379dae0499fd. I14target e il runtime/JSON sono identici a f076. Le release precedenti restano immutabili e con la loro politica originaria; bcec era soltanto un candidato locale, non distribuito.

Test software: inizializzazione completa senza tocco, nuova inizializzazione dopo tutti gli stati parziali e corruzione, isolamento e integrità. Interprete ufficiale Espruino2v29: bootstrap senza domanda e tocco incapace di concedere un consenso inesistente. Installazione fisica non eseguita da questa pubblicazione.
