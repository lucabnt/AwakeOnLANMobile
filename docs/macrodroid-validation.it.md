# Collaudo reale MacroDroid — 3 novembre 2026

Esito: **superato nella configurazione provata**. Una macro configurata attraverso la UI di MacroDroid ha eseguito il percorso Screen Off → Send Intent → receiver AwakeOnLANMobile → magic packet UDP. Non è un broadcast ADB inviato direttamente al receiver.

## Ambiente e perimetro

- Baseline applicativa: commit `fff6302`, branch `feature/automation-v1.2.0`, APK debug x86_64; nessuna modifica al codice di produzione.
- Pixel 9 emulato, Android 15 / API 35, sessione `-read-only -no-snapshot -no-window -no-audio -skip-adb-auth`, senza salvataggio delle modifiche all'AVD originale.
- MacroDroid **6.0.11**, versionCode `600000011`, target SDK 36, APK universal originale del [thread dell'autore](https://macrodroidforum.com/index.php?threads/v6-0.12383/), [download usato](https://macrodroidlink.com/beta/macrodroid_v6_0_11_beta-universal.apk). È la build del canale beta ufficiale, non una dichiarazione di verifica di tutte le versioni disponibili.
- SHA-256 APK MacroDroid: `9b314cee67a9dc3f3afe4711688eac0deae2b8e664e97eecf725a552889c97e4`; firma verificata con apksigner, certificato CN Jamie Higgins / O Arlosoft, SHA-256 `b40e273464148c85227ce46ba360096bf405dd93d70c14668a83d205e59ffdb1`.
- Fixture Android opzionale: `android/app/src/androidTest/java/com/awakeonlanmobile/MacroDroidAcceptanceTest.kt`. Due regole esterne abilitate, credenziali diverse, stesso PC fittizio con MAC `00:11:22:33:44:55`, destinazione esclusivamente `127.0.0.1` e porta UDP temporanea. Nessun PC dell'utente coinvolto.

Il fixture prepara gli archivi cifrati e ascolta UDP; non emette Intent e non chiama `AutomationEngine.execute`. Gli eventi partono dalla vera azione Send Intent di MacroDroid. ADB viene usato per installazione, tocchi/tastiera, spegnimento/riaccensione dello schermo e controllo del laboratorio. Pausa/ripresa e rotazione sono predisposte dal fixture nell'archivio nativo; questa sessione non ricollauda i rispettivi pulsanti della UI AwakeOnLANMobile.

## Macro e risultati

Macro `AwakeOnLAN-Lab`, trigger **Screen Off**, azione **Send Intent**, nessun vincolo. Broadcast esplicito, categoria None, dati/MIME vuoti e flags 0; action/package/class e tre extra come nella [guida](automation.md#macrodroid-first-integration-selected-for-validation). Nessun helper, account, accessibilità o plugin aggiuntivo usato. L'installazione gratuita era utilizzabile senza acquisto.

| Checkpoint | Operazione effettiva | Pacchetti cumulativi attesi/ricevuti |
|---|---|---|
| `first` | Screen Off con `lab-event-1` | 1 / 1 |
| `duplicate` | Nuovo Screen Off, stesso ID fisso | 1 / 1 |
| `dynamic_first` | ID impostato a `lab-{system_time_ms}`, Screen Off | 2 / 2 |
| `dynamic_second` | Altro Screen Off senza modificare la macro | 3 / 3 |
| `paused` | Controllo generale in pausa, nuovo evento dinamico | 3 / 3 |
| `resumed` | Controllo generale ripreso, nuovo evento dinamico | 4 / 4 |
| `revoked_token` | Token ruotato nel fixture, macro ancora con quello vecchio | 4 / 4 |
| `new_token` | Macro aggiornata con il nuovo token; tre extra esplicitamente String | 5 / 5 |

Ogni ciclo attende cinque secondi dopo lo spegnimento prima del checkpoint. I primi invii usano Auto Detect Type con valori non numerici; l'ultimo verifica esplicitamente String per tutti e tre gli extra. Usare String è la configurazione consigliata.

Tutti i cinque datagrammi sono lunghi **102 byte**, con sei byte `FF` seguiti da sedici ripetizioni del MAC previsto, confrontati byte per byte. Tutte le cinque voci di cronologia hanno esito `sent` e ID `macrodroid-lab-rule`; la seconda regola non compare. Gli ID dinamici sono effettivamente sostituiti da MacroDroid: se il testo fosse rimasto letterale, il secondo evento sarebbe stato rifiutato o deduplicato.

Il runner ha restituito `OK (1 test)`, durata 551,624 secondi. Rapporto finale locale: `release-artifacts/1.2.0-rc.1/qa/macrodroid/final.json`, con `finished: true`, cinque pacchetti e otto checkpoint. Nella stessa cartella ignorata da Git sono conservati i rapporti intermedi e la schermata della macro senza credenziali. Una prima sessione del 2 novembre aveva già verificato primo invio e duplicato, ma era stata interrotta: non viene contata come test concluso.

Il fixture ripristina gli archivi precedenti nel `finally`, elimina il file delle credenziali temporanee e chiude il socket. La sessione temporanea dell'emulatore risulta chiusa al termine; nessuna installazione è stata eseguita su telefono fisico.

## Ripetere la prova

1. Usare esclusivamente un emulatore usa e getta. Installare MacroDroid originale, l'APK debug dell'app e l'APK androidTest, compilati con JDK 21 e `:app:assembleDebug :app:assembleDebugAndroidTest -PreactNativeArchitectures=x86_64`. Il fixture rifiuta hardware diversi da ranchu/goldfish ed è saltato senza attivazione esplicita.
2. Avviare in un terminale, selezionando il seriale dell'emulatore:

   ```powershell
   adb -s emulator-5580 shell am instrument -w -e class com.awakeonlanmobile.MacroDroidAcceptanceTest -e macrodroidAcceptance true com.awakeonlanmobile.test/androidx.test.runner.AndroidJUnitRunner
   ```

3. Il fixture attende fino a 30 minuti. Leggere privatamente `files/macrodroid-lab/credentials.json` tramite `run-as com.awakeonlanmobile` per configurare `rule_id` e `token` nella macro. Non pubblicare token, dump UI o macro esportate con credenziali. Configurare il trigger Screen Off e l'azione indicata sopra.
4. Per ogni riga della tabella, eseguire il vero evento Screen Off, attendere cinque secondi e inviare il checkpoint al fixture. Per esempio, da un secondo terminale:

   ```powershell
   adb -s emulator-5580 shell input keyevent 223
   # Attendere cinque secondi, quindi:
   adb -s emulator-5580 shell "run-as com.awakeonlanmobile sh -c 'echo check:first:1 > files/macrodroid-lab/command'"
   adb -s emulator-5580 shell input keyevent 224
   adb -s emulator-5580 shell wm dismiss-keyguard
   ```

5. Il file di comando accetta anche `pause`, `resume`, `rotate` e `finish`. Attendere la sua elaborazione prima del prossimo evento. Dopo `rotate`, rileggere privatamente le credenziali solo quando si aggiorna la macro per `new_token`. Il rapporto senza token è `files/macrodroid-lab/report.json`; controllare che includa il checkpoint atteso. Un conteggio errato o una voce di cronologia per l'altra regola fa fallire il test.
6. Dopo tutti gli otto checkpoint inviare `finish`, attendere `OK (1 test)`, conservare il rapporto finale e chiudere l'emulatore temporaneo. Non distribuire gli APK firmati debug usati per questa prova.

Per l'ID dinamico, `{system_time_ms}` è descritto nella [documentazione ufficiale Magic text](https://macrodroidforum.com/wiki/index.php/Magic_text). L'esempio con timestamp non garantisce unicità assoluta e non conserva l'identità nei ritentativi: per questi casi usare il contatore persistente descritto nella guida.

## Limiti e verifiche ancora aperte

L'instrumentation mantiene vivo il processo dell'app e ascolta su loopback: questa prova dimostra l'interoperabilità della macro con il receiver e la correttezza del pacchetto, non l'affidabilità su telefono a processo terminato, in Doze prolungato, dopo reboot o con politiche batteria del produttore. Non misura instradamento Wi-Fi/VPN né accensione di un PC reale. Non è stata rieseguita l'intera suite Android. La candidata resta soggetta ai criteri hardware del [registro generale](automation-validation.it.md).
