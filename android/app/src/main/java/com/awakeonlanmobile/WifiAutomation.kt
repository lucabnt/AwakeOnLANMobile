package com.awakeonlanmobile

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.Build

/** System-owned PendingIntent also delivers new Wi-Fi networks when the UI is closed. */
internal object WifiAutomation {
    private var started = false
    @Synchronized fun start(context: Context) {
        if (started) return
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
        val pending = PendingIntent.getBroadcast(context, 7395,
            Intent(context, WifiAutomationReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0))
        try {
            manager.registerNetworkCallback(request, pending)
            // Capabilities can arrive after availability; retry on that real network event.
            manager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                    DeviceStorageAccess.executor.execute {
                        if (context.getSystemService(android.os.UserManager::class.java).isUserUnlocked)
                            runCatching { connected(context) }
                    }
                }
            })
            started = true
        } catch (_: SecurityException) { /* No wake without the required access. */ }
    }

    @Suppress("DEPRECATION")
    fun ssid(context: Context): String? = runCatching {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        if (manager.allNetworks.none { manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }) return null
        context.applicationContext.getSystemService(WifiManager::class.java).connectionInfo?.ssid
            ?.takeUnless { it == WifiManager.UNKNOWN_SSID }?.removeSurrounding("\"")?.takeIf { it.isNotEmpty() }
    }.getOrNull()

    fun connectionKey(context: Context): String {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.allNetworks.firstOrNull { manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
        return "${android.provider.Settings.Global.getInt(context.contentResolver, android.provider.Settings.Global.BOOT_COUNT, 0)}:${network?.networkHandle}"
    }

    fun connected(context: Context) {
        val ssid = ssid(context) ?: return
        val rules = AutomationStore.load(context).getJSONArray("rules")
        repeat(rules.length()) {
            val rule = rules.getJSONObject(it)
            if (rule.optString("trigger") == "wifi" && rule.optString("wifiSsid") == ssid)
                AutomationEngine.execute(context, rule.getString("id"), "wifi:${connectionKey(context)}", wifi = true)
        }
    }
}

class WifiAutomationReceiver : AutomationReceiver() {
    override fun handle(context: Context, intent: Intent): String? {
        WifiAutomation.connected(context)
        return null
    }
}
