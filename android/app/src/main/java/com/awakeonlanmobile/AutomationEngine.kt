package com.awakeonlanmobile

import android.content.Context
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

/** Called on the shared storage queue, including the final device lookup and UDP send. */
internal object AutomationEngine {
    fun execute(context: Context, id: String, event: String, at: Long? = null, token: String? = null, test: Boolean = false): String {
        val state = AutomationStore.load(context)
        val rules = state.getJSONArray("rules")
        val rule = (0 until rules.length()).map { rules.getJSONObject(it) }.firstOrNull { it.getString("id") == id } ?: return "rejected"
        if (!state.getBoolean("enabled") || !rule.getBoolean("enabled")) return "disabled"
        if (!test) {
            if (at == null) {
                if (rule.getString("trigger") != "external" || token == null || !rule.has("token")) return "rejected"
                if (!MessageDigest.isEqual(token.toByteArray(), rule.getString("token").toByteArray())) return "rejected"
            } else if (rule.getString("trigger") == "external" || rule.optLong("nextAt", -1) != at ||
                (rule.getString("precision") == "exact" && !AutomationScheduler.exactAllowed(context))) return "rejected"
        }
        val now = System.currentTimeMillis()
        val seen = state.getJSONArray("seen")
        // Hash identities so history never contains caller-supplied secrets.
        val identity = if (at == null) event else "alarm:${AutomationRule.occurrence(rule, at)}"
        val hash = MessageDigest.getInstance("SHA-256").digest((rule.getString("deviceId") + ":" + identity).toByteArray())
            .joinToString("") { "%02x".format(it) }
        val duplicate = (0 until seen.length()).any { seen.getJSONObject(it).getString("key") == hash }
        if (duplicate && at == null) return "duplicate"
        var result = "sent"
        if (at != null && (now < at || now - at > rule.getInt("toleranceMinutes") * 60_000L)) result = "skipped: late occurrence"
        if (!AutomationRule.allowed(rule, now)) result = "skipped: outside time window"
        if (now - rule.optLong("lastAttempt", 0) < rule.getInt("cooldownSeconds") * 1000L) result = "skipped: cooldown"
        val device = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load()).firstOrNull { it.id == rule.getString("deviceId") }
        if (device == null) { result = "skipped: device removed"; rule.put("enabled", false).remove("token") }
        if (duplicate) result = "skipped: duplicate occurrence"
        seen.put(JSONObject().put("key", hash).put("time", now))
        state.put("seen", trim(seen, 1000))
        rule.put("lastAttempt", now)
        if (at != null) {
            rule.put("lastOccurrence", AutomationRule.occurrence(rule, at))
            rule.remove("nextAt")
            if (rule.getString("trigger") == "once") rule.put("enabled", false)
        }
        // Persist the claim before sending. A crash can lose a wake, but must not replay an uncertain send.
        record(state, rule, now, "pending: delivery uncertain")
        AutomationStore.save(context, state)
        if (result == "sent") result = try { checkNotNull(device).wake(); "sent" } catch (_: Exception) { "error: packet not confirmed" }
        val history = state.getJSONArray("history")
        history.getJSONObject(history.length() - 1).put("result", result)
        rule.put("lastResult", result)
        AutomationStore.save(context, state)
        AutomationScheduler.sync(context, state)
        if (rule.optBoolean("notify", false)) AutomationNotifications.show(context, rule.getString("id"), result)
        return result
    }

    private fun record(state: JSONObject, rule: JSONObject, now: Long, result: String) {
        val history = state.getJSONArray("history")
        history.put(JSONObject().put("ruleId", rule.getString("id")).put("time", now).put("result", result))
        state.put("history", trim(history, 100))
        rule.put("lastResult", result)
    }
    private fun trim(array: JSONArray, max: Int) = JSONArray().apply {
        for (i in maxOf(0, array.length() - max) until array.length()) put(array.get(i))
    }
}
