# Integrità a memoria limitata per inizializzazione Vera Node

La prova fisica 97c1 del 2 novembre 2026 ha verificato i 14 file singolarmente,
ma ha esaurito RAM contigua nel ricontrollo globale prima del wipe. Rapporto:
3dd8c9cf-8c07-438b-84b3-be8aae0bba49, beginWipe, wipeAuthorized=true,
wipeConsumed=false, removed=0, installed=0. Il grant era arrivato: la label
«Attesa autorizzazione Vera» non identificava correttamente il controllo locale.

La nuova revisione elimina l'hash di file interi sull'orologio. Il builder calcola
SHA-256 del file completo e dei blocchi consecutivi da 1024 byte. L'app verifica
entrambi contro i byte ufficiali prima di scrivere. Il manifesto dei blocchi è
incluso nel pacchetto immutabile e nel modulo vz.target.js; il nuovo supporto
vz.integrity.js verifica ogni blocco in ordine e la lunghezza esatta del file.
Non omette byte e non sostituisce gli hash con CRC o controlli non crittografici.
La garanzia sul file completo sul device deriva dalla corrispondenza di tutti i
blocchi al manifesto ufficiale validato dall'app, non da una SHA monolitica locale.

Il massimo input per ogni SHA di file è 1024 byte. Journal e prova del prefisso
hanno input limitato a 4096 byte. Non vengono usati E.toFlatString o buffer grandi
quanto il file. Hash di blocchi per file e supporti restano SHA-256 nativi 2v29.
Il modulo calcola anche il prefisso ripreso: SHA256("VZP1" + lunghezza uint32BE +
concatenazione dei digest binari dei blocchi del prefisso). Il nuovo client
verifica esplicitamente algorithm e digest; i pacchetti storici restano distinti.

RPC, grant, autorizzazioni e protocollo server restano invariati. Target di 14
file, fingerprint, runtime, firmware e JSON dei campioni restano invariati.
Aggiunto un ottavo file bootstrap; nuovo pacchetto e nuovo client obbligatori.
Le revisioni f543 e 97c1 restano leggibili per audit ma il nuovo client non permette
né nuove inizializzazioni né riprese con quei verificatori già falliti.

La fase pre-wipe ha una label propria: il grant Vera è distinto dal ricontrollo
locale prima della cancellazione. La revisione comprende la nuova UI 176x176.
Test nativi vietano input SHA sopra 4096 byte e vietano allocazioni flat complete.
Non confondere le prove nell'interprete con il collaudo fisico ancora necessario.
