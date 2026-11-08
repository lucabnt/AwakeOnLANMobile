package com.awakeonlanmobile

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

/** Local civil time: nonexistent DST times are skipped; a repeated time runs once. */
internal object AutomationRule {
    private val identifier = Regex("[a-zA-Z0-9_-]{1,128}")
    fun validate(rule: JSONObject): JSONObject {
        listOf("version", "hour", "minute", "toleranceMinutes", "cooldownSeconds").forEach { key ->
            val value = rule.get(key)
            require(value is Number && value.toDouble() == value.toInt().toDouble())
        }
        require(rule.get("enabled") is Boolean)
        if (rule.has("notify")) require(rule.get("notify") is Boolean)
        listOf("id", "name", "deviceId", "trigger", "precision", "date").forEach { key ->
            if (rule.has(key)) require(rule.get(key) is String && !rule.getString(key).contains('\u0000'))
        }
        listOf("windowStart", "windowEnd").forEach { key ->
            if (rule.has(key)) {
                val value = rule.get(key)
                require(value is Number && value.toDouble() == value.toInt().toDouble())
            }
        }
        require(rule.getInt("version") == 1)
        require(identifier.matches(rule.getString("id")))
        require(rule.getString("name").length in 1..120)
        require(rule.getString("deviceId").length in 1..128)
        rule.getBoolean("enabled")
        require(rule.getString("trigger") in listOf("once", "weekly", "external", "wifi"))
        require(rule.getInt("hour") in 0..23 && rule.getInt("minute") in 0..59)
        require(rule.getString("precision") in listOf("exact", "flexible"))
        require(rule.getInt("toleranceMinutes") in 5..1440)
        require(rule.getInt("cooldownSeconds") in 1..86400)
        if (rule.getString("trigger") == "once") {
            val date = rule.getString("date")
            require(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}").matches(date))
            candidate(date, 12, 0, TimeZone.getTimeZone("UTC")) ?: error("Invalid date")
        }
        val days = rule.getJSONArray("days")
        val unique = HashSet<Int>()
        repeat(days.length()) {
            val value = days.get(it)
            require(value is Number && value.toDouble() == value.toInt().toDouble() && value.toInt() in 1..7 && unique.add(value.toInt()))
        }
        if (rule.getString("trigger") == "weekly") require(unique.isNotEmpty())
        val windowDays = rule.optJSONArray("windowDays") ?: JSONArray()
        val allowedDays = HashSet<Int>()
        repeat(windowDays.length()) {
            val value = windowDays.get(it)
            require(value is Number && value.toDouble() == value.toInt().toDouble() && value.toInt() in 1..7 && allowedDays.add(value.toInt()))
        }
        val start = rule.optInt("windowStart", -1)
        val end = rule.optInt("windowEnd", -1)
        require((start == -1 && end == -1) || (start in 0..1439 && end in 0..1439 && start != end))
        listOf("wifiSsid", "ssidCondition").forEach { key ->
            if (rule.has(key)) require(rule.get(key) is String && rule.getString(key).toByteArray(Charsets.UTF_8).size <= 32 && !rule.getString(key).contains('\u0000'))
        }
        if (rule.getString("trigger") == "wifi") require(rule.optString("wifiSsid").isNotBlank())
        return rule
    }

    private fun candidate(date: String, hour: Int, minute: Int, zone: TimeZone): Long? = runCatching {
        val parts = date.split('-').map { it.toInt() }
        GregorianCalendar(zone).apply {
            isLenient = false
            clear()
            set(parts[0], parts[1] - 1, parts[2], hour, minute, 0)
        }.timeInMillis
    }.getOrNull()

    private fun date(cal: Calendar) = "%04d-%02d-%02d".format(java.util.Locale.ROOT,
        cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))

    fun next(rule: JSONObject, after: Long, zone: TimeZone = TimeZone.getDefault()): Long? {
        if (rule.getString("trigger") in listOf("external", "wifi")) return null
        val hour = rule.getInt("hour")
        val minute = rule.getInt("minute")
        if (rule.getString("trigger") == "once") return candidate(rule.getString("date"), hour, minute, zone)?.takeIf { it > after }
        val days = rule.getJSONArray("days")
        val cal = GregorianCalendar(zone).apply { timeInMillis = after; set(Calendar.HOUR_OF_DAY, 12) }
        repeat(9) {
            val day = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1
            if ((0 until days.length()).any { days.getInt(it) == day }) {
                val value = candidate(date(cal), hour, minute, zone)
                if (value != null && value > after) return value
            }
            cal.add(Calendar.DAY_OF_MONTH, 1)
        }
        return null
    }

    fun allowed(rule: JSONObject, now: Long): Boolean {
        val start = rule.optInt("windowStart", -1)
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        val minute = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val end = rule.optInt("windowEnd", -1)
        // An overnight interval belongs to the day on which it starts.
        if (start > end && end >= 0 && minute < end) cal.add(Calendar.DAY_OF_MONTH, -1)
        val day = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1
        val days = rule.optJSONArray("windowDays") ?: JSONArray()
        if (days.length() > 0 && !(0 until days.length()).any { days.getInt(it) == day }) return false
        if (start < 0) return true
        return if (start < end) minute in start until end else minute >= start || minute < end
    }

    fun occurrence(rule: JSONObject, at: Long): String {
        val cal = Calendar.getInstance().apply { timeInMillis = at }
        return "${date(cal)}:${rule.getInt("hour")}:${rule.getInt("minute")}"
    }
}
