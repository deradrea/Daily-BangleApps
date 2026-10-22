# Inizializzazione one-click autorizzata nell’app

La decisione dell’utente del 22 ottobre 2026 aggiorna il flusso: ogni avvio confermato è una nuova inizializzazione, indipendente dai tentativi precedenti. Gli esiti passati restano soltanto nel registro. Rimangono il PIN personale e la conferma iniziale nell’app prima della cancellazione; questo pacchetto non richiede conferme sul display del Bangle.

Il consumer verifica ruolo e autorizzazioni di Vera, MAC, firmware, cifratura e hash. La nuova politica dichiara `enforcement: consumer`, `physicalConsent: false`, `confirmationSource: app` ed `encryptedBle: true`. Il Bangle non simula un consenso fisico: `status.consent` resta il campo legacy, mentre `authorizationMode: app-confirmed` e `physicalConsentRequired: false` descrivono il nuovo funzionamento. Non sono introdotti PIN tecnici nel software.

Dopo la conferma nell’app, la procedura esegue staging e rilettura dei file, formattazione selettiva, installazione, sincronizzazione con l’ora Vera, riavvio e verifiche del raccoglitore. I contatori tecnici interni rendono sicure le scritture durante l’operazione; una nuova `prepare` con un nuovo UUID sostituisce qualsiasi stato precedente, anche parziale o corrotto. Non viene usato `eraseAll`.

Un errore non provoca un nuovo tentativo distruttivo automatico. Il pulsante «Ricomincia» permette all’utente di avviare una nuova operazione. Il registro storico non impedisce l’avvio.

## Pacchetto

- Revisione: `veranode-zero-1-50aecec182f2fdec`.
- SHA-256: `50aecec182f2fdec07eaa2a241273725888414ad2a8357dc4f956c653f35ed28`.
- Dimensione: 208.998 byte.
- Sorgente: `01078c13525e164f20aa9b431890379dae0499fd`.

I 14 file del sistema Vera finale e il runtime che conserva il JSON dei campioni sono identici a f076. Le release precedenti restano immutabili e mantengono la loro politica originaria. Il candidato locale bcec non è stato distribuito.

## Verifiche

Sono passati 204 test software Bangle, compresi l’inizializzazione completa senza tocco e il nuovo avvio dopo stati parziali o corrotti. Nell’interprete ufficiale Espruino 2v29 il bootstrap non espone la domanda e un tocco non concede alcun consenso. Questa pubblicazione non ha eseguito installazioni o cancellazioni sul dispositivo fisico.
