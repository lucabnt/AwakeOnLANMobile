# Revisione pre-release del 3 novembre 2026

Revisione del branch `feature/wifi-discovery-diagnostics`, incluse le modifiche
locali già presenti. La verifica riguarda l'app Android; iOS resta uno scaffold.

## Problemi corretti

- **Esportazione backup:** prima si apriva il selettore di salvataggio, che poteva
  creare un file vuoto, e solo dopo veniva richiesta la password. Ora password e
  conferma vengono validate e il backup viene cifrato prima di scegliere il file.
  La conferma di successo arriva dopo scrittura, flush e chiusura del flusso.
  Durante la scelta del file si conserva solo il contenuto cifrato in memoria;
  password e archivio in chiaro non vengono salvati nello stato dell'Activity.
  Annullamento e ricreazione dell'Activity richiedono un nuovo tentativo.
- **Backup delle automazioni:** la selezione dei campi eliminava `wifiSsid` e
  `ssidCondition`. Le regole Wi-Fi non potevano completare correttamente il ciclo
  export/import e le altre regole perdevano il vincolo di rete. Entrambi i campi
  sono ora conservati. Token, cronologia e identificativi delle connessioni
  restano esclusi; le regole importate restano disabilitate.
- **Diagnostica:** una risposta di avanzamento ancora in transito poteva
  sovrascrivere il rapporto finale. Le risposte tardive vengono ora ignorate.
  Sistemata anche la gestione del montaggio dell'interfaccia e degli errori di
  annullamento.
- **Recupero IP:** il modulo nativo ora ammette una sola richiesta di recupero
  alla volta, evitando l'accodamento di scansioni ripetute riaprendo il pannello.
- **Documentazione:** aggiornati i limiti di scansione nel README da 256 indirizzi
  e /24 a 1.024 indirizzi e /22.

## Verifiche

- Jest: 33 test in 6 suite, tutti superati; nuovo caso per la risposta diagnostica
  tardiva.
- TypeScript: nessun errore.
- ESLint: nessun errore; 3 avvisi preesistenti per stili inline.
- Regressioni dipendenze: 8 test superati.
- `npm audit --audit-level=low`: 0 vulnerabilità segnalate dal registro.
- Android instrumentato: 29 test superati, nessun errore o test saltato, su
  Pixel_9 emulato con Android 15/API 35. Incluse cifratura, storage, widget,
  Quick Settings, automazioni, diagnostica, backup Wi-Fi e flusso di esportazione
  con password assente/diversa e annullamento del selettore.
- Build debug, APK dei test e release: completate. Release prodotta per
  arm64-v8a, armeabi-v7a, x86 e x86_64, con ottimizzazione R8.
- Avvio release x86_64 sull'emulatore: riuscito, con schermate Device List,
  Scan Hosts e Automation presenti. Usata una copia firmata con la sola chiave
  debug per il test, non destinata alla distribuzione; controllo ZIP alignment
  a 16 KiB superato. Gli APK release originali restano unsigned.
- Android Lint: nessun errore, 44 avvisi (API deprecate/compatibilità, risorse,
  stile e configurazione). Il receiver esterno delle automazioni resta
  intenzionalmente esportato e autentica gli eventi tramite token.
- Test C++ compilati con NDK 27.1, C++20, `-Wall -Wextra -Werror` ed eseguiti
  sull'emulatore x86_64: superati. Incluse validazioni, pacchetto UDP, gestione
  dei descrittori, timeout e cancellazione. Scansione TCP da 1.024 indirizzi:
  281 ms su loopback e 6.848 ms sulla rete riservata ai benchmark.

## Limiti della verifica

### Successiva pulizia degli avvisi

Eliminati i tre stili inline segnalati da ESLint, l'etichetta duplicata della
MainActivity e gli usi di `Uri.parse` segnalati da Lint, sostituiti con
l'estensione Kotlin equivalente. Il messaggio di importazione usa ora le risorse
plurali Android, con singolare corretto per un dispositivo.

Dopo queste modifiche: ESLint 0 avvisi/0 errori, Android Lint 34 avvisi/0 errori
(prima 44), TypeScript senza errori, 33 test Jest superati e build debug riuscita.
Gli APK release e i risultati instrumentati sopra precedono questa pulizia:
ricompilare la release prima della distribuzione.

### Prove su hardware

I risultati automatici non certificano l'assenza di vulnerabilità. Restano da
verificare su telefoni reali: risveglio effettivo del PC, restrizioni energetiche
dei produttori, riconnessioni Wi-Fi in background/Doze, riavvio, VPN e recupero ARP
su Android 7–9. L'emulatore non sostituisce queste prove.

La versione non è stata incrementata e non sono stati creati commit, tag o release.
Per pubblicare una nuova pre-release occorrono versione/versionCode nuovi,
firma con il certificato del progetto e le verifiche di distribuzione descritte
in [RELEASING.md](RELEASING.md).


## Preparazione della release successiva

La release `v1.2.0-rc.1` risulta gia pubblicata su GitHub. La nuova versione e
`1.2.0-rc.2`, con base versionCode `100201` e codici ABI `10020101`-`10020104`.
I quattro APK forniti in `android/app/release/` sono firmati con il certificato
del maintainer, ma dichiarano ancora internamente RC1 e i codici precedenti;
non possono essere rinominati come RC2 o sostituire gli asset della release pubblicata.
La preparazione RC2 rigenera i quattro APK con metadati corretti; serve la firma
con lo stesso certificato prima di pubblicare gli allegati. Nessuna chiave debug
viene usata per la distribuzione. Nuove note: `docs/releases/v1.2.0-rc.2.md`.

Verifiche ripetute sulla preparazione RC2: 33 test Jest e 8 test dipendenze
superati, TypeScript senza errori, ESLint senza errori o avvisi. I risultati
instrumentati e le prove su hardware indicate sopra mantengono il loro ambito.
