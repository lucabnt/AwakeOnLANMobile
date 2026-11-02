# Automations (1.2.0 release candidate)

## Create a rule

Open **Automation → +**, enter a name, select a saved device and choose **One time**, **Weekly** or **External event**. **Add device** opens the existing form and returns to the draft with the saved device selected; cancelling keeps the draft. Dates use `YYYY-MM-DD`, times use local `HH:MM`, and weekdays are Monday–Sunday.

Optional filters restrict permitted days and/or a time window. Supply both window limits, or leave both empty. A window such as 22:00–06:00 spans midnight and belongs to its starting day: Monday allows Monday evening and Tuesday before 06:00. Filters do not create additional triggers. The minimum interval between attempts is per rule, defaults to 60 seconds and can be set from 1 to 86,400 seconds.

Review the summary, enable the rule and save. Turn on **Enable automatic wakes** to allow execution. This explicitly permits packet submission with the phone locked after the first unlock following a reboot. No automation runs before that first unlock. The manual Wake button, widget and Quick Settings behavior remain available independently of automation permissions.

**Test now — sends a wake** asks for confirmation and performs a real submission. It honors the global switch, rule switch, filters and cooldown. Packet submission is distinct from a verified PC startup. Results appear in the rule and in the local history (last 100 attempts). Optional result notifications are off by default and require notification permission on Android 13+; refusing them does not disable rules.

## Scheduled rules and permissions

Exact schedules use Android AlarmManager. On Android 12+, allow this app in **Alarms & reminders** using **Allow exact alarms**. Missing/revoked access suspends exact rules; it does not silently change them to flexible ones. Reopen the app after changing system settings to view the current status. Flexible rules use inexact alarms and do not need that special access. Android may delay them substantially, especially in Doze: there is no guaranteed delivery window.

Late tolerance is visible and editable (5–1,440 minutes; exact default 5, flexible default 60). An occurrence delivered after its tolerance is recorded as skipped. There is no catch-up wake when connectivity returns. Delivery does not imply that the network is usable. Reboot/package replacement restores alarms after unlock. Clock/timezone changes recompute future local occurrences. A nonexistent daylight-saving time is skipped; a repeated civil time is consumed once. A consumed civil occurrence is retained across rule edits and clock changes. Edit the date/time for a new one-time occurrence.

No JavaScript timer or permanent foreground service powers schedules. Receivers use a bounded partial wake lock for their short operation. The app requests Internet, boot delivery, wake-lock and exact-alarm capabilities; notification permission is optional. No location, nearby-device or Wi-Fi permission is needed in this release. Wi-Fi triggers and SSID filters belong to the next release.

Force-stopping the app prevents Android from delivering automation events/alarms until the app is reopened. Removing it from recents, killing its process, force-stop and reboot are different cases. Vendor battery policies and VPN/network routing need hardware validation; the app never deliberately binds around a VPN.

## MacroDroid: first integration selected for validation

MacroDroid was selected because its documented **Send Intent** action supports an explicit broadcast with string extras. No HTTP listener, cloud endpoint or additional automation plugin is required. This is a concrete configuration based on the provider's documentation; an end-to-end run from MacroDroid remains an acceptance check. The Android endpoint itself is exercised by instrumentation with actual broadcasts and a UDP listener. Compatibility with other automation apps is not claimed.

1. Create and enable an **External event** rule, save it and open **Integration details**.
2. In MacroDroid, select the desired trigger and add **Send Intent**.
3. Set these fields:

| Field | Value |
|---|---|
| Target | Broadcast |
| Action | `com.awakeonlanmobile.AUTOMATION_EVENT` |
| Package | `com.awakeonlanmobile` |
| Class | `com.awakeonlanmobile.AutomationEventReceiver` |
| String extra `rule_id` | Value shown for the selected rule |
| String extra `token` | Private token shown for the selected rule |
| String extra `event_id` | A unique ID for this occurrence, e.g. a persistent counter with a macro-specific prefix |

Use letters, numbers, `_`, `.`, `:` or `-` for an event ID (1–128 characters). A retry of the same event must reuse its ID. A new event needs a new ID. Avoid a fixed event ID and avoid timestamps with spaces/slashes. When different rules target the same device for the same originating event, use the same event ID to suppress duplicate sends across those rules.

The token is a 256-bit random capability, not a PC password. Only share it with the intended local automation app. Knowing a rule ID alone is insufficient. The receiver accepts no MAC, destination, port or WOL password override: it reloads the current saved device. **Revoke and replace token** invalidates the old capability immediately. Disabling/deleting the rule also revokes it; re-enabling creates a new token. Closing/backgrounding integration details hides the token. Do not put it in logs, screenshots, shared macros or version control.

External admission is limited to two pending receiver operations, with per-rule cooldown and a persistent, device-scoped deduplication ledger holding the last 1,000 authenticated event identities across the app. Bursts can be dropped. This is a bounded deduplication window, not an indefinite replay-prevention protocol. History never stores token values or caller event text. No credential is exported in backups.

An ordinary MacroDroid broadcast does not provide a delivery acknowledgement. The rule history is the app's source of submission results. An ordered broadcast caller may read result code `1` for `sent`, otherwise `0`, and a short result string (`rejected`, `disabled`, `duplicate`, `skipped: …`, `error: …`). Even `sent` only means UDP submission, not PC startup. A missing/busy response is not confirmation and must not trigger an automatic retry with a fresh event ID.

## Backup and interruption behavior

Export uses the authenticated AWOLBK01 encryption envelope with a version-2 plaintext schema containing devices and rules. Imports remap both device and rule IDs, preserve existing entries and import all rules disabled. Restore requires explicit rule activation and fresh external integration credentials. System permissions, alarm instances, deduplication ledger and history are not portable. Device-only version-1 backups remain readable; unknown future schema versions are rejected before writes.

The device and automation archives use separate Keystore-backed AES-GCM encryption. A write-ahead record in the encrypted automation archive completes a process-interrupted v2 import with the same generated IDs. It is recovered before automation execution or normal JS loading. Writes run on the shared device-storage queue. A missing device prevents sending even when linked-rule reconciliation could not be persisted.

The engine durably claims an occurrence before sending UDP. A crash in the interval between that claim and completion can lose a wake or leave a `pending: delivery uncertain` result. It deliberately avoids replaying an uncertain send; UDP cannot guarantee exactly-once delivery or successful boot.

## Status monitoring

Device List refreshes on opening/resuming and after manual Wake. At most two native workers probe at once; probes within one session never overlap. Short refreshes last up to six seconds, post-wake sessions up to 60 seconds, with a two-second pause between probes. Two consecutive responses yield **Reachable**; two consecutive misses end a short refresh as **Not verified**. A timeout, cancellation or error never proves the PC is off. An invalid broadcast status address fails without probing. TCP connection refusal counts as a host response. Android's ICMP reachability can be filtered or unavailable; choose TCP when appropriate.

The ICMP setting uses Android `InetAddress.isReachable`: it tries ICMP first and can fall back to TCP echo. A positive result therefore establishes reachability, not which protocol answered. Use the explicit TCP setting to check the configured service port. This fallback is documented in the [Android API reference](https://developer.android.com/reference/java/net/InetAddress#isReachable(int)).

The row contains a fixed, one-line text indicator and **Status** opens details on request, including last completion time, retry or cancellation. No modal opens for probe results. Hiding the list, opening an editor or backgrounding the app cancels sessions; an outstanding socket probe can take up to 1.5 seconds to return. Background automations record submission results without starting this prolonged monitor.

## Sources

- [Android: schedule alarms](https://developer.android.com/develop/background-work/services/alarms)
- [Android: AlarmManager reference](https://developer.android.com/reference/android/app/AlarmManager)
- [MacroDroid: Send Intent](https://macrodroidforum.com/wiki/index.php/Action%3A_Send_Intent)

See the [validation record](automation-validation.it.md) before treating this candidate as a stable release.
