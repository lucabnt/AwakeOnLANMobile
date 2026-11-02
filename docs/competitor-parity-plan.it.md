# Piano di parità funzionale: WolLight e OpenWOL

Analisi del 2 novembre 2026. Baseline locale: AwakeOnLANMobile 1.1.0, commit `a31c0a2`. Questo documento pianifica il lavoro: non introduce funzionalità nell'app.

Stato implementazione: candidata locale **1.2.0-rc.1**, punti 1–5 in sviluppo/verifica. Vedere [note della candidata](releases/v1.2.0-rc.1.md), [guida automazioni](automation.md) e [registro delle prove e collaudi aperti](automation-validation.it.md). I criteri P0 su hardware e il collaudo end-to-end MacroDroid restano necessari prima di dichiarare completato il primo rilascio.

## Obiettivo e metodo

Raggiungere la parità nelle funzionalità d'uso Android dei due concorrenti, mantenendo archivio cifrato, backup portabile, widget e Quick Settings già disponibili. Su richiesta dell'utente, il prodotto deve andare oltre la parità con automazioni a orario e su evento come funzione centrale; il collegamento Wi-Fi resta uno dei trigger. Il monitoraggio deve essere graficamente discreto. La scheda `Automation` sostituisce `Add Device`, che diventa un pulsante `+` nella Device List.

Confronto documentale dei repository e delle schede F-Droid, più ispezione del codice locale; non sono state eseguite prove delle APK concorrenti. Riferimenti consultati: WolLight 1.0.8 e OpenWOL 1.0.3 nelle schede F-Droid. I README dei rami principali possono anticipare le release: durante la prima fase fissare tag/commit e verificare le APK. “ND” significa non documentato nelle fonti consultate, non assenza dimostrata.

## Confronto funzionale

| Funzionalità | AwakeOnLANMobile oggi | WolLight | OpenWOL | Intervento |
|---|---|---|---|---|
| Dispositivi salvati, MAC, destinazione e porta | Presente | Presente | Presente | Conservare |
| Automazione alla connessione a un SSID | Assente | ND | Presente | Priorità P1 |
| Notifica di esecuzione della regola | Assente | ND | Opzionale | P1 |
| Scansione LAN | Input manuale, /24–/32, 256 indirizzi, 30 s | Subnet automatica, fino a 1.024 host | Esplicitamente esclusa | P2 |
| Nomi host e registrazione dai risultati | Nomi non risolti; nessuna azione di aggiunta | Presenti | Nessuna scansione | P2 |
| Verifica dopo il wake | Assente | Monitor annullabile, circa 2 s / 60 s | ND | P1 |
| Stato dei dispositivi | TCP su richiesta | Ping all'avvio/rientro; due risultati concordi | Esclude ping in background | P1 |
| Diagnostica ping | Solo rilevamento nella scansione | Dieci ping, tempi e riepilogo | ND | P2 |
| Recupero IP cambiato | Assente | Ricerca per MAC, conferma dell'utente | ND | P2, fattibilità da validare |
| Widget | Presente, anche multipli | ND | In roadmap | Conservare |
| Quick Settings | Presente | ND | ND | Conservare |
| Backup | Cifrato, dispositivi e impostazioni | ND | In roadmap | Estendere alle regole |
| Protezione archivio | AES-GCM / Android Keystore | Database locale; cifratura ND | Cifratura ND | Conservare |
| Account, pubblicità, cloud obbligatori | Nessuno | Nessuno | Nessuno | Conservare |
| Gruppi di dispositivi | Assenti | ND | In roadmap | P3, oltre la parità |
| Orario singolo e ricorrenze settimanali | Assenti | ND | ND | P1, requisito di prodotto |
| Eventi esterni collegati a una regola | Assenti | ND | ND | P1, contratto d'integrazione |
| Calendario / NFC / altri connettori specifici | Assenti | ND | ND | P3; prima versione tramite integrazione esterna |
| Android minimo | 7; backup da 8 | 8 | 5 | Mantenere 7; niente retroporting a 5 |

Fonti delle colonne concorrenti: [README WolLight](https://github.com/iwadjp/wol-light), [F-Droid WolLight](https://f-droid.org/en/packages/com.iwadjp.wollight/), [README OpenWOL](https://gitlab.com/julien.cardoux/openwol/-/raw/master/README.md), [F-Droid OpenWOL](https://f-droid.org/en/packages/com.juliencardoux.openwol/). La parità proposta riguarda le funzionalità, non ogni versione Android o lingua supportata.

## Valutazione

La priorità è poter dire “accendi il PC nei giorni lavorativi alle 08:30” oppure “accendilo quando arriva un evento collegato”. Una regola separa trigger, condizioni e azione: per esempio l'orario è il trigger e “solo sulla rete Casa” è una condizione, senza eseguire il wake a ogni collegamento. Per questa revisione, “evento collegato” indica un segnale inviato da un'altra app di automazione a una regola esplicitamente abilitata; il provider specifico resta da scegliere in P0. Il modello permette connettori futuri senza promettere di intercettare qualsiasi evento Android.

Il trigger Wi-Fi resta utile e opzionale. OpenWOL documenta attivazioni indesiderate dopo interruzioni di corrente o riconnessioni: filtrare eventi duplicati e disconnessioni brevi, senza promettere di distinguere sempre un rientro reale da un riavvio del router. [Problema documentato da OpenWOL](https://gitlab.com/julien.cardoux/openwol/-/raw/master/README.md).

Il monitor di avvio riduce l'incertezza dopo l'invio. Lo stato deve restare “raggiungibile / non verificato”: una mancata risposta non dimostra lo spegnimento e una risposta non dimostra che il desktop sia pronto.

La scoperta automatica riduce la configurazione manuale. Il recupero dell'IP è utile ma dipende dalla possibilità di associare in modo attendibile MAC e IP su Android: deve essere preceduto da una prova tecnica, non affidato a euristiche sul nome host.

## Fasi, dipendenze e stime

### Ordine operativo e rilasci

Questa sequenza definisce la priorità di implementazione. I codici P0–P2 nelle sezioni successive raggruppano gli ambiti tecnici: non impongono di completare tutto P1b prima di P1c.

| Ordine | Intervento | Riferimento |
|---|---|---|
| 1 | Verifiche Android: scheduler, primo evento esterno, background e fattibilità MAC | P0 |
| 2 | Tab Automation, pulsante + in Device List, motore e gestione delle regole | P1a |
| 3 | Automazioni a orario singolo e ricorrenze settimanali | P1b, scheduler |
| 4 | Automazioni su evento esterno con una prima integrazione concreta verificata | P1b, ingresso eventi |
| 5 | Monitoraggio discreto nella lista e verifica dopo Wake | P1c |
| 6 | Collegamento Wi-Fi come trigger e SSID come condizione | P1b, Wi-Fi |
| 7 | Scansione della rete rilevata e aggiunta dai risultati | P2a, scoperta |
| 8 | Recupero dell'IP cambiato con conferma | P2b, recupero IP |
| 9 | Diagnostica avanzata, ampliamento scansione a reti più grandi e rifiniture | P2a, diagnostica; P2c |

**Primo rilascio:** punti 1–5, inclusi backup delle regole, test pertinenti e verifica su dispositivi reali. Comprende orari, una prima integrazione eventi, nuova navigazione e monitoraggio discreto; il trigger Wi-Fi e la condizione SSID arrivano successivamente. Se il primo evento da integrare non è ancora definito, chiarirlo durante P0 prima di implementare il punto 4.

**Secondo rilascio:** punti 6–9, con Wi-Fi, scoperta, recupero IP e diagnostica. La ricerca del nuovo IP dipende dalla scansione e dall'associazione MAC/IP verificata: non precede il punto 7.

Backup delle regole, migrazioni, documentazione e test accompagnano le funzionalità cui si riferiscono. La descrizione del backup è raccolta in P2b per tema, ma la sua implementazione avviene insieme alle regole e prima del primo rilascio. P2c descrive anche le verifiche da applicare a ciascun rilascio, non soltanto alla fine.

### Stime per ambito

Stime preliminari in giorni di lavoro di uno sviluppatore, comprensive di test pertinenti e revisione; non sono scadenze. L'incertezza maggiore riguarda Android in background e scoperta MAC.

| Fase | Risultato | Dipendenze | Stima |
|---|---|---|---|
| P0 | Prove scheduler, eventi esterni, SSID/background e MAC | Nessuna | 4–6 giorni |
| P1a | Motore regole, persistenza, tab Automation e pulsante + | P0 per contratto eventi | 6–9 giorni |
| P1b | Scheduler orario, ingresso eventi e trigger Wi-Fi opzionale | P0, P1a | 8–12 giorni |
| P1c | Monitor avvio, stato in lista e aggiornamento al rientro | Servizi di rete condivisi | 3–5 giorni |
| P2a | Scansione automatica, aggiunta, nomi e diagnostica | P0, contratti scansione | 5–8 giorni |
| P2b | Recupero IP e backup delle automazioni | P1a, P2a | 3–5 giorni |
| P2c | Verifica su dispositivi, documentazione e release | Tutte le precedenti | 3–5 giorni |

Totale indicativo aggiornato: 32–50 giorni, circa 7–10 settimane lavorative. Le stime sono aggregate per ambito e non vanno sommate nuovamente per i singoli punti dell'ordine operativo. P0 può modificarle; se la scoperta MAC non è realizzabile senza privilegi, il recupero automatico resta una lacuna dichiarata. Il primo rilascio segue i punti 1–5 sopra; Wi-Fi e scoperta appartengono al secondo. Connettori nativi calendario/NFC non sono inclusi nella stima.

## P0 — Ridurre le incertezze prima di costruire la UI

- Verificare AlarmManager in Doze, permessi per allarmi esatti, riavvio, cambio ora/fuso e ora legale; provare anche l'invio UDP nella finestra di esecuzione concessa dal sistema. Un allarme consegnato non implica disponibilità della rete.
- Definire e provare un contratto di evento esterno con almeno un'app compatibile scelta in P0 (ad esempio Tasker o un'alternativa libera). Specificare autenticazione, deduplicazione e risposta d'esito; non dichiarare compatibilità con app non provate.
- Verificare lettura SSID, callback di rete e comportamento a schermo spento, con app rimossa dai recenti, processo terminato, riavvio e arresto forzato. Distinguere questi casi: non promettere attività dopo un arresto forzato.
- Prototipare un servizio Kotlin abilitato esplicitamente dall'utente mentre l'app è visibile. Valutare servizio foreground con tipo e permessi appropriati; non usare timer JavaScript come infrastruttura delle automazioni.
- Preparare una matrice API 24/26, 29/30, 31/33, 34/35/36 e versione più recente disponibile nel laboratorio; almeno un Pixel e un dispositivo con gestione batteria aggressiva. Documentare cosa accade se il sistema interrompe il servizio e come riattivarlo.
- Verificare accesso al MAC dei peer senza root né API nascoste. Se non disponibile, consentire MAC manuale e dichiarare non supportato il recupero per MAC su quella configurazione.
- Provare selezione della rete Wi-Fi con VPN attiva, Ethernet e più interfacce; nessun bypass silenzioso di una VPN.

Android limita l'avvio di servizi foreground dal background e l'uso dei permessi disponibili solo durante l'uso. Il permesso “dispositivi nelle vicinanze” non va assunto come sostituto universale della localizzazione: il flusso dipende dalle API effettivamente chiamate. Fonti: [permessi Wi-Fi](https://developer.android.com/develop/connectivity/wifi/wifi-permissions), [restrizioni avvio servizi](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [servizio di tipo location](https://developer.android.com/develop/background-work/services/fgs/service-types#location).

Criterio di uscita: tabella dei comportamenti verificati, permessi minimi motivati, precisione effettiva dello scheduler, contratto eventi validato, strategia di riavvio supportata e decisione sulla scoperta MAC. Nessuna promessa di automazione affidabile basata soltanto su una prova in foreground.

## P1a/P1b — Automazioni a orario e su evento

### Navigazione e flusso di creazione

- Schede: `Device List`, `Automation`, `Scan Hosts`. Device List resta la schermata iniziale.
- Rimuovere `Add Device` dalla barra delle schede. Un pulsante `+` sempre disponibile nella Device List apre il form esistente in una schermata dedicata o modal; etichetta accessibile “Aggiungi dispositivo”. Nello stato vuoto mostrare anche un invito testuale ad aggiungere il primo dispositivo.
- Salvare torna alla lista evidenziando il nuovo dispositivo; annullare non salva. Riutilizzare `DeviceForm.tsx`, le validazioni e la persistenza attuali. Se si arriva dalla creazione di una regola senza dispositivi, tornare alla bozza della regola con il nuovo dispositivo selezionato.
- `Automation` mostra regole, interruttore attiva/disattiva, prossimo orario oppure evento atteso, ultimo esito e pulsante `+`. Editor: nome → dispositivo → trigger → eventuali condizioni → riepilogo e salvataggio.
- Aggiornare `TabNavigator.tsx`, `DeviceListScreen.tsx`, `AddDeviceScreen.tsx` e introdurre `AutomationScreen.tsx`/editor; mantenere il percorso di aggiunta dai risultati di scansione.

### Trigger e condizioni della prima versione

| Tipo | Configurazione | Esempio |
|---|---|---|
| Orario singolo | Data e ora | Domani alle 08:30 |
| Orario ricorrente | Ora e giorni della settimana | Lun–ven alle 08:30 |
| Evento esterno | Collegamento esplicito alla regola | Un'altra app segnala l'inizio di un evento |
| Connessione Wi-Fi | SSID esatto | Quando mi collego a Casa |

Ogni regola ha un solo trigger nella prima versione. Condizioni facoltative in AND: SSID richiesto e fascia oraria/giorni ammessi, anche a cavallo della mezzanotte. La fascia oraria è un filtro, non un secondo scheduler. Azione iniziale: invio WoL a un dispositivo; niente catene tra regole o cicli. Un evento calendario può essere tradotto in evento esterno da un'app compatibile, ma non equivale a un'integrazione calendario già inclusa.

### Pianificazione e consegna degli eventi

- Scheduler Kotlin con AlarmManager e allarmi singoli: dopo ogni occorrenza calcolare la successiva, senza timer JavaScript né servizio permanente per le sole regole orarie.
- Distinguere modalità puntuale e flessibile. Quella puntuale richiede l'accesso di sistema agli allarmi esatti dove previsto; se negato/revocato, indicare regola sospesa e offrire la modalità flessibile solo su scelta dell'utente. Non degradare silenziosamente la precisione. WorkManager non va usato come sveglia puntuale. [Documentazione Android sugli allarmi](https://developer.android.com/develop/background-work/services/alarms).
- Usare l'ora locale del telefono e mostrare il prossimo avvio. Ricalcolare dopo riavvio e cambio di fuso/ora. Ora legale: ora inesistente saltata, ora ripetuta eseguita una sola volta. Persistenza dell'identità dell'occorrenza per impedire duplicati.
- Default proposto: saltare un'occorrenza se consegnata oltre 5 minuti dall'orario previsto, registrando il motivo; tolleranza configurabile e visibile. Telefono spento, rete assente o condizione non rispettata non provocano risvegli arretrati al ritorno online. Le regole flessibili devono mostrare una tolleranza coerente con la modalità scelta, senza promettere una finestra garantita in Doze.
- Ingresso esterno disabilitato di default, attivabile per regola. Usare un endpoint esplicito con capacità revocabile per regola, validazione e limiti di frequenza: conoscere un ID non basta per attivarla. Nessun parametro esterno può sostituire MAC, destinazione o password. Proteggere la capacità come un segreto e non includerla nei log o nel backup.
- Ogni evento include un'identità per deduplicazione; controllare regola e condizioni subito prima dell'invio. Ricevere un evento significa accettare una richiesta, non confermare che il PC sia acceso. Nessun server HTTP in ascolto nella prima versione.

### Comportamento proposto

Una regola contiene ID, versione, nome, abilitazione, trigger tipizzato con la sua configurazione, condizioni, ID del dispositivo, intervallo minimo tra esecuzioni, tolleranza ai ritardi e preferenza per la notifica di esito. Tempo minimo fuori rete e stabilità della connessione si applicano solo al trigger Wi-Fi. Prima versione: un dispositivo per regola.

- Sezione Automazioni con creazione, modifica, eliminazione, attiva/disattiva e “Prova ora”, chiaramente identificata come invio reale.
- Riepilogo leggibile: “Lun–ven alle 08:30, se sono sulla rete Casa, accendi PC studio”. Mostrare prossimo avvio/evento atteso e motivo di sospensione.
- Solo per trigger Wi-Fi: connessione stabile per 5 secondi, assenza minima di 2 minuti, intervallo minimo di 15 minuti. Parametri da verificare durante P0; non imporli indistintamente a orari ed eventi esterni.
- Primo avvio del monitor Wi-Fi sulla rete già collegata: registrare lo stato iniziale senza inviare. Il trigger Wi-Fi richiede una nuova transizione valida; callback duplicate e ripresa del processo non devono generare un altro wake.
- SSID sconosciuto o permessi Wi-Fi revocati sospendono solo le regole che dipendono da quel dato. Le regole orarie senza condizioni SSID restano indipendenti. Se la rete richiesta cambia prima dell'invio, scartare il lavoro pendente.
- Interruttore globale; pausa dalla notifica del servizio Wi-Fi se attivo. Distinguere notifica del servizio richiesta dalla piattaforma e notifica facoltativa per ogni wake, disattivata per default. Le sole regole orarie non richiedono il monitor Wi-Fi permanente.
- Cronologia locale limitata, ad esempio 100 eventi: ora, regola, pacchetto inviato/errore/saltato e motivo. Nessuna password nei log.

### Architettura e dati

Introdurre `AutomationRule`, `AutomationEngine`, `AutomationScheduler`, `AutomationEventReceiver`, `WifiAutomationService` e un bridge `AutomationModule`. Il motore comune valuta trigger, condizioni, deduplicazione e azione ed è testabile senza Android; gli adattatori orario/evento/Wi-Fi producono eventi normalizzati. Il bridge espone CRUD, stato e prova, mentre React Native gestisce la UI. Abilitare solo gli osservatori necessari alle regole attive; eliminare o disabilitare una regola cancella gli allarmi pendenti e revoca l'ingresso esterno relativo.

Estrarre invio e reachability da `WidgetDevice.kt` in servizi riutilizzabili, mantenendo la compatibilità del formato del pacchetto con C++. Le automazioni caricano il dispositivo per ID al momento dell'invio tramite la coda di `DeviceStorageAccess`: niente copie di MAC o password negli Intent. Gestire deduplicazione per evento/dispositivo anche tra regole.

Persistenza delle regole cifrata e versionata, scritture atomiche; SSID trattato come dato privato. Verificare `ProtectedDeviceStore.kt`, validatori TypeScript e `DeviceBackup.kt` prima di cambiare schema: oggi le proprietà sconosciute vengono scartate. Eliminare un dispositivo deve disabilitare le regole collegate; rileggere la validità prima di inviare per coprire modifiche concorrenti.

La scelta di abilitare automazioni autorizza esplicitamente gli invii automatici a telefono bloccato dopo il primo sblocco. Widget e tile mantengono il requisito di sblocco attuale. Prima del primo sblocco dopo un riavvio non accedere all'archivio né inviare pacchetti.

### Accettazione

Verificare occorrenze singole e settimanali, cambio ora/fuso, ora legale, consegna tardiva, riavvio, negazione/revoca dell'accesso agli allarmi esatti e rete indisponibile. Un evento esterno autorizzato avvia solo la regola collegata; eventi duplicati, credenziali revocate e input malformati non inviano. Una condizione SSID limita una regola oraria senza trasformare ogni collegamento in trigger. Verificare il pulsante + con lista vuota/piena, annullamento, errore di salvataggio e ritorno alla bozza di automazione.

Per il trigger Wi-Fi, una connessione valida genera un solo invio; rimbalzi Wi-Fi, callback ripetute e riavvio del processo non lo duplicano. Regola disabilitata, dispositivo eliminato, archivio illeggibile o SSID richiesto ma non disponibile non inviano. Verificare diniego/revoca permessi, risparmio energetico, rete senza Internet e VPN. Il motore manuale continua a funzionare senza concedere i permessi delle automazioni. Documentare la finestra di crash in cui UDP non consente una garanzia assoluta di “esattamente una volta”; preferire non ripetere automaticamente un invio incerto.

## P1c — Verifica del risveglio e stato

Estendere `DeviceActionsModule.kt`, `src/services/deviceActions.ts` e `DeviceFlatList.tsx` con sessioni cancellabili e risultati strutturati: in corso, raggiungibile, timeout, errore, annullato. Riutilizzare `statusIp` e `statusPort`; aggiungere modalità ICMP/TCP con validazione coerente.

Proposta: controllo ogni 2 secondi per massimo 60 secondi dopo il wake in app, con limite di concorrenza e nessuna sovrapposizione delle sonde. Aggiornamento limitato all'apertura/rientro della lista e su richiesta, con due osservazioni concordi per stabilizzare l'indicatore. Nessun monitor continuo nascosto. Mostrare separatamente esito invio UDP ed esito verifica.

Presentazione discreta: una piccola icona e una breve etichetta nella riga del dispositivo (“Verifica…”, “Raggiungibile”, “Non verificato”), in uno spazio stabile che non sposti i controlli. Niente modal automatiche, schermate dedicate, grandi barre di progresso, contatori o notifiche ripetute. Il colore non è l'unico indicatore. Un tap sullo stato apre, su richiesta, ultimo controllo, dettagli e annullamento; gli aggiornamenti non devono generare annunci continui dello screen reader. Gli errori restano consultabili nella riga o nei dettagli.

Le automazioni registrano l'esito dell'invio nella loro cronologia senza aprire schermate. Il monitor post-wake della prima versione accompagna gli invii in app; un controllo prolungato dopo esecuzioni in background resta opzionale futuro, da valutare con i vincoli di esecuzione Android. Non introdurre un servizio sempre attivo soltanto per aggiornare un indicatore.

Accettazione: arresto al risultato o alla scadenza, cancellazione alla chiusura della sessione, niente socket/processi orfani; un timeout resta “non verificato”. Verificare anche dispositivi che filtrano ICMP ma rispondono TCP. La lista resta utilizzabile durante il controllo, senza aperture automatiche, cambi di altezza delle righe o notifiche per ogni sonda.

## P2a — Scoperta e diagnostica

“Da migliorare” indica un flusso oggi incompleto: la scansione esiste, ma richiede l'inserimento manuale dell'IP/subnet e restituisce una lista senza azione di salvataggio. Il backend non risolve attualmente i nomi host. Il nuovo flusso deve permettere di scegliere “Scansiona rete attuale”, riconoscere un risultato e aggiungerlo senza ricopiare i dati.

| Oggi | Risultato previsto |
|---|---|
| IP o subnet digitati a mano | Rete attuale rilevata e proposta; input manuale ancora disponibile |
| Risultati principalmente come indirizzi IP | Nome quando ricavabile, IP sempre visibile e MAC solo se disponibile |
| Nessun pulsante di aggiunta nei risultati | `+` sul risultato apre il form precompilato; salvataggio esplicito |
| Indicatore di caricamento e risultati al termine | Progresso e risultati parziali, mantenendo annullamento e limiti |
| Massimo 256 indirizzi | Supporto fino a 1.024 peer dopo verifica di prestazioni e cancellazione |

“Automatica” riguarda il rilevamento della rete e la compilazione dei dati: la scansione parte su richiesta, non continuamente in background, e non salva automaticamente tutti gli host trovati. Evidenziare dispositivi già registrati quando l'identità è verificabile; non considerarli uguali soltanto perché hanno lo stesso IP. Se il MAC non è disponibile, richiederlo nel form senza inventarlo.

Intervenire su `ScanHostsScreen.tsx`, `specs/NativeModule.ts`, `cpp/net_scan.*` e un nuovo componente Kotlin per le informazioni di rete.

- Rilevare subnet reale e broadcast, proporre la rete selezionata e conservare input manuale. Gestire subnet ambigue, /31, /32, indirizzo locale e cambio rete.
- Portare il limite a 1.024 peer solo con concorrenza limitata, progresso effettivo, cancellazione e timeout complessivo verificati. Mostrare risultati parziali; nessuna riduzione silenziosa di reti troppo grandi.
- Aggiungere nomi via mDNS/NetBIOS con budget temporale indipendente; IP come fallback. Non reintrodurre DNS bloccante nel worker di scansione.
- “Aggiungi dispositivo” precompila nome, IP di stato e broadcast; richiede MAC manuale se non ricavabile. Il broadcast non deve diventare l'IP di stato.
- Diagnostica: dieci sonde, tempi individuali, perdite e media; cancellabile. Differenziare tempi ICMP da tempi di connessione TCP.

Accettazione: rete /24 e /22, più interfacce, VPN, rete interrotta e host senza nomi. Il limite temporale e la cancellazione restano validi anche durante la risoluzione dei nomi.

## P2b — Recupero IP e backup

### Recupero dell'IP cambiato — funzionalità inclusa

Caso d'uso: il router assegna al PC un nuovo IP e quello salvato non risponde più. L'utente deve poter ritrovare il dispositivo senza eliminarlo e ricrearlo. Dipende dalla scansione P2a e dalla prova di associazione MAC/IP in P0; non è un'estensione rinviata a P3.

- Rendere disponibile “Cerca nuovo IP” nei dettagli/menu del dispositivo e, dopo una verifica fallita, come azione discreta nei dettagli dello stato. Nessuna finestra automatica o scansione ripetuta in background.
- Su richiesta, eseguire una ricerca cancellabile nella LAN selezionata e confrontare il MAC salvato con quello rilevato. Un PC spento o non identificabile può non essere trovato: non interpretare il fallimento come cancellazione del dispositivo.
- Se esiste una corrispondenza verificata e non ambigua, mostrare vecchio e nuovo indirizzo e chiedere conferma. Aggiornare `statusIp`; conservare la destinazione broadcast del wake. Se il wake usa un indirizzo unicast, proporre separatamente l'aggiornamento di quella destinazione.
- Conservare ID, nome, MAC, regole, widget e tile. Salvare attraverso l'archivio cifrato e serializzato; prima della conferma verificare che il dispositivo non sia stato eliminato o modificato nel frattempo.
- Se il MAC non è accessibile o i risultati sono ambigui, non aggiornare automaticamente: spiegare l'esito e offrire modifica manuale. Mai sostituire un IP sulla sola somiglianza del nome o su una semplice risposta ping.

Accettazione specifica: IP cambiato con stesso MAC, vecchio IP riassegnato a un altro host, nessuna corrispondenza, risultati ambigui, cancellazione, cambio rete e errore di salvataggio. Il broadcast deve restare invariato; i collegamenti delle automazioni e delle scorciatoie devono sopravvivere all'aggiornamento.

### Backup delle regole

Versionare il backup per includere le regole. Durante l'import, rimappare i riferimenti ai nuovi ID dei dispositivi; importare le regole disabilitate e richiedere riattivazione esplicita sulla nuova installazione. Leggere ancora i backup precedenti e rifiutare versioni future non supportate senza alterare l'archivio. Non importare cronologia, timer o autorizzazioni del sistema.

Accettazione: round trip cifrato su altra installazione, vecchio backup, import ripetuto, riferimenti invalidi, password errata e scrittura interrotta. Widget e tile esistenti devono conservare i propri collegamenti.

## P2c — Verifica e criterio di completamento

Eseguire test Jest/TypeScript/lint, test C++ su parsing e cancellazione, test Android su archivio/servizio/permessi, build release e prove su hardware delle automazioni. Usare un ricevitore UDP di laboratorio per verificare numero e contenuto dei pacchetti; poi un PC reale per risveglio e rilevazione.

La parità è raggiunta quando tutte le righe P1/P2 della matrice sono disponibili e verificate nel perimetro Android dichiarato, oppure sono esplicitamente indicate come lacune residue. Aggiornare README, note tecniche, guida permessi e release notes con i limiti effettivi. Non basta una schermata Automazioni se il servizio non funziona a schermo spento.

## P3 — Estensioni successive, fuori dalla parità attuale

Connettori nativi calendario e NFC, ulteriori eventi di sistema, gruppi e invio multiplo, combinazioni avanzate di trigger, monitor post-wake in background, import da altri formati e localizzazione italiana. Orari, giorni/fasce e ingresso eventi esterni sono invece parte di P1 per richiesta dell'utente, anche se oltre la parità documentata. Ogni connettore aggiuntivo richiede un contratto e prove specifiche. Anche la pubblicazione su F-Droid va trattata come attività distributiva distinta, con verifica della build e delle dipendenze.
