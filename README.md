# AwakeOnLANMobile — personal fork

Personal Android Wake-on-LAN fork with Keystore-backed encrypted device storage, stricter native input validation, and bounded, cancellable network scans.

Maintained by [lucabnt](https://github.com/lucabnt/AwakeOnLANMobile) on the `personal` branch. Based on [nellogan/AwakeOnLANMobile](https://github.com/nellogan/AwakeOnLANMobile), licensed under GPLv3. This fork preserves the upstream attribution and license.

## Features

- Send Wake-on-LAN magic packets to IPv4 or IPv6 destinations, with configurable UDP port and optional WOL password.
- Add, edit, and delete saved devices. Android device records, including passwords, are encrypted at rest.
- Scan a single IPv4 address or subnet from `/24` to `/32`, using ICMP ping or a TCP connection to port 443.
- Cancel an active scan. Each scan is limited to 256 addresses and 30 seconds; only one native scan runs at a time.
- Light and dark themes. No advertisements, accounts, or cloud storage.

The application uses React Native / TypeScript with C++ TurboModules for networking and a Kotlin module for Android encrypted storage. The iOS directory is an upstream scaffold: protected storage is implemented for Android only. Other platforms fail explicitly instead of saving device data in plaintext.

## Security changes in this fork

### Protected device storage

The entire device archive is stored as authenticated AES-256-GCM ciphertext in `noBackupFilesDir/devices.enc`. A fresh random IV is generated for every write. The non-exportable key is generated and used through the [Android Keystore](https://developer.android.com/privacy-and-security/keystore); hardware backing depends on the device. No new JavaScript crypto dependencies are required.

Writes use Android `AtomicFile` and are read back and verified before the old plaintext archive is deleted. Saves are serialized, and the interface confirms success only after persistence completes. A failed save leaves the form available for retry and does not update the displayed device list.

On the first successful load, the old private `files/devices.json` archive is validated and migrated automatically. IDs, settings, and password contents are preserved. Unknown properties are discarded. Corrupt data, duplicate IDs, invalid addresses or ports, and oversized archives are rejected rather than silently overwritten. Limits are 1 MiB per archive and 1,000 devices; text fields are bounded. Native WOL passwords are limited to 1,024 UTF-8 bytes.

If reading, decryption, or migration fails, editing is blocked and the device list offers a retry. An existing encrypted file is authoritative: a decryption failure never falls back to an old plaintext file, and a missing key is never silently regenerated over an existing encrypted archive.

Passwords are masked in the form and excluded from device details and send confirmations. Storage errors use generic messages without logging archive contents. The light/dark theme preference remains a separate, non-sensitive JSON file. Android application backup remains disabled.

### Native networking

- MAC addresses must contain exactly six hexadecimal bytes, compact or separated consistently by `:` or `-`. Parsing does not mutate the caller's string.
- Ports must be entirely decimal and in `1–65535`. CIDR prefixes must be entirely decimal and in `24–32`; oversized numbers cannot escape the scan thread as uncaught conversion exceptions.
- Socket descriptors have a single owner and close automatically, including during exceptions. Failed sends cannot double-close a descriptor that another operation has reused.
- Native send errors are surfaced to JavaScript. Failed sends no longer show a success confirmation.
- TCP probes use nonblocking sockets and short polling intervals. A timeout alone is not treated as evidence that a host is online.
- Ping runs with literal arguments and no shell. Cancellation and deadlines terminate and reap its child process. The worker is cancelled and joined when the native module is destroyed.
- Reverse DNS lookups are omitted so an unbounded name lookup cannot stall cancellation or the scan deadline. Results contain IP addresses; the hostname field is empty.

### Dependency security

The original npm audit reported 39 affected dependency entries, including 4 critical findings. The updated lockfile audit on **2026-11-01 reports zero known npm vulnerabilities**, including development dependencies. The CLI is updated to the corrected 19.1.2 release while React Native remains at 0.80.0 and the native screen/safe-area libraries retain their verified versions.

Compatible transitive updates are locked, and `fast-xml-parser` is pinned to its corrected 5.11.2 release. Small local adapters expose the patched `minimatch` 11.0.3 and `image-size` 2.0.4 implementations through the CommonJS APIs required by existing tooling. Since no corrected `deepmerge` release is available, a reviewed MIT-licensed local patch prevents prototype poisoning in both input-copying paths. These are actual implementation replacements; advisories are not ignored or filtered. See [dependency compatibility and maintenance notes](./tools/dependencies/README.md) for the code, rationale, upstream references, and removal conditions.

CI checks the full npm audit at the low-severity threshold, as well as application and dependency regression tests. A clean audit is a snapshot of the advisory database, not a guarantee that all code or Android/C++ dependencies are vulnerability-free.

### Limits of protection

Encryption protects saved data at rest. The running app must decrypt device settings to use them; a compromised device or app process may still access those settings. Deleting the old plaintext file is not a guarantee of forensic erasure on flash storage.

Wake-on-LAN is a UDP protocol, not an encrypted remote-access channel. An optional WOL/SecureOn password is sent as part of the magic packet; it is not your Windows or Linux login password. Prefer a trusted LAN or VPN and configure the destination for your network.

## Configure your PC

1. Enable Wake-on-LAN in the PC's firmware and network adapter settings.
2. Save the network adapter's MAC address in the app.
3. Prefer an explicit destination IP or your LAN's directed broadcast address, for example `192.168.1.255` on a `192.168.1.0/24` network. The upstream fallback `192.255.255.255` is retained for compatibility and is not appropriate for every network. The default UDP port is `9`.
4. Tap **Wake**. “Packet sent” confirms local UDP submission, not that the PC has booted. Use a scan or check the PC separately.

Scan only networks you own or are authorized to test. For slower ping scans, use a smaller subnet if the 30-second deadline is reached. A host may be awake while refusing or filtering the probe, so absence from scan results does not prove it is powered off.

## Build and install this fork

Prerequisites: Node.js 22.13 or newer, npm 11.17.x, a supported JDK (17 recommended), Android SDK 35, CMake, and NDK `27.1.12297006` as configured in `android/build.gradle`. The tested package manager is npm 11.17.0. Keep the repository's `.npmrc` when installing so local compatibility packages are packed rather than linked.

```sh
git clone --branch personal https://github.com/lucabnt/AwakeOnLANMobile.git
cd AwakeOnLANMobile
npm ci
```

For development, start Metro with `npm start`, then run `npm run android` in a second terminal with an emulator or Android device connected.

For an unsigned release build:

```sh
cd android
./gradlew assembleRelease
```

On Windows use `gradlew.bat`. APKs are written under `android/app/build/outputs/apk/release/`, split by architecture. Unsigned APKs must be signed before installation. For a signed build, set `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS`, and `RELEASE_KEY_PASSWORD` in the build environment. Keep signing credentials outside the repository.

**Preserving existing devices:** an in-place update requires the same application ID and signing certificate as your installed app. A personally signed build generally cannot update an upstream-signed APK. Uninstalling the old app deletes its private records and Keystore keys; automatic migration only works when its private data survives the update. Do not uninstall expecting the migration to recover it.

Upstream release APKs do not include the changes in this branch. Build this fork to use its security changes.

## Verification

```sh
npm test -- --runInBand
npm run test:dependencies
npm run audit:dependencies
npx tsc --noEmit
npm run lint
```

JavaScript tests cover archive validation, migration failures, blocked writes after load failures, serialized saves, password exposure in displayed text, and failed-send feedback. Dependency regressions also test prototype-poisoning payloads, glob amplification, malformed image chunks, legacy tool APIs, Metro image handling, and Android manifest parsing.

The standalone native regression suite runs on Linux with a C++20 compiler and uses only loopback networking:

```sh
c++ -std=c++20 -Wall -Wextra -Werror -fsanitize=address,undefined -pthread \
  -Icpp cpp/tests/security_tests.cpp cpp/utils.cpp cpp/a_wake_on_lan.cpp cpp/net_scan.cpp \
  -o /tmp/awakeonlan-security-tests
/tmp/awakeonlan-security-tests
```

It checks malformed input, numeric overflow, scan cancellation/deadlines, the actual UDP magic packet, and descriptor lifetime. Android instrumentation tests exercise real Keystore encryption, random IVs, migration, tamper detection, lost keys, and interrupted-write recovery:

```sh
cd android
./gradlew connectedDebugAndroidTest
```

Use a disposable emulator or test device. Also manually verify migration from an existing installation, failed saves, network errors, and scans cancelled while running.

## Scope and credits

Home-screen widgets and changes to the default tab are planned separately and are not included in this security update.

The networking implementation derives from [AwakeOnLAN](https://github.com/nellogan/awakeonlan) and [NetScan](https://github.com/nellogan/netscan), by the upstream author. The original application is [AwakeOnLANMobile](https://github.com/nellogan/AwakeOnLANMobile).

See [LICENSE](./LICENSE) for the GPLv3 license.
