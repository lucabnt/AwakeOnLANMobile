package com.awakeonlanmobile

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class DeviceActionsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private var backupPromise: Promise? = null
    private val monitor = DeviceMonitor()
    private val listener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode == BACKUP_REQUEST) {
                backupPromise?.resolve(resultCode == Activity.RESULT_OK)
                backupPromise = null
            }
        }
    }
    init { context.addActivityEventListener(listener) }
    override fun getName() = "DeviceActions"

    @ReactMethod fun openBackup(promise: Promise) = onActivity(promise) { activity ->
        check(backupPromise == null)
        if (Build.VERSION.SDK_INT < 26) {
            promise.reject("BACKUP_UNSUPPORTED", "Encrypted backups require Android 8 or newer.")
        } else {
            activity.startActivityForResult(Intent(activity, DeviceBackupActivity::class.java), BACKUP_REQUEST)
            backupPromise = promise
        }
    }

    @ReactMethod fun pinWidget(id: String, promise: Promise) = withDevice(id, promise) {
        onActivity(promise) { activity -> promise.resolve(WidgetPinReceiver.request(activity, id)) }
    }

    @ReactMethod fun configureQuickTile(id: String, promise: Promise) = withDevice(id, promise) {
        WakeTileService.select(context, id)
        onActivity(promise) { activity ->
            if (Build.VERSION.SDK_INT >= 33) {
                activity.getSystemService(StatusBarManager::class.java).requestAddTileService(
                    ComponentName(context, WakeTileService::class.java), context.getString(R.string.widget_wake),
                    Icon.createWithResource(context, R.drawable.ic_wake), activity.mainExecutor,
                ) { result -> promise.resolve(if (result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED ||
                    result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED) "added" else "configured") }
            } else promise.resolve("manual")
        }
    }

    @ReactMethod fun checkReachability(id: String, promise: Promise) {
        if (!checking.compareAndSet(false, true)) {
            promise.reject("STATUS_BUSY", "A status check is already running.")
            return
        }
        DeviceStorageAccess.executor.execute {
            try {
                val device = device(id)
                network.execute {
                    try { promise.resolve(device.reachable()) }
                    catch (_: Exception) { reject(promise) }
                    finally { checking.set(false) }
                }
            } catch (_: Exception) { checking.set(false); reject(promise) }
        }
    }

    @ReactMethod fun monitorReachability(id: String, session: String, postWake: Boolean, promise: Promise) {
        if (session.length !in 1..128) { reject(promise); return }
        DeviceStorageAccess.executor.execute {
            try { monitor.start(session, device(id), if (postWake) 60000 else 6000, promise) }
            catch (_: Exception) { reject(promise) }
        }
    }
    @ReactMethod fun cancelMonitor(session: String, promise: Promise) {
        DeviceStorageAccess.executor.execute { monitor.cancel(session); promise.resolve(true) }
    }

    private fun device(id: String) = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load())
        .first { it.id == id }

    private fun withDevice(id: String, promise: Promise, work: () -> Unit) {
        DeviceStorageAccess.executor.execute {
            try { device(id); work() } catch (_: Exception) { reject(promise) }
        }
    }

    private fun onActivity(promise: Promise, work: (Activity) -> Unit) {
        context.runOnUiQueueThread {
            try { work(checkNotNull(currentActivity)) } catch (_: Exception) { reject(promise) }
        }
    }

    private fun reject(promise: Promise) = promise.reject("DEVICE_ACTION_ERROR", "Could not complete the device action. Check the saved settings and retry.")
    override fun invalidate() {
        monitor.close()
        context.removeActivityEventListener(listener)
        backupPromise?.reject("DEVICE_ACTION_CLOSED", "The app was closed.")
        backupPromise = null
        super.invalidate()
    }

    companion object {
        private const val BACKUP_REQUEST = 7393
        private val checking = AtomicBoolean(false)
        private val network = Executors.newSingleThreadExecutor { Thread(it, "DeviceStatus").apply { isDaemon = true } }
    }
}
