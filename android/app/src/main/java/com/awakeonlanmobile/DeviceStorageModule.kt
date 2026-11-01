package com.awakeonlanmobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val store = DeviceStorageAccess.store(context)

    override fun getName() = "DeviceStorage"

    @ReactMethod
    fun load(promise: Promise) = submit(promise) { store.load() }

    @ReactMethod
    fun save(json: String, promise: Promise) = submit(promise) {
        store.save(json)
        // Refresh labels and remove stale actions after a rename or deletion.
        try { WakeWidgetProvider.refreshAll(reactApplicationContext) } catch (_: Exception) {
            // A launcher failure must not turn a committed archive save into an error.
        }
        runCatching { android.service.quicksettings.TileService.requestListeningState(reactApplicationContext,
            android.content.ComponentName(reactApplicationContext, WakeTileService::class.java)) }
        null
    }

    private fun submit(promise: Promise, work: () -> String?) {
        try {
            DeviceStorageAccess.executor.execute {
                try {
                    promise.resolve(work())
                } catch (_: Exception) {
                    // Don't pass exception details or plaintext through logs/the bridge.
                    promise.reject("DEVICE_STORAGE_ERROR", "Could not access protected device storage. Existing data was preserved.")
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            promise.reject("DEVICE_STORAGE_CLOSED", "Device storage is unavailable.")
        }
    }

}
