package com.awakeonlanmobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import android.os.Build
import org.json.JSONObject
import java.util.UUID

/** Only the launcher success callback can complete a pending pin request. */
class WidgetPinReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val token = intent.data?.lastPathSegment ?: return
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val pending = goAsync()
        DeviceStorageAccess.executor.execute {
            try { complete(context, token, id) } finally { pending.finish() }
        }
    }

    companion object {
        private fun prefs(context: Context) = context.getSharedPreferences("widget_pin_requests", 0)

        fun request(context: Context, deviceId: String): Boolean {
            if (Build.VERSION.SDK_INT < 26) return false
            val manager = AppWidgetManager.getInstance(context)
            if (!manager.isRequestPinAppWidgetSupported) return false
            val preferences = prefs(context)
            val now = System.currentTimeMillis()
            val editor = preferences.edit()
            preferences.all.forEach { (key, value) ->
                val created = runCatching { JSONObject(value as String).getLong("created") }.getOrDefault(0)
                if (now - created !in 0..600_000L) editor.remove(key)
            }
            val token = UUID.randomUUID().toString()
            check(editor.putString(token, JSONObject().put("id", deviceId).put("created", now).toString()).commit())
            val callback = Intent(context, WidgetPinReceiver::class.java)
                .setData("awakeonlan://widget/pinned/$token".toUri())
            // The system must fill EXTRA_APPWIDGET_ID. This sole mutable intent is explicit,
            // one-shot, non-exported, and validated against a short-lived private nonce.
            val flags = PendingIntent.FLAG_ONE_SHOT or
                if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
            val result = PendingIntent.getBroadcast(context, 0, callback, flags)
            val accepted = manager.requestPinAppWidget(ComponentName(context, WakeWidgetProvider::class.java), null, result)
            if (!accepted) { preferences.edit().remove(token).apply(); result.cancel() }
            return accepted
        }

        internal fun complete(context: Context, token: String, id: Int) {
            try {
                val preferences = prefs(context)
                val request = preferences.getString(token, null) ?: return
                check(preferences.edit().remove(token).commit())
                val data = JSONObject(request)
                if (System.currentTimeMillis() - data.getLong("created") !in 0..600_000L ||
                    !WakeWidgetProvider.owns(context, id) || WakeWidgetProvider.selected(context, id) != null) return
                val deviceId = data.getString("id")
                val devices = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load())
                if (devices.none { it.id == deviceId }) return
                WakeWidgetProvider.select(context, id, deviceId)
                WakeWidgetProvider.refreshAll(context)
            } catch (_: Exception) { /* No settings or archive contents in logs. */ }
        }
    }
}
