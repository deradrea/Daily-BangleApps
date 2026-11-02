# Schermate di inizializzazione: revisione del 2 novembre 2026

La foto del dispositivo evidenzia la sovrapposizione tra il contatore e il
bordo inferiore dell'anello. Il renderer condivideva coordinate troppo vicine,
font senza verifica della larghezza e grigi che il display riproduce con dithering.

Il nuovo layout comune usa il display nativo 176 x 176:
- marchio a y=6, titolo fase a y=35 e passo a y=54;
- anello continuo centrato a (88,96), raggio 28, percentuale centrata nel foro;
- contatore a y=133, istruzione a y=155, separati dall'anello;
- larghezza testo misurata con stringWidth e massimo 156 px; testo interno 40 px;
- colori nativi saturi: ciano avanzamento, verde completato, giallo interruzione;
- progresso reale per fase; attese senza denominatore con arco animato;
- connessione persa ed errore mostrano azione successiva e procedura conservata;
- trasferimento completo mostra numeratore e denominatore coerenti anche per kB
  arrotondati (133 / 133 kB al 100%);
- i blocchi BLE non ridisegnano ciascuno lo schermo: avanzamento al massimo una
  volta al secondo, cambi di fase immediati e footer separato per l'attesa.

Il rendering viene eseguito dai font e da Graphics dell'interprete ufficiale
Espruino 2v29, senza radio o dispositivo fisico. Il renderer di prova verifica
che tutti i testi restino nello schermo e non attraversino l'anello; copre dieci
stati, inclusi 100%, riavvio, completamento, connessione persa ed errore.

Comandi: node bin/render-zero-feedback.cjs e
python bin/render-zero-feedback-images.py (Pillow).
Anteprime: output/zero-ui-review/comparison.png e all-stages.png.
23 test di inizializzazione e memoria passati. JSON dei campioni e runtime finale
invariati. Nessuna installazione hardware o collaudo 24 ore eseguito.
La revisione grafica richiede un nuovo artefatto immutabile e il suo supporto
nel client prima di promuoverlo nel catalogo. Non modificare i pacchetti storici.
