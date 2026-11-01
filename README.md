# AwakeOnLANMobile

Android Wake-on-LAN app with home-screen widgets, a Quick Settings shortcut, and encrypted device storage. Maintained by [lucabnt](https://github.com/lucabnt) on the **[main branch](https://github.com/lucabnt/AwakeOnLANMobile/tree/main)**, based on [nellogan/AwakeOnLANMobile](https://github.com/nellogan/AwakeOnLANMobile).

## Install

Download a signed APK from [Releases](https://github.com/lucabnt/AwakeOnLANMobile/releases). Choose **arm64-v8a** for most recent Android phones. Android 7+ is required; encrypted backup requires Android 8+.

This fork uses its own signing key. If Android refuses an update over another distribution, export any available backup before uninstalling it. Uninstalling deletes saved devices and the local encryption key.

## Use

1. Enable Wake-on-LAN in your PC firmware and network adapter settings.
2. Open **Add Device**, enter the adapter MAC address and preferably your LAN broadcast destination, e.g. `192.168.1.255` on a `/24` network. An empty destination uses `255.255.255.255` (local broadcast); UDP port defaults to `9`. The optional WOL password is not your computer login password.
3. Open **Device List** and tap **Wake**. A brief toast indicates packet submission; it does not confirm that the PC started. Use a trusted LAN or VPN; Wake-on-LAN packets are not encrypted.

- **Widget:** select **More → Add widget**, or add it from the Android launcher. Each widget can use a different saved PC.
- **Quick Settings:** select **More → Use for Quick Settings**. Add the **Wake PC** tile manually if Android does not offer a dialog. Unlock the phone before using either shortcut.
- **Status:** checks TCP reachability on demand. Set **Status IP** to the actual PC address when WOL uses broadcast; optionally select a TCP port (default `443`). No response does not prove that the PC is off. Broadcast, multicast, and IPv4 addresses ending in `.255` cannot be checked.
- **Backup:** open **menu → Encrypted backup**. Use a unique password of 12–256 characters. Import adds devices without replacing existing ones; repeated imports create duplicates. The password cannot be recovered.
- **Scan Hosts:** scan an IPv4 address or `/24`–`/32` subnet you are authorized to test. Scans are cancellable and limited to 256 addresses / 30 seconds.
- **Appearance:** switch between light and dark mode in the menu.

Saved devices and WOL passwords are encrypted with Android Keystore. No accounts, ads, or cloud service are required. iOS is an upstream scaffold; these protected features are Android-only.

## Build and test

Requirements: Node.js 22.13+, npm 11.17.x, JDK 17+, Android SDK 35 and NDK 27.1.12297006.

```sh
npm ci
npm test -- --runInBand
npm run test:dependencies
npm run audit:dependencies
npx tsc --noEmit
npm run lint
cd android
./gradlew assembleRelease
```

Without signing configuration the release APKs are unsigned. For a signed build, open `android/` in Android Studio and use **Generate Signed App Bundle / APK → APK → release**. Keep your keystore outside Git and reuse it for updates. APKs are release attachments, not committed source files.

See [release instructions](docs/RELEASING.md), [technical/security notes](docs/technical-notes.md), and [dependency maintenance](tools/dependencies/README.md). Use a disposable emulator for `connectedDebugAndroidTest`.

## License and credits

[GPLv3](LICENSE). Original app and networking work by [nellogan](https://github.com/nellogan), including [AwakeOnLAN](https://github.com/nellogan/awakeonlan) and [NetScan](https://github.com/nellogan/netscan). This fork preserves their attribution.
