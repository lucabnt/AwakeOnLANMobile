package com.awakeonlanmobile

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AutomationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private fun <T> queued(work: () -> T): T = DeviceStorageAccess.executor.submit<T> { work() }.get(15, TimeUnit.SECONDS)
    private fun rule(trigger: String = "external") = JSONObject().put("version", 1).put("id", "rule-test")
        .put("name", "Test PC").put("deviceId", "pc").put("enabled", true).put("trigger", trigger)
        .put("date", "2026-11-03").put("hour", 8).put("minute", 30).put("days", JSONArray(listOf(1, 2, 3, 4, 5)))
        .put("precision", "flexible").put("toleranceMinutes", 5).put("cooldownSeconds", 1)
        .put("windowStart", -1).put("windowEnd", -1).put("token", "a".repeat(64))
    private fun state(rule: JSONObject) = JSONObject().put("version", 1).put("enabled", true)
        .put("rules", JSONArray().put(rule)).put("history", JSONArray()).put("seen", JSONArray())
    private fun date(text: String, zone: String = "Europe/Rome") = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT)
        .apply { timeZone = TimeZone.getTimeZone(zone); isLenient = false }.parse(text)!!.time
    private fun fails(work: () -> Unit) {
        assertTrue(runCatching { work() }.isFailure)
    }
    private fun isolated(work: () -> Unit) {
        val devices = queued { DeviceStorageAccess.store(context).load() }
        val automation = queued { AutomationStore.load(context).toString() }
        try { work() }
        finally { queued {
            AutomationScheduler.cancel(context, "rule-test")
            DeviceStorageAccess.store(context).save(devices ?: "[]")
            val current = AutomationStore.load(context).getJSONArray("rules")
            repeat(current.length()) { AutomationScheduler.cancel(context, current.getJSONObject(it).getString("id")) }
            AutomationStore.save(context, JSONObject(automation))
            AutomationScheduler.sync(context, JSONObject(automation))
        } }
    }

    @Test fun civilTimeHandlesWeeklyDstAndOvernightFilters() {
        val zone = TimeZone.getTimeZone("Europe/Rome")
        val weekly = rule("weekly")
        assertEquals(date("2026-11-02 08:30"), AutomationRule.next(weekly, date("2026-11-01 12:00"), zone))
        weekly.put("days", JSONArray(listOf(7))).put("hour", 2).put("minute", 30)
        // The 02:30 wall time does not exist on the spring transition Sunday.
        assertEquals(date("2026-04-05 02:30"), AutomationRule.next(weekly, date("2026-03-28 12:00"), zone))
        val autumn = AutomationRule.next(weekly, date("2026-10-24 12:00"), zone)!!
        assertEquals(date("2026-11-01 02:30"), AutomationRule.next(weekly, autumn, zone))
        val once = rule("once").put("date", "2026-03-29").put("hour", 2).put("minute", 30)
        assertNull(AutomationRule.next(once, date("2026-03-28 12:00"), zone))
        val original = TimeZone.getDefault()
        try {
            TimeZone.setDefault(zone)
            val filter = rule().put("windowStart", 22 * 60).put("windowEnd", 6 * 60).put("windowDays", JSONArray(listOf(1)))
            assertTrue(AutomationRule.allowed(filter, date("2026-11-02 23:00")))
            assertTrue(AutomationRule.allowed(filter, date("2026-11-03 02:00")))
            assertFalse(AutomationRule.allowed(filter, date("2026-11-03 06:00")))
            assertFalse(AutomationRule.allowed(filter, date("2026-11-03 23:00")))
        } finally { TimeZone.setDefault(original) }
        fails { AutomationRule.validate(rule("weekly").put("days", JSONArray())) }
        fails { AutomationRule.validate(rule("once").put("date", "2026-02-30")) }
        fails { AutomationRule.validate(rule().put("windowEnd", 10)) }
    }

    @Test fun enablingRuleAtomicallyResumesGlobalSwitchButEditingAndDisablingKeepPause() = isolated {
        val module = AutomationModule(com.facebook.react.bridge.BridgeReactContext(context))
        fun save(value: JSONObject): Boolean {
            val latch = CountDownLatch(1)
            var success = false
            val promise = java.lang.reflect.Proxy.newProxyInstance(com.facebook.react.bridge.Promise::class.java.classLoader,
                arrayOf(com.facebook.react.bridge.Promise::class.java)) { _, method, _ ->
                    if (method.name == "resolve") { success = true; latch.countDown() }
                    if (method.name == "reject") latch.countDown()
                    null
                } as com.facebook.react.bridge.Promise
            module.saveRule(value.toString(), promise)
            assertTrue(latch.await(15, TimeUnit.SECONDS))
            return success
        }
        queued {
            DeviceStorageAccess.store(context).save("""[{"id":"pc","macAddr":"001122334455","ipAddr":"127.0.0.1"}]""")
            AutomationStore.save(context, state(rule()).put("enabled", false).put("rules", JSONArray()))
        }
        assertTrue(save(rule())) // Creating an enabled rule resumes the master switch.
        assertTrue(queued { AutomationStore.load(context).getBoolean("enabled") })
        queued {
            val current = AutomationStore.load(context).put("enabled", false)
            AutomationStore.save(context, current)
        }
        assertTrue(save(rule().put("name", "Renamed")))
        assertFalse(queued { AutomationStore.load(context).getBoolean("enabled") })
        assertTrue(save(rule().put("enabled", false)))
        assertFalse(queued { AutomationStore.load(context).getBoolean("enabled") })
        assertFalse(save(rule().put("deviceId", "missing")))
        assertFalse(queued { AutomationStore.load(context).getBoolean("enabled") })
        assertTrue(save(rule())) // Explicitly re-enabling an existing rule also resumes.
        assertTrue(queued { AutomationStore.load(context).getBoolean("enabled") })
        queued {
            val current = AutomationStore.load(context)
            assertEquals(0, current.getJSONArray("history").length())
        }
    }

    private fun broadcast(ruleId: String, token: String, event: String): String {
        val latch = CountDownLatch(1)
        var result = "no result"
        val intent = Intent("com.awakeonlanmobile.AUTOMATION_EVENT")
            .setComponent(ComponentName(context, AutomationEventReceiver::class.java))
            .putExtra("rule_id", ruleId).putExtra("token", token).putExtra("event_id", event)
        instrumentation.context.sendOrderedBroadcast(intent, null, object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) { result = resultData ?: "rejected"; latch.countDown() }
        }, null, 0, null, null)
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        return result
    }

    @Test fun actualExternalReceiverAuthenticatesDeduplicatesAndUsesCurrentDevice() = isolated {
        DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { socket ->
            socket.soTimeout = 1000
            val json = """[{"id":"pc","macAddr":"001122334455","ipAddr":"127.0.0.1","port":"${socket.localPort}","passwd":"private"}]"""
            queued { DeviceStorageAccess.store(context).save(json); AutomationStore.save(context, state(rule())) }
            assertEquals("rejected", broadcast("rule-test", "b".repeat(64), "event-1"))
            assertEquals("sent", broadcast("rule-test", "a".repeat(64), "event-1"))
            val packet = DatagramPacket(ByteArray(2048), 2048)
            socket.receive(packet)
            assertArrayEquals(WidgetDevice.parseArchive(json).single().packet(), packet.data.copyOf(packet.length))
            assertEquals("duplicate", broadcast("rule-test", "a".repeat(64), "event-1"))
            fails { socket.receive(packet) }
            queued {
                val state = AutomationStore.load(context)
                state.getJSONArray("rules").getJSONObject(0).put("token", "c".repeat(64))
                AutomationStore.save(context, state)
            }
            assertEquals("rejected", broadcast("rule-test", "a".repeat(64), "event-2"))
            queued { DeviceStorageAccess.store(context).save("[]"); AutomationStore.reconcile(context) }
            assertEquals("disabled", broadcast("rule-test", "c".repeat(64), "event-3"))
            fails { socket.receive(packet) }
            val history = queued { AutomationStore.load(context).getJSONArray("history").toString() }
            assertFalse(history.contains("private")); assertFalse(history.contains("aaaa"))
        }
    }

    @Test fun lateOccurrencesAndMissingDevicesNeverSend() = isolated {
        val at = System.currentTimeMillis() - 360000
        queued {
            DeviceStorageAccess.store(context).save("""[{"id":"pc","macAddr":"001122334455","ipAddr":"127.0.0.1"}]""")
            AutomationStore.save(context, state(rule("once").put("nextAt", at)))
            assertEquals("skipped: late occurrence", AutomationEngine.execute(context, "rule-test", "alarm", at))
            val saved = AutomationStore.load(context)
            assertFalse(saved.getJSONArray("rules").getJSONObject(0).getBoolean("enabled"))
            assertEquals("disabled", AutomationEngine.execute(context, "rule-test", "alarm", at))
        }
    }

    @Test fun simultaneousAlarmOccurrencesDeduplicateAcrossRulesAndSurviveClockRecalculation() = isolated {
        DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { socket ->
            socket.soTimeout = 500
            queued {
                DeviceStorageAccess.store(context).save("""[{"id":"pc","macAddr":"001122334455","ipAddr":"127.0.0.1","port":"${socket.localPort}"}]""")
                val at = System.currentTimeMillis()
                val first = rule("weekly").put("nextAt", at)
                val second = rule("weekly").put("id", "rule-two").put("nextAt", at)
                val state = state(first)
                state.getJSONArray("rules").put(second)
                AutomationStore.save(context, state)
                assertEquals("sent", AutomationEngine.execute(context, "rule-test", "one", at))
                assertEquals("skipped: duplicate occurrence", AutomationEngine.execute(context, "rule-two", "two", at))
                val saved = AutomationStore.load(context)
                assertTrue(saved.getJSONArray("rules").getJSONObject(0).has("lastOccurrence"))
                AutomationScheduler.cancel(context, "rule-two")
            }
            val packet = DatagramPacket(ByteArray(2048), 2048)
            socket.receive(packet)
            fails { socket.receive(packet) }
        }
    }

    @Test fun nativeMonitorRequiresTwoResponsesAndCancelsWithoutOrphanWorkers() {
        val monitor = DeviceMonitor()
        fun promise(latch: CountDownLatch, result: (String) -> Unit): com.facebook.react.bridge.Promise =
            java.lang.reflect.Proxy.newProxyInstance(com.facebook.react.bridge.Promise::class.java.classLoader,
                arrayOf(com.facebook.react.bridge.Promise::class.java)) { _, method, args ->
                    if (method.name == "resolve") { result(args!![0] as String); latch.countDown() }
                    if (method.name == "reject") { result("rejected"); latch.countDown() }
                    null
                } as com.facebook.react.bridge.Promise
        try {
            java.net.ServerSocket(0, 10, InetAddress.getByName("127.0.0.1")).use { server ->
                val device = WidgetDevice.parseArchive("""[{"id":"pc","macAddr":"001122334455","statusIp":"127.0.0.1","statusPort":"${server.localPort}"}]""").single()
                val latch = CountDownLatch(1)
                var result = ""
                val started = android.os.SystemClock.elapsedRealtime()
                monitor.start("probe", device, 6000, promise(latch) { result = it })
                assertTrue(latch.await(8, TimeUnit.SECONDS))
                assertEquals("reachable", JSONObject(result).getString("state"))
                assertTrue(android.os.SystemClock.elapsedRealtime() - started >= 1900)
                val cancelled = CountDownLatch(1)
                monitor.start("cancel", device, 60000, promise(cancelled) { result = it })
                monitor.cancel("cancel")
                assertTrue(cancelled.await(3, TimeUnit.SECONDS))
                assertEquals("cancelled", JSONObject(result).getString("state"))
            }
        } finally { monitor.close() }
    }

    @Test fun backupV2RemapsRulesDisablesThemAndRecoversInterruptedImport() = isolated {
        val exported = queued {
            DeviceStorageAccess.store(context).save("""[{"id":"pc","macAddr":"001122334455","statusMethod":"icmp"}]""")
            AutomationStore.save(context, state(rule()))
            DeviceBackup.exportDocument(context)
        }
        assertFalse(exported.contains("token")); assertFalse(exported.contains("history")); assertFalse(exported.contains("nextAt"))
        val password = "A long unique backup password".toCharArray()
        val decrypted = DeviceBackup.decrypt(DeviceBackup.encrypt(exported, password), password)
        assertEquals(exported, decrypted)
        queued {
            DeviceBackup.importDocument(context, decrypted)
            val devices = JSONArray(DeviceStorageAccess.store(context).load())
            val state = AutomationStore.load(context)
            val importedRule = state.getJSONArray("rules").getJSONObject(1)
            assertEquals(devices.getJSONObject(1).getString("id"), importedRule.getString("deviceId"))
            assertFalse(importedRule.getBoolean("enabled")); assertFalse(importedRule.has("token"))
            assertEquals("icmp", devices.getJSONObject(1).getString("statusMethod"))
            val before = state.toString()
            fails { DeviceBackup.importDocument(context, exported.replace("\"version\":2", "\"version\":99")) }
            assertEquals(before, AutomationStore.load(context).toString())
            state.put("pendingDevices", devices.toString())
            AutomationStore.save(context, state)
            DeviceStorageAccess.store(context).save("[]") // Interruption between the two archive writes.
            assertFalse(AutomationStore.load(context).has("pendingDevices"))
            assertEquals(devices.toString(), DeviceStorageAccess.store(context).load())
            DeviceBackup.importDocument(context, """[{"id":"old","macAddr":"001122334455"}]""")
            assertEquals(3, JSONArray(DeviceStorageAccess.store(context).load()).length())
        }
    }
}
