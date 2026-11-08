# Automazioni Wi-Fi, scansione e diagnostica

Implementazione nel branch `feature/wifi-discovery-diagnostics`.

## Automazioni Wi-Fi

Nel passaggio When scegliere Wi-Fi connection e inserire il nome esatto della rete
(SSID, massimo 32 byte UTF-8, maiuscole e spazi significativi). Nelle opzioni avanzate
di qualsiasi regola e disponibile Required Wi-Fi SSID: e una condizione aggiuntiva,
non un altro trigger. Il riepilogo mostra la condizione anche quando le opzioni sono chiuse.

Android richiede posizione precisa e servizi di localizzazione attivi per identificare
la rete. Per le esecuzioni in background concedere anche la posizione sempre dalle
impostazioni dell'app, accessibili dal riepilogo. SSID assente, nascosto dal sistema
o diverso da quello richiesto impedisce l'invio. I trigger Wi-Fi non richiedono allarmi esatti.

Il monitor registra un callback di sistema con PendingIntent esplicito e un callback
nel processo per gli aggiornamenti delle caratteristiche di rete. La stessa connessione
viene riconosciuta tramite avvio del sistema e identificativo della rete; il relativo
identificativo rimane nell'archivio cifrato e resiste alla ricreazione del processo.
Le riconnessioni entro cinque minuti, o entro il cooldown configurato se superiore,
non provocano nuovi tentativi. Eventi equivalenti sullo stesso PC sono deduplicati
anche tra regole. Restano applicati pausa globale, finestre orarie e giorni consentiti.
Un arresto forzato dell'app da Android richiede la riapertura dell'app.

## Scansione e aggiunta

La schermata Scan rileva IPv4, prefisso e broadcast tramite LinkProperties della
rete Wi-Fi. Use current Wi-Fi subnet ripete il rilevamento. Restano disponibili
indirizzi IPv4 singoli e subnet da /22 a /32; subnet piu grandi richiedono la scelta
manuale di una porzione di rete. VPN e reti senza IPv4 non vengono indovinate.

La scansione utilizza al massimo 16 sonde contemporanee, 1.024 indirizzi e 30 secondi.
Avanzamento e host trovati compaiono durante il lavoro. Cancel scan e la scadenza
conservano i risultati parziali e distinguono cancelled, timeout e complete.
Una scansione Ping su una rete senza risposte puo scadere prima di controllare tutti
gli indirizzi. La scansione TCP usa la porta 443: anche un rifiuto esplicito conferma
la presenza dell'host; nessuna risposta non dimostra che sia spento.

Add device apre il normale form con Status IP e IP precompilati. Per la subnet
rilevata l'IP di wake e il broadcast, mentre Status IP e l'host trovato. Per scansioni
manuali su altre reti si propone l'host stesso. Il MAC resta da inserire: una risposta
IP non consente di dedurlo. Il salvataggio mantiene le normali validazioni del form.

## Recupero IP tramite MAC

Funzione secondaria: su Android 7-9 aprire Status > Advanced diagnostics >
Older Android options > Find changed IP by MAC. La sezione e chiusa inizialmente.
Su Android 10+ sia la sezione sia il comando sono nascosti; la diagnostica
rimane dedicata alle sonde e ai risultati.

Su Android 10 e successivi l'operazione segnala unsupported senza proporre indirizzi:
le applicazioni non possono leggere `/proc/net`, inclusa la tabella ARP. Riferimento:
[restrizioni Android 10](https://developer.android.com/about/versions/10/privacy/changes#proc-net-filesystem).
Non si usano hostname, produttore o semplice presenza IP come prova del MAC.

Su Android precedenti si riscalda la tabella con una scansione TCP limitata alla
subnet Wi-Fi (massimo /22), cercando una sola associazione completa sulla stessa
interfaccia. Si verificano appartenenza alla subnet, raggiungibilita del candidato,
identita della rete e persistenza dell'associazione dopo la sonda. Accesso negato,
ambiguita o cambio rete non modificano il dispositivo. ARP e una prova di rete locale,
non un'autenticazione crittografica; dispositivi offline o dietro router non sono recuperabili.

La conferma permette di aggiornare solo Status IP, preservando il broadcast di wake,
oppure entrambi gli IP per destinazioni unicast. Cancel non salva nulla; rimozione
o cambio del MAC nel frattempo impediscono l'aggiornamento. Il percorso positivo
ARP su Android 7-9 richiede ancora una verifica su un dispositivo compatibile reale.

## Diagnostica

Dallo stesso pannello Run ten probes controlla l'indirizzo Status IP con metodo e
porta salvati. Ogni sonda mostra esito e durata; riepilogo con numero di tentativi,
percentuale di mancata risposta e durata media delle sole risposte ricevute.
La media resta assente quando non arrivano risposte. Le durate misurano l'intera
operazione di sonda, non il solo RTT ICMP. I risultati vengono pubblicati dopo ogni
sonda; annullamento e chiusura interrompono il lavoro dopo la sonda in corso
(timeout massimo di un secondo). Si ammette una sessione per modulo alla volta.

## Verifiche del 3 novembre 2026

- TypeScript: `npx tsc --noEmit`.
- Jest: 32 test, 6 suite, tutti passati. Inclusi precompilazione dalla scansione,
  conferma prima del salvataggio, recupero secondario sui vecchi Android,
  comando nascosto su Android 10+, riepilogo diagnostico
  e creazione di una regola Wi-Fi con condizione SSID.
- ESLint: nessun errore; tre avvisi preesistenti per stili inline.
- Build Android debug x86_64 e APK dei test: completate, inclusa generazione
  del bridge ScanProgress e compilazione C++.
- Android instrumentato: 16 test passati su Pixel_9 emulato, Android 15 API 35,
  classi NetworkFeaturesTest, AutomationTest e DeviceFeaturesTest. Verificati
  SSID reale, invio UDP singolo, eventi ripetuti sulla stessa connessione,
  protezione dalle riconnessioni, condizione SSID negativa, dieci sonde,
  perdite, media senza risposte e cancellazione parziale.
- Test C++ compilati con NDK 27.1, C++20 e `-Wall -Wextra -Werror`, eseguiti
  sullo stesso emulatore: passati, incluse scadenza e cancellazione con risultati parziali.
- Benchmark TCP da 1.024 indirizzi: 182 ms su loopback e 6.865 ms nella rete
  riservata ai benchmark 198.18.0.0/22. Massimo 16 operazioni simultanee;
  limite di 30 secondi mantenuto. Il benchmark non misura consumi o prestazioni
  di telefoni fisici, reti Wi-Fi reali o firmware con risparmio energetico aggressivo.

Per ripetere i test Android usare `:app:connectedDebugAndroidTest` con le tre classi
sopra; i test di rete richiedono Wi-Fi dell'emulatore e localizzazione disponibili.
Il benchmark e incluso in `cpp/tests/security_tests.cpp`, gia eseguito dalla CI Linux.
