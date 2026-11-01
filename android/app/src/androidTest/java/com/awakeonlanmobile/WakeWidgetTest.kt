package com.awakeonlanmobile

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.LinearLayout
import android.widget.ListView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WakeWidgetTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext

    private fun json(ip: String = "127.0.0.1", port: Int = 9) =
        """[{"id":"one","name":"Office PC","macAddr":"00:11:22:33:44:55","ipAddr":"$ip","port":"$port","passwd":" private "}]"""

    private fun fails(json: String) {
        var rejected = false
        try { WidgetDevice.parseArchive(json) } catch (_: Exception) { rejected = true }
        assertTrue("Invalid widget device must be rejected", rejected)
    }

    @Test fun sendsExactMagicPacketWithRawPasswordOverLoopback() {
        DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { listener ->
            listener.soTimeout = 3000
            val device = WidgetDevice.parseArchive(json(port = listener.localPort)).single()
            device.wake()
            val received = DatagramPacket(ByteArray(2048), 2048)
            listener.receive(received)
            val expected = ByteArray(6) { 0xff.toByte() } +
                List(16) { byteArrayOf(0, 0x11, 0x22, 0x33, 0x44, 0x55) }.fold(byteArrayOf()) { a, b -> a + b } +
                " private ".toByteArray()
            assertArrayEquals(expected, received.data.copyOf(received.length))
        }
    }

    @Test fun handlesIpv6CompactAndHyphenatedMacAndDefaults() {
        DatagramSocket(0, InetAddress.getByName("::1")).use { listener ->
            listener.soTimeout = 3000
            val canonical = WidgetDevice.parseArchive(json("::1", listener.localPort)).single()
            for (mac in listOf("001122334455", "00-11-22-33-44-55")) {
                val device = WidgetDevice.parseArchive(json("::1", listener.localPort).replace("00:11:22:33:44:55", mac)).single()
                assertArrayEquals(canonical.packet(), device.packet())
                device.wake()
                val received = DatagramPacket(ByteArray(2048), 2048)
                listener.receive(received)
                assertArrayEquals(canonical.packet(), received.data.copyOf(received.length))
            }
        }
        val defaults = WidgetDevice.parseArchive("""[{"id":"pc","macAddr":"001122334455"}]""").single()
        assertEquals(102, defaults.packet().size)
        assertEquals(0, WidgetDevice.parseArchive(null).size)
    }

    @Test fun rejectsMalformedArchivesWithoutDnsOrCoercion() {
        fails(json().replace("127.0.0.1", "example.com"))
        fails(json().replace("127.0.0.1", "127.1"))
        fails(json().replace("00:11:22:33:44:55", "00:11-22:33:44:55"))
        for (port in listOf("0", "65536", "999999999999999999999", "9junk", "+9")) {
            fails(json().replace("\"9\"", "\"$port\""))
        }
        fails(json().replace("\"Office PC\"", "123"))
        fails(json().replace(" private ", "\\u0000"))
        fails(json().replace(" private ", "é".repeat(513)))
        fails("[" + json().removeSurrounding("[", "]") + "," + json().removeSurrounding("[", "]") + "]")
        fails("{}"); fails("[null]")
    }

    @Test fun widgetBindingsAreIndependentContainOnlyIdsAndRequireOwnedWidgets() {
        val manager = AppWidgetManager.getInstance(context)
        val host = AppWidgetHost(context, 7391)
        val first = host.allocateAppWidgetId()
        val second = host.allocateAppWidgetId()
        instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
        try {
            val provider = ComponentName(context, WakeWidgetProvider::class.java)
            assertTrue(manager.bindAppWidgetIdIfAllowed(first, provider))
            assertTrue(manager.bindAppWidgetIdIfAllowed(second, provider))
            DeviceStorageAccess.executor.submit {
                WakeWidgetProvider.select(context, first, "one")
                WakeWidgetProvider.select(context, second, "two")
            }.get(5, TimeUnit.SECONDS)
            assertEquals("one", WakeWidgetProvider.selected(context, first))
            assertEquals("two", WakeWidgetProvider.selected(context, second))
            val prefs = context.getSharedPreferences("wake_widgets", 0)
            assertEquals("one", prefs.all[first.toString()])
            assertEquals("two", prefs.all[second.toString()])
            var rejected = false
            try { WakeWidgetProvider.select(context, -1, "one") } catch (_: Exception) { rejected = true }
            assertTrue(rejected)
            WakeWidgetProvider().onDeleted(context, intArrayOf(first))
            assertNull(WakeWidgetProvider.selected(context, first))
            assertEquals("two", WakeWidgetProvider.selected(context, second))
            val info = context.packageManager.getReceiverInfo(provider, 0)
            assertFalse("Network actions must not be exported", info.exported)
        } finally {
            host.deleteHost()
            context.getSharedPreferences("wake_widgets", 0).edit()
                .remove(first.toString()).remove(second.toString()).commit()
            instrumentation.uiAutomation.dropShellPermissionIdentity()
        }
    }

    @Test fun configuresWithoutSendingThenUsesLatestEncryptedSettingsAndStopsAfterDeletion() {
        val manager = AppWidgetManager.getInstance(context)
        val host = AppWidgetHost(context, 7392)
        val id = host.allocateAppWidgetId()
        val store = DeviceStorageAccess.store(context)
        val original = DeviceStorageAccess.executor.submit<String?> { store.load() }.get(5, TimeUnit.SECONDS)
        instrumentation.uiAutomation.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET")
        var activity: WakeWidgetConfigureActivity? = null
        try {
            assertTrue(manager.bindAppWidgetIdIfAllowed(id, ComponentName(context, WakeWidgetProvider::class.java)))
            DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { oldDestination ->
                oldDestination.soTimeout = 250
                DeviceStorageAccess.executor.submit { store.save(json(port = oldDestination.localPort)) }.get(5, TimeUnit.SECONDS)
                activity = instrumentation.startActivitySync(Intent(context, WakeWidgetConfigureActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)) as WakeWidgetConfigureActivity
                DeviceStorageAccess.executor.submit {}.get(5, TimeUnit.SECONDS)
                instrumentation.waitForIdleSync()
                instrumentation.runOnMainSync {
                    val root = activity!!.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as LinearLayout
                    val list = root.getChildAt(1) as ListView
                    assertEquals("Office PC", list.adapter.getItem(0))
                    list.performItemClick(list.getChildAt(0), 0, 0)
                }
                DeviceStorageAccess.executor.submit {}.get(5, TimeUnit.SECONDS)
                assertEquals("one", WakeWidgetProvider.selected(context, id))
                try {
                    oldDestination.receive(DatagramPacket(ByteArray(2048), 2048))
                    fail("Configuration must not send a wake packet")
                } catch (_: SocketTimeoutException) { /* expected */ }
                DatagramSocket(0, InetAddress.getByName("127.0.0.1")).use { latestDestination ->
                    latestDestination.soTimeout = 3000
                    val updated = json(port = latestDestination.localPort).replace(" private ", " latest ")
                    DeviceStorageAccess.executor.submit { store.save(updated) }.get(5, TimeUnit.SECONDS)
                    // Exercise the actual RemoteViews button and its immutable PendingIntent.
                    val widget = arrayOfNulls<android.appwidget.AppWidgetHostView>(1)
                    instrumentation.runOnMainSync {
                        widget[0] = host.createView(context, id, manager.getAppWidgetInfo(id))
                        val view = widget[0]!!
                        val width = (180 * context.resources.displayMetrics.density).toInt()
                        val height = (200 * context.resources.displayMetrics.density).toInt()
                        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
                        view.layout(0, 0, width, height)
                        val image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        view.draw(Canvas(image))
                        java.io.File(context.cacheDir, "widget-test-preview.png").outputStream().use {
                            image.compress(Bitmap.CompressFormat.PNG, 100, it)
                        }
                        image.recycle()
                    }
                    fun tap() = instrumentation.runOnMainSync {
                        assertTrue(widget[0]!!.findViewById<View>(R.id.widget_wake).performClick())
                    }
                    tap()
                    val received = DatagramPacket(ByteArray(2048), 2048)
                    latestDestination.receive(received)
                    assertArrayEquals(WidgetDevice.parseArchive(updated).single().packet(), received.data.copyOf(received.length))
                    DeviceStorageAccess.executor.submit { store.save("[]") }.get(5, TimeUnit.SECONDS)
                    tap()
                    latestDestination.soTimeout = 500
                    try {
                        latestDestination.receive(DatagramPacket(ByteArray(2048), 2048))
                        fail("A deleted device must never be woken using cached data")
                    } catch (_: SocketTimeoutException) { /* expected */ }
                }
            }
        } finally {
            instrumentation.runOnMainSync { activity?.finish() }
            DeviceStorageAccess.executor.submit { store.save(original ?: "[]") }.get(5, TimeUnit.SECONDS)
            host.deleteHost()
            context.getSharedPreferences("wake_widgets", 0).edit().remove(id.toString()).commit()
            instrumentation.uiAutomation.dropShellPermissionIdentity()
        }
    }
}
