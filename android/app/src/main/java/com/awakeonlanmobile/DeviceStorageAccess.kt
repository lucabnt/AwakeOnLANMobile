package com.awakeonlanmobile

import android.content.Context
import java.io.File
import java.util.concurrent.Executors

/** All archive access (React and widgets) uses the same process-wide queue. */
internal object DeviceStorageAccess {
    val executor = Executors.newSingleThreadExecutor { work ->
        Thread(work, "ProtectedDeviceStorage").apply { isDaemon = true }
    }

    fun store(context: Context) = ProtectedDeviceStore(
        context.noBackupFilesDir,
        File(context.filesDir, "devices.json"),
    )
}
