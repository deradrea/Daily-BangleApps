# Vera Node — aggiornamento preservante v3

Pacchetto condiviso per aggiornare il solo software di Bangle.js2 con Espruino
2v29, conservando campioni offline, eventi, profilo, impostazioni e firmware.

- Autorizzazione app-confirmed: PIN amministrativo verificato da Vera e un avvio
  nell'app, senza un secondo consenso da toccare sull'orologio.
- Backup completo riletto e verificato prima delle scritture; isolamento della
  raccolta, sostituzione dei soli otto file approvati e conferma del riavvio.
- Ripresa della medesima operazione e del pacchetto fissato per hash. I file già
  verificati non vengono ricopiati; la conferma finale è ripetibile.
- Ripristino del software precedente mantenendo anche i dati raccolti dopo un
  avvio del target. Recupero close-only senza backup fittizio e senza copiare
  file runtime quando la manutenzione non aveva autorizzato l'aggiornamento.
- Avanzamento sul display durante copia, aggiornamento e avvio.
- Gli otto file target restano quelli della revisione545d. Se già presenti,
  il client segnala software allineato prima di entrare in manutenzione.

Bundle: `a4b5a4503c9c5b504c54cf6b1d3b817ae374f62dbbb791001458841d3d76c449`,
179004byte. Descrittore:
`73dc3b304fa3b032f76d014648d7c5a63b82d928aee1a3c2868cd1432a2765db`.
Sorgenti: `b6efbf5db5e594222b9ca21827f4a19719045745`.

Validazione:37test Node di manutenzione, compatibilità e packaging;9 verifiche
nel vero interprete Espruino2v29, con Storage/crypto nativi e radio/health
sostituiti;6 prove complete del consumerFlutter con il provider del pacchetto,
comprensive di perdita risposta, ripresa, rollback e close-only senza tocco.
La ricevuta del client non costituisce un'attestazione hardware. Questa release
non avvia il collaudo delle24ore e non esegue aggiornamenti automaticamente.
