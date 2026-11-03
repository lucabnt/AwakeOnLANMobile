package com.awakeonlanmobile

import android.system.Os
import android.system.OsConstants
import java.net.InetAddress
import org.json.JSONArray
import org.json.JSONObject

/** No generated toString(): passwords must never appear in diagnostic output. */
internal class WidgetDevice(
    val id: String,
    val name: String,
    private val mac: ByteArray,
    private val address: InetAddress,
    private val port: Int,
    private val password: ByteArray,
    private val statusAddress: InetAddress,
    private val statusPort: Int,
    private val statusMethod: String = "tcp",
) {
    fun packet(): ByteArray = ByteArray(102 + password.size).also { bytes ->
        bytes.fill(0xff.toByte(), 0, 6)
        repeat(16) { mac.copyInto(bytes, 6 + it * 6) }
        password.copyInto(bytes, 102)
    }

    fun wake() {
        DeviceNetwork.wake(packet(), address, port)
    }

    fun reachable(timeout: Int = 1500): Boolean = DeviceNetwork.reachable(statusAddress, statusPort, statusMethod, timeout)

    companion object {
        private val macPattern = Regex("(?:[0-9a-fA-F]{12}|(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}|(?:[0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2})")

        fun parseArchive(json: String?): List<WidgetDevice> {
            if (json == null) return emptyList()
            val array = JSONArray(json)
            require(array.length() <= 1000)
            val ids = HashSet<String>()
            return (0 until array.length()).map { index ->
                val item = array.getJSONObject(index)
                val id = field(item, "id", 128)
                require(id.isNotEmpty() && ids.add(id))
                val macText = field(item, "macAddr", 17)
                require(macPattern.matches(macText))
                val compact = macText.replace(":", "").replace("-", "")
                val mac = ByteArray(6) { compact.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
                val ip = field(item, "ipAddr").ifEmpty { "255.255.255.255" }
                // Numeric literals only: no DNS resolution, hostnames, or scoped addresses.
                val address = Os.inet_pton(if (ip.contains(':')) OsConstants.AF_INET6 else OsConstants.AF_INET, ip)
                requireNotNull(address)
                val portText = field(item, "port").ifEmpty { "9" }
                require(Regex("[0-9]{1,5}").matches(portText))
                val port = portText.toInt()
                require(port in 1..65535)
                val password = field(item, "passwd").toByteArray(Charsets.UTF_8)
                require(password.size <= 1024)
                val statusIp = field(item, "statusIp").ifEmpty { ip }
                val statusAddress = Os.inet_pton(if (statusIp.contains(':')) OsConstants.AF_INET6 else OsConstants.AF_INET, statusIp)
                requireNotNull(statusAddress)
                val statusPort = field(item, "statusPort").ifEmpty { "443" }
                require(Regex("[0-9]{1,5}").matches(statusPort) && statusPort.toInt() in 1..65535)
                val method = field(item, "statusMethod").ifEmpty { "tcp" }
                require(method in listOf("tcp", "icmp"))
                WidgetDevice(id, field(item, "name"), mac, address, port, password, statusAddress, statusPort.toInt(), method)
            }
        }

        private fun field(item: JSONObject, key: String, limit: Int = 1024): String {
            if (!item.has(key)) return ""
            val value = item.get(key)
            require(value is String && value.length <= limit && !value.contains('\u0000'))
            return value
        }
    }
}
