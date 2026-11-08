package com.awakeonlanmobile

import android.Manifest
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NetworkFeaturesTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private fun <T> queued(work: () -> T): T = DeviceStorageAccess.executor.submit<T> { work() }.get(15, TimeUnit.SECONDS)
    private fun rule() = JSONObject().put("version", 1).put("id", "wifi-feature-test")
        .put("name", "Wi-Fi test").put("deviceId", "network-feature-pc").put("enabled", true).put("trigger", "wifi")
        .put("date", "2026-11-03").put("hour", 8).put("minute", 30).put("days", JSONArray())
        .put("precision", "exact").put("toleranceMinutes", 5).put("cooldownSeconds", 1)
        .put("windowStart", -1).put("windowEnd", -1).put("wifiSsid", "Test Wi-Fi")

    @Test fun wifiRulesValidateAndHaveNoAlarmOccurrence() {
        val valid = AutomationRule.validate(rule())
        assertNull(AutomationRule.next(valid, System.currentTimeMillis()))
        assertTrue(runCatching { AutomationRule.validate(rule().put("wifiSsid", "")) }.isFailure)
        assertTrue(runCatching { AutomationRule.validate(rule().put("ssidCondition", 123)) }.isFailure)
        assertTrue(runCatching { AutomationRule.validate(rule().put("wifiSsid", "x".repeat(33))) }.isFailure)
        if (Build.VERSION.SDK_INT >= 29) assertEquals("unsupported", NetworkTools.recover(context, "001122334455").getString("status"))
    }

    @Test fun diagnosticsPublishTenProbesLossMeanAndPartialCancellation() {
        val diagnostics = DeviceDiagnostics()
        assertTrue(diagnostics.begin())
        assertFalse(diagnostics.begin())
        var count = 0
        val full = JSONObject(diagnostics.run { count++; count % 2 == 0 })
        assertEquals(10, full.getInt("sent"))
        assertEquals(5, full.getInt("received"))
        assertEquals(50.0, full.getDouble("lossPercent"), 0.01)
        assertTrue(full.getDouble("averageMs") >= 0)
        assertTrue(full.getBoolean("complete"))
        assertTrue(diagnostics.begin())
        val lost = JSONObject(diagnostics.run { false })
        assertTrue(lost.isNull("averageMs"))
        assertEquals(100.0, lost.getDouble("lossPercent"), 0.01)
        assertTrue(diagnostics.begin())
        val partial = JSONObject(diagnostics.run {
            if (JSONObject(diagnostics.snapshot()).getInt("sent") >= 2) diagnostics.cancel()
            true
        })
        assertEquals(3, partial.getInt("sent"))
        assertTrue(partial.getBoolean("cancelled"))
        assertTrue(diagnostics.begin())
        diagnostics.cancel()
        assertEquals(0, JSONObject(diagnostics.run { error("Cancelled work must not probe") }).getInt("sent"))
    }

    @Test fun wifiBackupRoundTripRetainsNetworkAndDropsRuntimeState() {
        val source = JSONObject().put("version", 2)
            .put("devices", JSONArray().put(JSONObject().put("id", "network-feature-pc").put("macAddr", "001122334455")))
            .put("rules", JSONArray().put(rule().put("ssidCondition", "Test Wi-Fi")
                .put("lastWifiConnection", "private-connection").put("lastWifiAttempt", 123)))
        val password = "A long backup password".toCharArray()
        val restored = JSONObject(DeviceBackup.decrypt(DeviceBackup.encrypt(source.toString(), password), password))
            .getJSONArray("rules").getJSONObject(0)
        AutomationRule.validate(restored)
        assertEquals("Test Wi-Fi", restored.getString("wifiSsid"))
        assertEquals("Test Wi-Fi", restored.getString("ssidCondition"))
        assertFalse(restored.getBoolean("enabled"))
        assertFalse(restored.has("lastWifiConnection"))
        assertFalse(restored.has("lastWifiAttempt"))
    }

    @Test fun wifiUsesRealSsidDeduplicatesAndFailsClosedOnCondition() {
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_COARSE_LOCATION)
        instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 29) instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        val ssid = checkNotNull(WifiAutomation.ssid(context)) { "Connect emulator Wi-Fi and enable location before running acceptance tests." }
        val subnet = NetworkTools.local(context)
        assertTrue(subnet.getString("cidr").contains('/'))
        assertTrue(subnet.getString("broadcast").contains('.'))
        val savedDevices = queued { DeviceStorageAccess.store(context).load() }
        val savedAutomation = queued { AutomationStore.load(context).toString() }
        DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { receiver ->
            receiver.soTimeout = 500
            try {
                queued {
                    DeviceStorageAccess.store(context).save(JSONArray().put(JSONObject().put("id", "network-feature-pc")
                        .put("macAddr", "001122334455").put("ipAddr", "127.0.0.1").put("port", receiver.localPort.toString())).toString())
                    AutomationStore.save(context, JSONObject().put("version", 1).put("enabled", true)
                        .put("rules", JSONArray().put(rule().put("wifiSsid", ssid))).put("history", JSONArray()).put("seen", JSONArray()))
                    assertEquals("sent", AutomationEngine.execute(context, "wifi-feature-test", "wifi:one", wifi = true))
                    assertEquals("duplicate", AutomationEngine.execute(context, "wifi-feature-test", "wifi:two", wifi = true))
                    val state = AutomationStore.load(context)
                    val current = state.getJSONArray("rules").getJSONObject(0)
                    current.put("lastWifiAttempt", 0).put("lastAttempt", 0)
                    AutomationStore.save(context, state)
                    // A late capabilities event on the same connection is still a duplicate.
                    assertEquals("duplicate", AutomationEngine.execute(context, "wifi-feature-test", "wifi:three", wifi = true))
                    current.put("lastWifiConnection", "old-network").put("lastWifiAttempt", System.currentTimeMillis())
                    AutomationStore.save(context, state)
                    assertEquals("duplicate", AutomationEngine.execute(context, "wifi-feature-test", "wifi:reconnect", wifi = true))
                    current.put("lastWifiAttempt", 0).put("ssidCondition", ssid + "-different")
                    AutomationStore.save(context, state)
                    assertEquals("skipped: Wi-Fi condition", AutomationEngine.execute(context, "wifi-feature-test", "wifi:condition", wifi = true))
                }
                receiver.receive(DatagramPacket(ByteArray(128), 128))
                assertTrue(runCatching { receiver.receive(DatagramPacket(ByteArray(128), 128)) }.isFailure)
            } finally { queued {
                DeviceStorageAccess.store(context).save(savedDevices ?: "[]")
                AutomationStore.save(context, JSONObject(savedAutomation))
                AutomationScheduler.sync(context, JSONObject(savedAutomation))
            } }
        }
    }
}
