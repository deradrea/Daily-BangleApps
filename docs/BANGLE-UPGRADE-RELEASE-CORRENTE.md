# Release corrente di Aggiorna Vera

Artefatto corretto per Espruino2v29: `veranode-upgrade-1-a42edcd9b47c5677`.
SHA256 `a42edcd9b47c5677082177479a66deb89d81d56722aa65ba732cdd8ff879da0a`,167682byte.
Descriptor SHA256 `e4c27c28cfbc40a9cfbde83994398a99f6d38e2caf584cb3a895508cab43549f`.
Sorgenti canonici `a39dd51d9354bfe79eafd58f268c4f6294a45ada`; provenance incorporata contiene9inputGit e hashbuilder. Ricostruzione con build(output,{sourceCommit}) usa quei byte e non il checkout Windows/Linux.

Correzione21ottobre2026: il provider d749 conteneva Number.isInteger non disponibile su2v29. Il nuovo provider usa un predicato locale; guasto d749 riprodotto in VM e ciclo interrotto/ripreso verificato con Number helpers assenti. Solo veram.provider.js cambia (SHA `fc9856c083789fca39a35deddc98abe163b782a82417e57f97828cf462c1cdd2`,8007byte). Gli8target545d, le2origini supportate c212/545d e gli altri3sidecar sono identici. d749 resta immutabile e storico;42f e un candidato locale non pubblicato, da non catalogare.

La coppia primary bootloader/bootupdate rimane quella legacyCRLF. maintenance.acceptedBootloaderSha256 e maintenance.acceptedBootupdateSha256 dichiarano esattamente le2varianti ufficiali LF/CRLF gia ammesse da866f. Il consumer confronta gli hash reali senza normalizzare il contenuto dell'orologio. I vecchi consumer ignorano gli array e restano limitati alla coppia primaria. Firmware supportato esattamente2v29, nessun confronto di versione aperto.

166testNode superati, incluse ripresa di una scrittura interrotta e conservazione byte campioni/profilo/impostazioni, rifiuto sorgenteVera assente/nonriconosciuta prima delle scritture, provenanceGit e targetimmutato. La verifica indipendente conferma dimensioni/hash dei12file e9inputGit. Mobile:10test parser/bootstrap superati, incluse esecuzione dello script generato sulle2varianti e rifiuto di bootloader sconosciuto prima di qualsiasi sidecarwrite.

I flag executionEnabled:false e hardwareValidated:false rimangono invariati: questa correzione non e una prova hardware ne un'autorizzazione server. Il servizio Web e il percorso Mobile sono ancora legati al profilo operativo e non implementano automaticamente MaintenanceAccessV2 per un device senza utente/profilo. Occorre integrazione distinta, senza fabbricare assegnazioni. Dopo factoryreset Aggiorna Vera deve rifiutare Vera assente; non si converte in Inizializza Bangle. Nessun BLE/installazione/reset avviato dalla chat durante questo lavoro.
