# Privacy

AwakeOnLANMobile has no accounts, advertising, telemetry or cloud backend. Saved devices, WOL passwords, automation rules, integration tokens and recent event history are stored locally using Android Keystore-backed encryption.

Wake sends a UDP packet to your configured destination. The packet includes the target MAC address and any configured WOL password in cleartext. Scans, status checks and diagnostics contact the addresses you select. Device names and wake results can appear on widgets, tiles and notifications you enable.

Wi-Fi automations use the connected network name (SSID) to check your rules. Android requires location permission to expose this name, including background location access for rules that run while the app is closed. The app does not record GPS coordinates.

If you configure MacroDroid or another integration, that app receives the credentials you choose to share with it. Encrypted backups are written to the document provider you select. Uninstalling the app removes its private records and encryption keys. Exported backup files remain with the provider until you delete them.
