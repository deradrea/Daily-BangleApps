# Vera Node: sorgenti e distribuzione comune

`apps/veranode/` è la fonte canonica di runtime, quadrante, protocollo, gestione orario e metadata. Le copie in Vera Web e negli asset Mobile sono artefatti di distribuzione, mai sorgenti da modificare separatamente.

Da questa directory:

```powershell
node bin/build-veranode-release.cjs
node --test test/veranode/*.test.cjs
node bin/export-veranode-mobile.cjs
```

Il generatore salva `dist/veranode/<revision>/package.json` e `source-manifest.json`. Revisione basata sugli hash dei sorgenti, build deterministica, nessuna sovrascrittura di una revisione con contenuto diverso. La versione logica 0.2.0 resta distinta dalla revisione completa. Lo script non carica file su dispositivi o server.

Il formato include modello, firmware supportato, stato di sviluppo, hash della provenienza e per ogni file nome/lunghezza/SHA-256/base64. Le istruzioni di prima installazione sono dichiarative. L'icona viene decodificata da un solo literal base64; non viene eseguito codice sorgente durante la generazione. Boot e registro `.info` sono gli ultimi file.

Mobile esporta gli identici byte del pacchetto e genera un pin SHA-256 compilato nell'app. L'importer Web deve consumare uno snapshot esplicito da questa directory, verificarne gli hash e registrare la revisione effettiva, senza prelevare HEAD implicitamente. La precedente copia `vera-mobile/build/bangle/veranode-0.2.0` e il vecchio `bin/build-veranode.cjs` restano storici e non sono il canale canonico delle nuove revisioni.

Per distribuire online serve un successivo rilascio autorizzato del catalogo Vera: niente URL o endpoint mobile inventati. Una build locale non equivale a una pubblicazione Web/Play o a una prova hardware completa.

Il repository contiene modifiche locali in corso: generare un pacchetto da working tree deve essere dichiarato; la promozione a release richiede revisione, commit identificabile, test software e collaudo fisico. Non inserire firmware, credenziali o profili utente nel pacchetto.
