package com.awakeonlanmobile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in laboratory fixture: the operator must send events from the real MacroDroid UI.
 * This fixture never sends a broadcast or calls the automation engine itself.
 * Run only in a disposable emulator with -e macrodroidAcceptance true.
 */
@RunWith(AndroidJUnit4::class)
class MacroDroidAcceptanceTest {
    @Test fun realProviderSendsExpectedPackets() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("macrodroidAcceptance") == "true")
        require(android.os.Build.HARDWARE in listOf("ranchu", "goldfish")) { "Use a disposable emulator only" }
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        fun <T> queued(work: () -> T): T = DeviceStorageAccess.executor.submit<T> { work() }.get(15, TimeUnit.SECONDS)
        val directory = File(context.filesDir, "macrodroid-lab").apply { mkdirs() }
        val command = File(directory, "command")
        val credentials = File(directory, "credentials.json")
        val report = File(directory, "report.json")
        val oldDevices = queued { DeviceStorageAccess.store(context).load() }
        val oldAutomation = queued { AutomationStore.load(context).toString() }
        fun token() = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        command.delete()
        var count = 0
        var done = false
        val checkpoints = JSONArray()
        val started = android.os.SystemClock.elapsedRealtime()
        try {
            DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { socket ->
                socket.soTimeout = 500
                val secret = token()
                queued {
                    val existing = AutomationStore.load(context).getJSONArray("rules")
                    repeat(existing.length()) { AutomationScheduler.cancel(context, existing.getJSONObject(it).getString("id")) }
                    DeviceStorageAccess.store(context).save("""[{"id":"macrodroid-lab-pc","name":"MacroDroid lab only","macAddr":"001122334455","ipAddr":"127.0.0.1","port":"${socket.localPort}"}]""")
                    val rule = JSONObject().put("version", 1).put("id", "macrodroid-lab-rule")
                        .put("name", "MacroDroid acceptance").put("deviceId", "macrodroid-lab-pc")
                        .put("enabled", true).put("trigger", "external").put("token", secret)
                        .put("cooldownSeconds", 1).put("windowStart", -1).put("windowEnd", -1)
                    val unrelated = JSONObject(rule.toString()).put("id", "macrodroid-unrelated-rule").put("token", token())
                    AutomationStore.save(context, JSONObject().put("version", 1).put("enabled", true)
                        .put("rules", JSONArray().put(rule).put(unrelated)).put("history", JSONArray()).put("seen", JSONArray()))
                }
                credentials.writeText(JSONObject().put("rule_id", "macrodroid-lab-rule").put("token", secret).toString())
                val expected = ByteArray(6) { 0xff.toByte() } + ByteArray(96) { byteArrayOf(0, 0x11, 0x22, 0x33, 0x44, 0x55)[it % 6] }
                while (!done && android.os.SystemClock.elapsedRealtime() - started < 30 * 60_000) {
                    val packet = DatagramPacket(ByteArray(2048), 2048)
                    try {
                        socket.receive(packet)
                        assertArrayEquals(expected, packet.data.copyOf(packet.length))
                        count++
                    } catch (_: SocketTimeoutException) { /* Observe commands while waiting for the real provider. */ }
                    if (command.exists()) {
                        val operation = command.readText().trim()
                        command.delete()
                        queued {
                            val state = AutomationStore.load(context)
                            when (operation) {
                                "rotate" -> {
                                    val fresh = token()
                                    state.getJSONArray("rules").getJSONObject(0).put("token", fresh)
                                    credentials.writeText(JSONObject().put("rule_id", "macrodroid-lab-rule").put("token", fresh).toString())
                                }
                                "pause" -> state.put("enabled", false)
                                "resume" -> state.put("enabled", true)
                                "finish" -> done = true
                                "snapshot" -> Unit
                                else -> {
                                    val check = operation.split(":")
                                    require(check.size == 3 && check[0] == "check") { "Unknown laboratory command" }
                                    assertEquals("Packet count at ${check[1]}", check[2].toInt(), count)
                                    checkpoints.put(JSONObject().put("name", check[1]).put("packets", count))
                                }
                            }
                            AutomationStore.save(context, state)
                        }
                    }
                    val history = queued { AutomationStore.load(context).getJSONArray("history") }
                    repeat(history.length()) {
                        assertEquals("Only the linked rule may execute", "macrodroid-lab-rule", history.getJSONObject(it).getString("ruleId"))
                    }
                    report.writeText(JSONObject().put("packets", count).put("allPayloadsMatch", true)
                        .put("finished", done).put("checkpoints", checkpoints).put("history", history).toString())
                }
                assertTrue("Operator must finish the real-provider acceptance session", done)
                assertTrue("At least two distinct real-provider events must arrive", count >= 2)
            }
        } finally {
            credentials.delete()
            command.delete()
            queued {
                AutomationStore.save(context, JSONObject(oldAutomation))
                DeviceStorageAccess.store(context).save(oldDevices ?: "[]")
                AutomationScheduler.sync(context, JSONObject(oldAutomation))
            }
        }
    }
}
