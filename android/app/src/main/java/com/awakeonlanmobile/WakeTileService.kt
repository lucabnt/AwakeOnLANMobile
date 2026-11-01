package com.awakeonlanmobile

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast
import java.util.concurrent.atomic.AtomicBoolean

class WakeTileService : TileService() {
    override fun onStartListening() {
        DeviceStorageAccess.executor.execute {
            val name = runCatching { target(this)?.name }.getOrNull()
            Handler(Looper.getMainLooper()).post {
                qsTile?.apply {
                    label = name?.ifEmpty { getString(R.string.widget_wake) } ?: getString(R.string.widget_wake)
                    state = Tile.STATE_INACTIVE // This is an action, never a claim about PC power state.
                    if (Build.VERSION.SDK_INT >= 29) subtitle = getString(R.string.tile_hint)
                    updateTile()
                }
            }
        }
    }

    override fun onClick() {
        super.onClick()
        if (isLocked) unlockAndRun { performWake() } else performWake()
    }

    // Lint does not recognize the SDK < 34 guard around the required legacy overload.
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    private fun performWake() {
        if (!sending.compareAndSet(false, true)) return
        DeviceStorageAccess.executor.execute {
            val status = try {
                check(!getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked)
                val device = target(this)
                if (device == null) R.string.tile_missing else { device.wake(); R.string.widget_sent }
            } catch (_: Exception) { R.string.widget_error }
            finally { sending.set(false) }
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this, status, Toast.LENGTH_LONG).show()
                qsTile?.apply {
                    if (Build.VERSION.SDK_INT >= 29) subtitle = getString(status)
                    updateTile()
                }
                if (status == R.string.tile_missing) {
                    val open = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(
                        this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                    else {
                        @Suppress("DEPRECATION")
                        startActivityAndCollapse(open)
                    }
                }
            }
        }
    }

    companion object {
        private val sending = AtomicBoolean(false)
        internal fun selected(context: Context) = context.getSharedPreferences("quick_wake", 0).getString("device_id", null)
        internal fun select(context: Context, id: String) {
            check(context.getSharedPreferences("quick_wake", 0).edit().putString("device_id", id).commit())
            requestListeningState(context, ComponentName(context, WakeTileService::class.java))
        }
        internal fun target(context: Context): WidgetDevice? {
            val id = selected(context) ?: return null
            return WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load()).find { it.id == id }
        }
    }
}
