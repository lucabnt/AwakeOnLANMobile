package com.awakeonlanmobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

internal object NetworkTools {
    fun local(context: Context): JSONObject {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.allNetworks.firstOrNull { manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
            ?: error("Connect to Wi-Fi first.")
        val props = checkNotNull(manager.getLinkProperties(network))
        val address = props.linkAddresses.firstOrNull { it.address is Inet4Address } ?: error("No Wi-Fi IPv4 address.")
        val prefix = address.prefixLength
        val ip = address.address.address.fold(0L) { n, b -> (n shl 8) or (b.toLong() and 255) }
        val mask = if (prefix == 0) 0L else (0xffffffffL shl (32 - prefix)) and 0xffffffffL
        fun text(n: Long) = (3 downTo 0).joinToString(".") { ((n ushr (it * 8)) and 255).toString() }
        return JSONObject().put("cidr", "${text(ip and mask)}/$prefix")
            .put("broadcast", text((ip and mask) or (mask xor 0xffffffffL)))
            .put("interface", props.interfaceName).put("ip", address.address.hostAddress)
            .put("prefix", prefix).put("macRecoverySupported", Build.VERSION.SDK_INT < 29)
    }

    /** No hostname or OUI inference: only a unique, complete ARP entry on this interface. */
    fun recover(context: Context, mac: String): JSONObject {
        if (Build.VERSION.SDK_INT >= 29) return JSONObject().put("status", "unsupported")
        val local = local(context)
        val connection = WifiAutomation.connectionKey(context)
        val prefix = local.getInt("prefix")
        require(prefix >= 22) { "Subnet is too large; automatic recovery is limited to 1024 addresses." }
        val ip = InetAddress.getByName(local.getString("ip")).address.fold(0L) { n, b -> (n shl 8) or (b.toLong() and 255) }
        val mask = (0xffffffffL shl (32 - prefix)) and 0xffffffffL
        val start = ip and mask
        val count = 1 shl (32 - prefix)
        val deadline = SystemClock.elapsedRealtime() + 30000
        val pool = Executors.newFixedThreadPool(16)
        try {
            repeat(count) { index -> pool.execute {
                if (SystemClock.elapsedRealtime() < deadline) runCatching {
                    val n = start + index
                    val host = InetAddress.getByAddress(ByteArray(4) { ((n ushr ((3 - it) * 8)) and 255).toByte() })
                    DeviceNetwork.reachable(host, 443, "tcp", 100)
                }
            } }
            pool.shutdown()
            check(pool.awaitTermination(31, TimeUnit.SECONDS))
        } finally { pool.shutdownNow() }
        check(local(context).getString("cidr") == local.getString("cidr")) { "Network changed during recovery." }
        val expected = mac.replace("-", "").replace(":", "").lowercase(java.util.Locale.ROOT)
        fun matches(): List<String> = java.io.File("/proc/net/arp").readLines().drop(1).mapNotNull { line ->
            val row = line.trim().split(Regex("\\s+"))
            val address = row.firstOrNull()?.let { android.system.Os.inet_pton(android.system.OsConstants.AF_INET, it) }
            val numeric = address?.address?.fold(0L) { n, byte -> (n shl 8) or (byte.toLong() and 255) }
            if (row.size >= 6 && row[2] == "0x2" && row[5] == local.getString("interface") &&
                numeric != null && numeric and mask == start &&
                row[3].replace(":", "").lowercase(java.util.Locale.ROOT) == expected) row[0] else null
        }.distinct()
        val matches = matches()
        if (matches.size != 1) return JSONObject().put("status", if (matches.isEmpty()) "not_found" else "ambiguous")
        val candidate = matches.single()
        if (!DeviceNetwork.reachable(InetAddress.getByName(candidate), 443, "tcp", 500)) return JSONObject().put("status", "not_found")
        check(connection == WifiAutomation.connectionKey(context) && matches() == listOf(candidate)) { "Association changed during recovery." }
        return JSONObject().put("status", "found").put("ip", candidate)
    }
}

internal class DeviceDiagnostics {
    private val busy = AtomicBoolean(false)
    private val cancelled = AtomicBoolean(false)
    @Volatile private var snapshot = "{}"
    fun snapshot() = snapshot
    fun cancel() { cancelled.set(true) }
    fun begin(): Boolean {
        if (!busy.compareAndSet(false, true)) return false
        cancelled.set(false)
        snapshot = "{}"
        return true
    }
    fun release() { busy.set(false) }
    fun run(device: WidgetDevice): String = run { device.reachable(1000) }
    fun run(probe: () -> Boolean): String {
        val probes = JSONArray()
        val started = SystemClock.elapsedRealtime()
        var received = 0
        var sum = 0.0
        fun publish(done: Boolean): String {
            val data = JSONObject().put("probes", probes).put("sent", probes.length()).put("received", received)
                .put("lossPercent", if (probes.length() == 0) 0.0 else (probes.length() - received) * 100.0 / probes.length())
                .put("averageMs", if (received == 0) JSONObject.NULL else sum / received)
                .put("elapsedMs", SystemClock.elapsedRealtime() - started).put("complete", done).put("cancelled", cancelled.get())
            snapshot = data.toString()
            return snapshot
        }
        try {
            publish(false)
            repeat(10) {
                if (!cancelled.get()) {
                    val at = SystemClock.elapsedRealtimeNanos()
                    val reachable = probe()
                    val elapsed = (SystemClock.elapsedRealtimeNanos() - at) / 1000000.0
                    if (reachable) { received++; sum += elapsed }
                    probes.put(JSONObject().put("number", it + 1).put("reachable", reachable).put("elapsedMs", elapsed))
                    publish(false)
                }
            }
            return publish(true)
        } finally { busy.set(false) }
    }
}
