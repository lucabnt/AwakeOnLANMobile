package com.awakeonlanmobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.Executors

class DeviceStorageModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    companion object {
        // One queue across React reloads: AtomicFile does not synchronize independent writers.
        private val executor = Executors.newSingleThreadExecutor { work ->
            Thread(work, "ProtectedDeviceStorage").apply { isDaemon = true }
        }
    }
    private val store = ProtectedDeviceStore(context.noBackupFilesDir, File(context.filesDir, "devices.json"))

    override fun getName() = "DeviceStorage"

    @ReactMethod
    fun load(promise: Promise) = submit(promise) { store.load() }

    @ReactMethod
    fun save(json: String, promise: Promise) = submit(promise) { store.save(json); null }

    private fun submit(promise: Promise, work: () -> String?) {
        try {
            executor.execute {
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
