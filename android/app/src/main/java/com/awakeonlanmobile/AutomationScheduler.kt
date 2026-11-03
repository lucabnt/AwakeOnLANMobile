package com.awakeonlanmobile

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import android.os.Build
import org.json.JSONObject

internal object AutomationScheduler {
    fun exactAllowed(context: Context): Boolean = Build.VERSION.SDK_INT < 31 ||
        context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    private fun pending(context: Context, id: String, at: Long) = PendingIntent.getBroadcast(context, 0,
        Intent(context, AutomationAlarmReceiver::class.java).setData("awol-alarm://rule/$id".toUri())
            .putExtra("id", id).putExtra("at", at), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun cancel(context: Context, id: String) = context.getSystemService(AlarmManager::class.java).cancel(pending(context, id, 0))

    fun sync(context: Context, state: JSONObject) {
        WifiAutomation.start(context)
        val alarm = context.getSystemService(AlarmManager::class.java)
        val rules = state.getJSONArray("rules")
        val now = System.currentTimeMillis()
        repeat(rules.length()) { index ->
            val rule = rules.getJSONObject(index)
            val id = rule.getString("id")
            cancel(context, id)
            rule.remove("suspended")
            if (!state.getBoolean("enabled") || !rule.getBoolean("enabled")) return@repeat
            if (rule.getString("trigger") in listOf("external", "wifi")) return@repeat
            if (rule.getString("precision") == "exact" && !exactAllowed(context)) {
                rule.put("suspended", "Exact alarm access required")
                return@repeat
            }
            // Preserve overdue occurrences for late-delivery policy; clock-change receivers clear nextAt.
            var at = if (rule.has("nextAt")) rule.getLong("nextAt") else AutomationRule.next(rule, now)
            if (at != null && AutomationRule.occurrence(rule, at) == rule.optString("lastOccurrence")) {
                at = AutomationRule.next(rule, at)
            }
            if (at == null) { rule.put("suspended", "No future occurrence"); return@repeat }
            rule.put("nextAt", at)
            try {
                if (rule.getString("precision") == "exact") alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, id, at))
                else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(context, id, at))
            } catch (_: SecurityException) { rule.put("suspended", "Exact alarm access required") }
        }
        AutomationStore.save(context, state)
    }
}
