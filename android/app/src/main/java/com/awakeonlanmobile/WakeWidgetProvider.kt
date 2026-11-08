package com.awakeonlanmobile

import android.app.KeyguardManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import android.widget.RemoteViews

class WakeWidgetProvider : AppWidgetProvider() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_WAKE) {
            super.onReceive(context, intent)
            return
        }
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (!owns(context, id)) return
        val pending = goAsync()
        DeviceStorageAccess.executor.execute {
            try {
                if (context.getSystemService(KeyguardManager::class.java).isDeviceLocked) {
                    render(context, id, null, R.string.widget_unlock)
                } else {
                    // Resolve the ID again on every tap: never trust packet data from an intent.
                    val devices = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load())
                    val device = devices.find { it.id == selected(context, id) }
                    if (device == null) render(context, id, null, R.string.widget_missing)
                    else {
                        device.wake()
                        render(context, id, device, R.string.widget_sent)
                    }
                }
            } catch (_: Exception) {
                render(context, id, null, R.string.widget_error)
            } finally {
                pending.finish()
            }
        }
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val pending = goAsync()
        DeviceStorageAccess.executor.execute {
            try { refreshAll(context) } finally { pending.finish() }
        }
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        preferences(context).edit().apply {
            ids.forEach { remove(it.toString()) }
        }.apply()
    }

    companion object {
        private const val ACTION_WAKE = "com.awakeonlanmobile.widget.WAKE"

        private fun preferences(context: Context) = context.getSharedPreferences("wake_widgets", Context.MODE_PRIVATE)
        fun selected(context: Context, id: Int): String? = preferences(context).getString(id.toString(), null)

        fun owns(context: Context, id: Int): Boolean = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, WakeWidgetProvider::class.java)).contains(id)

        fun select(context: Context, id: Int, deviceId: String) {
            check(owns(context, id))
            check(preferences(context).edit().putString(id.toString(), deviceId).commit())
        }

        /** Caller must run on DeviceStorageAccess.executor, alongside archive reads/writes. */
        fun refreshAll(context: Context) {
            val ids = AppWidgetManager.getInstance(context)
                .getAppWidgetIds(ComponentName(context, WakeWidgetProvider::class.java))
            if (ids.isEmpty()) return
            try {
                val devices = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load())
                ids.forEach { id ->
                    val device = devices.find { it.id == selected(context, id) }
                    render(context, id, device, if (device == null) R.string.widget_missing else R.string.widget_ready)
                }
            } catch (_: Exception) {
                ids.forEach { render(context, it, null, R.string.widget_error) }
            }
        }

        internal fun render(context: Context, id: Int, device: WidgetDevice?, status: Int) {
            if (!owns(context, id)) return
            val views = RemoteViews(context.packageName, R.layout.wake_widget)
            views.setTextViewText(R.id.widget_name, device?.name?.ifEmpty { context.getString(R.string.widget_device) }
                ?: context.getString(R.string.widget_title))
            views.setTextViewText(R.id.widget_status, context.getString(status))
            val wake = Intent(context, WakeWidgetProvider::class.java).apply {
                action = ACTION_WAKE
                data = "awakeonlan://widget/wake/$id".toUri()
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            }
            views.setOnClickPendingIntent(R.id.widget_wake, PendingIntent.getBroadcast(
                context, id, wake, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ))
            // Always offer configuration/retry, even after deletion or a temporary storage error.
            val configure = Intent(context, WakeWidgetConfigureActivity::class.java).apply {
                data = "awakeonlan://widget/configure/$id".toUri()
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            }
            views.setOnClickPendingIntent(R.id.widget_configure, PendingIntent.getActivity(
                context, id, configure, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ))
            AppWidgetManager.getInstance(context).updateAppWidget(id, views)
        }
    }
}
