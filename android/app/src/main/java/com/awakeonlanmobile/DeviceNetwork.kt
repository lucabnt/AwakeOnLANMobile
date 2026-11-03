package com.awakeonlanmobile

import android.system.ErrnoException
import android.system.OsConstants
import java.net.*

/** Shared by shortcuts, automations and in-app status sessions. Numeric addresses only. */
internal object DeviceNetwork {
    fun wake(bytes: ByteArray, address: InetAddress, port: Int) {
        DatagramSocket().use { socket ->
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
