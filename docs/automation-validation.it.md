# Registro di verifica — 1.2.0-rc.1

Data: 2 novembre 2026. Baseline precedente: 1.1.0, commit `a31c0a2`. Le modifiche della candidata sono locali, non pubblicate. Il piano di riferimento è [competitor-parity-plan.it.md](competitor-parity-plan.it.md), punti 1–5. Le prove P0 su hardware non sono concluse: questa versione resta una candidata, non un rilascio stabile certificato.

## Decisioni P0 e perimetro

| Ambito | Decisione e prova disponibile | Stato |
|---|---|---|
| Scheduler | AlarmManager nativo, allarmi singoli, modalità puntuale/flessibile; niente timer JS o servizio permanente | Implementato; precisione in Doze da misurare |
| Primo provider eventi | MacroDroid, azione Send Intent documentata; endpoint esplicito con capacità casuale revocabile, nessuna sostituzione dei dati del PC | Receiver provato realmente; MacroDroid da collaudare |
| Prima integrazione | [Configurazione concreta e contratto](automation.md#macrodroid-first-integration-selected-for-validation) | Pronta; non dichiarata compatibile prima della prova end-to-end |
| Permessi minimi | Internet, boot, wake lock breve; accesso allarmi esatti solo per regole puntuali; notifiche opzionali | Manifest e flussi implementati |
| Rete/VPN | Nessun bind a reti alternative e nessun bypass intenzionale della VPN | Più interfacce e VPN da provare su hardware |
| Wi-Fi/SSID | Nessun osservatore o permesso Wi-Fi introdotto nella candidata | Secondo rilascio |
| MAC dei peer | Nessuna euristica, API nascosta o privilegio root introdotto; MAC resta manuale | Prova tecnica e decisione sul recupero IP ancora aperte per il secondo rilascio |
| Riavvio | Receiver dopo sblocco, boot, cambio ora/fuso e aggiornamento pacchetto; nessun invio prima del primo sblocco | Codice presente; ciclo reboot/blocco reale da provare |

L'assenza di un dispositivo fisico collegato impedisce il completamento dei criteri di uscita P0. Le prove software non vengono presentate come prova di affidabilità in background su telefoni reali.

## Verifiche eseguite

Ambiente: Windows, Node 24.19.0 e npm del workspace, JDK Temurin 21.0.12.1 (il JBR 25 locale non è compatibile con la toolchain Gradle corrente), SDK/target 35. Emulatore **Pixel 9, Android 15 / API 35, x86_64**, avviato in modalità `-read-only -no-snapshot -no-window`, senza salvataggio di modifiche all'AVD originale.

| Controllo | Risultato registrato |
|---|---|
| Jest | 27 test superati: regressioni archivio/context/lista, concorrenza/cancellazione e cinque prove della UI guidata |
| TypeScript | `npx tsc --noEmit` superato dopo correzione del tipo del callback AppState nei test |
| ESLint | Nessun errore; 3 avvisi di stile inline non bloccanti dopo la revisione UI |
| Dipendenze | 8 test di regressione superati; `npm audit --audit-level=low`: 0 vulnerabilità al momento della verifica |
| Kotlin/debug | Compilazione e APK di debug/test generati |
| Android instrumentation | 23 test superati, 0 saltati, 0 falliti sull'emulatore API 35 |
| Build release | `assembleRelease` superato; quattro APK unsigned prodotti e allineamento `zipalign -c -P 16 4` verificato |
| UI release | Avvio con bundle incorporato, nuova navigazione, stato discreto, editor regola, aggiunta dispositivo dalla bozza e ritorno con dispositivo selezionato verificati nell'emulatore; pulsante + corretto e area di tocco verificata >=48 dp |
| C++ standalone | Non rieseguito su questo host Windows; il codice C++ non è stato modificato. Comando disponibile nelle note tecniche e nella CI Linux |

La suite Android comprende le regressioni esistenti Keystore/backup/widget/tile e sette nuove prove: orari settimanali e transizioni DST europee; fasce oltre mezzanotte; input invalido; broadcast esterno reale con credenziale corretta/errata, deduplicazione, rotazione e dispositivo eliminato; occorrenza tardiva saltata; due regole sulla stessa occorrenza/dispositivo con un solo datagramma; monitor nativo a due risposte e cancellazione; round trip del backup v2, rimappatura ID, regole disabilitate, esclusione token, rifiuto versione futura e ripresa del journal dopo interruzione simulata. I datagrammi ricevuti su loopback vengono confrontati con il magic packet atteso.

Gli APK finali e `SHA256SUMS.txt` sono raccolti in `release-artifacts/1.2.0-rc.1/unsigned/` (ignorato da Git). Le prove UI usano una copia x86_64 firmata esclusivamente con il certificato debug pubblico del repository, salvata in `qa/` e non destinata alla distribuzione. Non è stata usata la chiave del manutentore. Screenshot e rapporto Android sono conservati nello stesso pacchetto locale. Il server Metro di sviluppo ha incontrato un errore di watch delle directory CMake temporanee su Windows; il collaudo UI è stato eseguito sulla build release con bundle incorporato, indipendente da Metro.

Durante la prima esecuzione sono emersi due problemi poi corretti: risposta del receiver ordinato dopo `goAsync()` e timeout del test che eseguiva PBKDF2 sulla coda dell'archivio. La risposta ora usa il `PendingResult`; la crittografia portabile gira fuori dalla coda anche nella prova, come già accade nella UI di backup. Non sono stati abbassati i parametri crittografici.

## Matrice ancora necessaria per il rilascio stabile

### Revisione UI del 2 novembre 2026

Il pulsante + della Device List è ora flottante, in basso a destra sopra la barra delle schede; il contenuto della lista ha spazio finale per evitare sovrapposizioni. Automation separa stato generale, schede delle regole, attività e guida contestuale. L'editor segue Dispositivo → Quando → Riepilogo, con giorni compatti, comandi di navigazione persistenti e opzioni avanzate richiudibili. Le voci tecniche di esito sono tradotte in messaggi leggibili e i permessi sono proposti quando pertinenti.

Quattro nuovi test verificano: avanzamento e validazione dell'orario prima del salvataggio; attivazione esplicita senza invii durante la procedura; conservazione dei filtri nascosti e della bozza dopo errore; annullamento senza salvataggio; chiarezza della pausa globale, assenza di richieste allarmi irrilevanti per eventi esterni e conferma prima di un wake di prova. Il codice Kotlin e il contratto dei dati non sono cambiati; i 23 test nativi riportati sopra appartengono al collaudo precedente, non a una nuova esecuzione per questa revisione grafica.

La build release è stata rigenerata per questa revisione e i quattro APK hanno superato il controllo di allineamento. Il controllo sull'emulatore API 35 ha verificato: FAB in basso a destra con lista vuota/popolata, schermata Automation senza permessi irrilevanti, aggiunta di un PC dalla bozza, selezione del dispositivo al ritorno, tre passaggi con comandi fissi, riepilogo e salvataggio di una regola disabilitata. Nessun errore runtime è stato rilevato nel processo dell'app. Screenshot in `release-artifacts/1.2.0-rc.1/qa/ui-revision/`; i collaudi su hardware elencati sotto restano aperti.

| Configurazione/caso | Esito |
|---|---|
| API 24/26, 29/30, 31/33, 34/35/36 e più recente disponibile | Solo API 35 emulata verificata; altre aperte |
| Pixel fisico e telefono con risparmio batteria aggressivo | Aperto |
| Orario singolo/settimanale consegnato da AlarmManager, schermo spento e Doze prolungato, con conteggio UDP e latenza misurata | Aperto; i test del motore non misurano la consegna temporale reale |
| Permesso allarmi esatti negato, concesso e revocato; sospensione visibile e ripresa | Aperto su dispositivi reali |
| Processo terminato, rimozione dai recenti, riavvio/primo sblocco, aggiornamento, arresto forzato e riapertura | Aperto; distinguere e annotare i casi |
| Cambio ora/fuso e DST di sistema con allarmi pendenti | Algoritmo e consumo occorrenza provati; broadcast di sistema reali aperti |
| Rete assente, solo LAN senza Internet, Ethernet/Wi-Fi/VPN e perdita rete durante l'invio | Aperto |
| MacroDroid: macro reale, ID evento dinamico, duplicato, token revocato e sola regola collegata | Aperto; non sostituire con il solo comando ADB |
| Backup tra due installazioni fisiche, import ripetuto, annullamento provider documenti e riattivazione esplicita | Invarianti automatiche provate; flusso fisico aperto |
| Accessibilità, temi, caratteri grandi, lista piena/vuota, aggiunta/annullamento/errore e ritorno alla bozza | Smoke test UI in tema scuro, lista vuota/piena e ritorno alla bozza superato; matrice completa e hardware aperti |
| PC reale: risveglio e stato ICMP filtrato/TCP disponibile | Aperto |
| Firma del manutentore, allineamento, impronta certificato, verifica payload e checksum dopo firma | Aperto; gli APK locali sono unsigned |

## Criterio di promozione

### Attivazione del controllo generale

La creazione di una regola abilitata e il passaggio di una regola da disabilitata ad abilitata attivano ora anche il controllo generale, nello stesso salvataggio cifrato. Le altre regole abilitate riprendono sulle occorrenze future. Modificare una regola già abilitata, salvarne una disabilitata o rifiutare un salvataggio non valido conserva invece la pausa generale.

Verifica di questa modifica: 27 test Jest, TypeScript, ESLint (0 errori, 3 avvisi di stile) e build release superati. È stato inoltre eseguito e superato un test Android mirato sul Pixel 9 / API 35, che invoca il vero AutomationModule e controlla creazione, modifica senza riattivazione, disattivazione, input non valido, riattivazione e cronologia senza invii. Non si tratta di una nuova esecuzione dell'intera suite nativa. L'emulatore read-only è stato riavviato con l'opzione di laboratorio `-skip-adb-auth` dopo un problema di autorizzazione ADB.

Gli APK unsigned sono stati aggiornati. Gli APK firmati generati prima di questa modifica non la contengono: rigenerare e firmare la build con lo stesso certificato del manutentore prima del collaudo sul telefono.

Chiudere e registrare gli esiti della matrice prima di dichiarare completato il primo rilascio del piano o pubblicare una versione stabile. In particolare la prima integrazione deve essere provata dentro MacroDroid e lo scheduler deve essere misurato in background. La candidata rende codice, contratto, test e documentazione revisionabili senza sostituire questi collaudi con promesse.

Nessun commit, push, tag o release GitHub è stato creato da questa preparazione. Per firmare/pubblicare seguire [RELEASING.md](RELEASING.md), usando un versionCode crescente per ogni build distribuita.
