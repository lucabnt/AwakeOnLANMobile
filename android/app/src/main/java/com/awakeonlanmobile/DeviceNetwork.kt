package com.awakeonlanmobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.system.ErrnoException
import android.system.OsConstants
import java.net.*

/** Shared by shortcuts, automations and in-app status sessions. Numeric addresses only. */
internal object DeviceNetwork {
    fun wake(context: Context, bytes: ByteArray, address: InetAddress, port: Int) {
        DatagramSocket().use { socket ->
            if (!address.isLoopbackAddress) {
                val manager = context.getSystemService(ConnectivityManager::class.java)
                fun isWifi(network: android.net.Network): Boolean {
                    val caps = manager.getNetworkCapabilities(network) ?: return false
                    return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                }
                val wifi = manager.activeNetwork?.takeIf(::isWifi) ?: manager.allNetworks.firstOrNull(::isWifi)
                wifi?.bindSocket(socket)
            }
            socket.broadcast = true
            socket.send(DatagramPacket(bytes, bytes.size, address, port))
        }
    }
    fun reachable(address: InetAddress, port: Int, method: String, timeout: Int = 1500): Boolean {
        require(!address.isMulticastAddress && !address.isAnyLocalAddress && !address.hostAddress.orEmpty().endsWith(".255"))
        require(method in listOf("tcp", "icmp"))
        if (method == "icmp") return address.isReachable(timeout)
        return try {
            Socket().use { it.connect(InetSocketAddress(address, port), timeout) }
            true
        } catch (error: java.io.IOException) {
            generateSequence<Throwable>(error) { it.cause }.any { it is ErrnoException && it.errno == OsConstants.ECONNREFUSED }
        }
    }
}
