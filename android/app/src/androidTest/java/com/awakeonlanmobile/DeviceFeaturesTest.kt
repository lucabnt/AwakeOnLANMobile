package com.awakeonlanmobile

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayInputStream
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.ServerSocket
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceFeaturesTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val json = """[{"id":"pc","name":"Office","macAddr":"001122334455","ipAddr":"127.0.0.1","passwd":" private "}]"""
    private val password get() = "A strong backup password à🔐".toCharArray()

    private fun fails(work: () -> Unit) {
        var failed = false
        try { work() } catch (_: Exception) { failed = true }
        assertTrue("The operation must fail safely", failed)
    }

    @Test fun backupAuthenticatesPasswordHeaderAndCiphertextAndUsesFreshRandomness() {
        val first = DeviceBackup.encrypt(json, password)
        val second = DeviceBackup.encrypt(json, password)
        assertFalse(first.contentEquals(second))
        assertFalse(first.toString(Charsets.UTF_8).contains("private"))
        assertEquals(DeviceBackup.normalize(json), DeviceBackup.decrypt(first, password))
        fails { DeviceBackup.decrypt(first, "A different password".toCharArray()) }
        for (index in listOf(0, 12, 45, first.lastIndex)) {
            val tampered = first.copyOf()
            tampered[index] = (tampered[index].toInt() xor 1).toByte()
            fails { DeviceBackup.decrypt(tampered, password) }
        }
        fails { DeviceBackup.decrypt(first.copyOf(40), password) }
        fails { DeviceBackup.read(ByteArrayInputStream(ByteArray(DeviceBackup.MAX_ARCHIVE + 69))) }
        fails { DeviceBackup.encrypt(json, "short".toCharArray()) }
    }

    @Test fun backupRestoresAcrossIndependentKeystoreKeysWithoutReplacingExistingDevices() {
        val firstAlias = "AwakeOnLANMobile.backupTest.${UUID.randomUUID()}"
        val secondAlias = "AwakeOnLANMobile.backupTest.${UUID.randomUUID()}"
        val firstDir = File(context.noBackupFilesDir, firstAlias).apply { mkdirs() }
        val secondDir = File(context.noBackupFilesDir, secondAlias).apply { mkdirs() }
        try {
            val first = ProtectedDeviceStore(firstDir, File(firstDir, "legacy.json"), firstAlias)
            val second = ProtectedDeviceStore(secondDir, File(secondDir, "legacy.json"), secondAlias)
            first.save(json)
            second.save(json)
            val backup = DeviceBackup.encrypt(first.load()!!, password)
            second.save(DeviceBackup.merge(second.load(), DeviceBackup.decrypt(backup, password)))
            val restored = JSONArray(second.load())
            assertEquals(2, restored.length())
            assertEquals("pc", restored.getJSONObject(0).getString("id"))
            assertNotEquals("pc", restored.getJSONObject(1).getString("id"))
            assertEquals(" private ", restored.getJSONObject(1).getString("passwd"))
            assertEquals(DeviceBackup.normalize(json), DeviceBackup.normalize(first.load()!!))
            val before = second.load()
            fails { second.save(DeviceBackup.merge(second.load(), "[null]")) }
            assertEquals(before, second.load())
        } finally {
            firstDir.deleteRecursively(); secondDir.deleteRecursively()
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(firstAlias); deleteEntry(secondAlias) }
        }
    }

    @Test fun importsValidateWholeArchiveAndPreserveStatusSettings() {
        assertEquals("content", DeviceBackup.documentUri(android.net.Uri.parse("content://documents/backup.awol")).scheme)
        fails { DeviceBackup.documentUri(android.net.Uri.fromFile(File(context.noBackupFilesDir, "devices.enc"))) }
        fails { DeviceBackup.documentUri(android.net.Uri.parse("https://example.com/backup.awol")) }
        val configured = json.replace("\"name\":\"Office\"", "\"name\":\"Office\",\"statusIp\":\"127.0.0.1\",\"statusPort\":\"1234\",\"unknown\":\"discard\"")
        val normalized = JSONArray(DeviceBackup.normalize(configured)).getJSONObject(0)
        assertEquals("1234", normalized.getString("statusPort"))
        assertEquals("127.0.0.1", normalized.getString("statusIp"))
        assertFalse(normalized.has("unknown"))
        fails { DeviceBackup.normalize(configured.replace("\"1234\"", "\"65536\"")) }
        fails { DeviceBackup.normalize(configured.replace("\"statusIp\":\"127.0.0.1\"", "\"statusIp\":\"host.example\"")) }
        val full = JSONArray().apply { repeat(1000) { put(JSONObject(json.removeSurrounding("[", "]")).put("id", "$it")) } }
        fails { DeviceBackup.merge(full.toString(), json) }
    }

    @Test fun statusChecksUnicastTcpServiceAndRejectsBroadcastTargets() {
        ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { server ->
            val configured = json.replace("\"name\":\"Office\"", "\"statusIp\":\"127.0.0.1\",\"statusPort\":\"${server.localPort}\"")
            assertTrue(WidgetDevice.parseArchive(configured).single().reachable())
        }
        fails { WidgetDevice.parseArchive(json.replace("127.0.0.1", "192.168.1.255")).single().reachable() }
        fails { WidgetDevice.parseArchive(json.replace("127.0.0.1", "224.0.0.1")).single().reachable() }
    }

    @Test fun pinCallbackRequiresUnexpiredOneTimeRequestAndNeverReassignsConfiguredWidget() {
        val store = DeviceStorageAccess.store(context)
        val original = DeviceStorageAccess.executor.submit<String?> { store.load() }.get(5, TimeUnit.SECONDS)
        val host = AppWidgetHost(context, 7394)
        val id = host.allocateAppWidgetId()
        val prefs = context.getSharedPreferences("widget_pin_requests", 0)
        val token = UUID.randomUUID().toString()
        instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
        try {
            assertTrue(AppWidgetManager.getInstance(context).bindAppWidgetIdIfAllowed(id, ComponentName(context, WakeWidgetProvider::class.java)))
            DeviceStorageAccess.executor.submit {
                store.save(json)
                WidgetPinReceiver.complete(context, token, id)
                assertNull(WakeWidgetProvider.selected(context, id))
                prefs.edit().putString(token, JSONObject().put("id", "pc").put("created", 0).toString()).commit()
                WidgetPinReceiver.complete(context, token, id)
                assertNull(WakeWidgetProvider.selected(context, id))
                prefs.edit().putString(token, JSONObject().put("id", "pc").put("created", System.currentTimeMillis()).toString()).commit()
                WidgetPinReceiver.complete(context, token, id)
                assertEquals("pc", WakeWidgetProvider.selected(context, id))
                assertFalse(prefs.contains(token))
                prefs.edit().putString(token, JSONObject().put("id", "other").put("created", System.currentTimeMillis()).toString()).commit()
                WidgetPinReceiver.complete(context, token, id)
                assertEquals("pc", WakeWidgetProvider.selected(context, id))
            }.get(10, TimeUnit.SECONDS)
        } finally {
            DeviceStorageAccess.executor.submit { store.save(original ?: "[]") }.get(5, TimeUnit.SECONDS)
            host.deleteHost(); prefs.edit().remove(token).commit()
            context.getSharedPreferences("wake_widgets", 0).edit().remove(id.toString()).commit()
            instrumentation.uiAutomation.dropShellPermissionIdentity()
        }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { output ->
            java.io.FileInputStream(output.fileDescriptor).use { it.readBytes() }
        }
    }

    @Test fun quickSettingsTileSendsThroughSystemAndReadsLatestTarget() {
        val store = DeviceStorageAccess.store(context)
        val original = DeviceStorageAccess.executor.submit<String?> { store.load() }.get(5, TimeUnit.SECONDS)
        val prefs = context.getSharedPreferences("quick_wake", 0)
        val oldTarget = prefs.getString("device_id", null)
        val component = "com.awakeonlanmobile/.WakeTileService"
        try {
            DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { listener ->
                listener.soTimeout = 5000
                val target = json.replace("\"passwd\"", "\"port\":\"${listener.localPort}\",\"passwd\"")
                DeviceStorageAccess.executor.submit { store.save(target); WakeTileService.select(context, "pc") }.get(5, TimeUnit.SECONDS)
                shell("cmd statusbar add-tile $component")
                shell("cmd statusbar expand-settings")
                Thread.sleep(1000) // Let SystemUI bind the tile before issuing its real click.
                shell("cmd statusbar click-tile $component")
                val packet = DatagramPacket(ByteArray(2048), 2048)
                listener.receive(packet)
                assertArrayEquals(WidgetDevice.parseArchive(target).single().packet(), packet.data.copyOf(packet.length))
                DeviceStorageAccess.executor.submit {
                    store.save("[]")
                    assertNull(WakeTileService.target(context))
                }.get(5, TimeUnit.SECONDS)
            }
            val service = context.packageManager.getServiceInfo(ComponentName(context, WakeTileService::class.java), 0)
            assertEquals("android.permission.BIND_QUICK_SETTINGS_TILE", service.permission)
        } finally {
            shell("cmd statusbar remove-tile $component")
            shell("cmd statusbar collapse")
            DeviceStorageAccess.executor.submit { store.save(original ?: "[]") }.get(5, TimeUnit.SECONDS)
            prefs.edit().apply { if (oldTarget == null) remove("device_id") else putString("device_id", oldTarget) }.commit()
        }
    }
}
