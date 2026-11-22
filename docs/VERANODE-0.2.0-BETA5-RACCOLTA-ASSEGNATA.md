# Vera Node 0.2.0 Beta 5 — raccolta dal Galaxy assegnato

Stato: candidata locale, non installata e non promossa a Stable. Collaudo hardware 24 ore sospeso.

## Comportamento

Avvia sessione sul Galaxy è sufficiente per la raccolta App sul Bangle assegnato. Nessuna domanda sul display per avvio e riconnessione. Sono riusati i messaggi authorize con relayKey e collection_resume già inviati da Mobile 1.0.226; nessun nuovo endpoint Vera o comando di raccolta richiesto.

Mobile verifica la sessione e l'assegnazione id/MAC/ruolo con /me prima di avviare il worker. Il Bangle richiede sia cifratura attuale sia un peer bonded. La prima richiesta di raccolta valida salva veranode.owner con CRC e rilettura: account, contesto server/azienda e MAC. Il legame non è un profilo di alert. Richieste successive con altro account o contesto sono rifiutate; un record di legame corrotto o non salvato non autorizza. Riavvii e riconnessioni nello stesso contesto non riscrivono il legame. La riassegnazione richiede il percorso amministrativo di inizializzazione, senza introdurre un cambio utente implicito.

La prima associazione del contesto è trust-on-first-use sul telefono già bonded, dopo la verifica effettuata dal client Vera. Il Bangle non interroga Vera e non verifica una firma server sull'assegnazione. Il solo bonding non prova l'assegnazione: essa è verificata dal client. Questo limite è esplicito; nessuna dichiarazione di autenticazione server sul dispositivo viene introdotta. Il pacchetto di sviluppo mantiene inoltre il preesistente UART di manutenzione.

La concessione automatica rimane limitata alla raccolta: stato, orario Vera, batch, indice, ACK di custodia e avvio/arresto App. Non apre impostazioni, profili o cancellazioni amministrative. La manutenzione e il display mantengono i loro accessi esistenti. Si elimina il consenso ripetuto della raccolta, non si trasforma la sessione in amministrazione generale.

## Dati

Campioni, timestamp, epoch e sequenze non vengono riscritti. L'ACK è accettato solo dopo la custodia confermata dal telefono. Un ACK ripetuto non crea duplicati. La perdita del collegamento lascia continuare la sessione App nella durata già autorizzata e i campioni restano da trasferire; la riconnessione usa la stessa chiave. L'arresto invalida la sessione e ferma nuove registrazioni. Non viene cancellato alcun archivio durante la preparazione della Beta.

## Canali e artefatti

Il selettore predefinito releases/veranode-runtime.json resta invariato. La Beta usa releases/veranode-runtime-beta.json e viene scelta dal builder Zero solo con --dedicated --beta. Vecchi artefatti immutabili e cataloghi online non sono modificati. Pacchetto, hash, commit sorgente ed esito dei test sono registrati nella consegna locale. La pubblicazione GitHub/catalogo e l'installazione fisica sono passi separati.

## Verifiche

Set mirato Node: 92 test passati, inclusi sette nuovi casi di raccolta assegnata. La prova nativa Espruino 2v29 verifica authorize senza domanda, legame su Storage, rifiuto del contesto diverso e mantenimento del consenso per la manutenzione; trasporto e bonding sono simulati. Non è una prova BLE fisica né un collaudo delle 24 ore.

Prima dell'uso operativo: installare il pacchetto Beta e verificare dal Galaxy un avvio senza domanda, nuovi campioni, ricevute automatiche, perdita BLE, recupero senza doppioni e coda zero. Nessuna promozione Stable dal solo esito dei test locali.
