package com.awakeonlanmobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import java.security.SecureRandom
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class AutomationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "Automation"
    private fun submit(promise: Promise, work: () -> String) {
        DeviceStorageAccess.executor.execute {
            try { promise.resolve(work()) }
            catch (_: Exception) { promise.reject("AUTOMATION_ERROR", "Could not complete the automation action. Check settings and retry.") }
        }
    }
    @ReactMethod fun load(promise: Promise) = submit(promise) {
        AutomationStore.reconcile(context)
        val state = AutomationStore.load(context)
        state.put("exactAllowed", AutomationScheduler.exactAllowed(context))
        // Credentials are exposed only through the explicit integration-details action.
        val rules = state.getJSONArray("rules")
        repeat(rules.length()) { rules.getJSONObject(it).remove("token") }
        state.remove("seen")
        state.toString()
    }
    @ReactMethod fun saveRule(json: String, promise: Promise) = submit(promise) {
        require(json.length <= 8192)
        val rule = AutomationRule.validate(JSONObject(json))
        val state = AutomationStore.load(context)
        val rules = state.getJSONArray("rules")
        val old = (0 until rules.length()).map { rules.getJSONObject(it) }.firstOrNull { it.getString("id") == rule.getString("id") }
        require(old != null || rules.length() < 100)
        require(WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load()).any { it.id == rule.getString("deviceId") })
        // Copy only editable fields. Never accept caller-provided runtime state or credentials.
        val clean = JSONObject()
        listOf("id", "version", "name", "deviceId", "enabled", "trigger", "hour", "minute", "date", "days",
            "precision", "toleranceMinutes", "cooldownSeconds", "windowStart", "windowEnd", "windowDays", "notify").forEach { if (rule.has(it)) clean.put(it, rule.get(it)) }
        if (clean.getBoolean("enabled") && clean.getString("trigger") == "external") {
            clean.put("token", if (old?.optBoolean("enabled") == true && old.has("token")) old.getString("token") else token())
        }
        if (old != null) listOf("lastAttempt", "lastResult", "lastOccurrence").forEach { if (old.has(it)) clean.put(it, old.get(it)) }
        state.put("rules", JSONArray().apply {
            repeat(rules.length()) { if (rules.getJSONObject(it).getString("id") != clean.getString("id")) put(rules.get(it)) }
            put(clean)
        })
        AutomationStore.save(context, state)
        AutomationScheduler.sync(context, state)
        clean.getString("id")
    }
    @ReactMethod fun remove(id: String, promise: Promise) = submit(promise) {
        val state = AutomationStore.load(context)
        val rules = state.getJSONArray("rules")
        state.put("rules", JSONArray().apply { repeat(rules.length()) { if (rules.getJSONObject(it).getString("id") != id) put(rules.get(it)) } })
        AutomationStore.save(context, state)
        AutomationScheduler.cancel(context, id)
        "ok"
    }
    @ReactMethod fun setEnabled(enabled: Boolean, promise: Promise) = submit(promise) {
        val state = AutomationStore.load(context).put("enabled", enabled)
        val rules = state.getJSONArray("rules")
        repeat(rules.length()) { rules.getJSONObject(it).remove("nextAt") }
        AutomationStore.save(context, state)
        AutomationScheduler.sync(context, state)
        "ok"
    }
    @ReactMethod fun test(id: String, promise: Promise) = submit(promise) {
        AutomationEngine.execute(context, id, "test:${UUID.randomUUID()}", test = true)
    }
    @ReactMethod fun integration(id: String, rotate: Boolean, promise: Promise) = submit(promise) {
        val state = AutomationStore.load(context)
        val rules = state.getJSONArray("rules")
        val rule = (0 until rules.length()).map { rules.getJSONObject(it) }.first { it.getString("id") == id }
        require(rule.getBoolean("enabled") && rule.getString("trigger") == "external")
        if (rotate) { rule.put("token", token()); AutomationStore.save(context, state) }
        JSONObject().put("rule_id", id).put("token", rule.getString("token")).toString()
    }
    @ReactMethod fun requestExactAccess(promise: Promise) {
        context.runOnUiQueueThread {
            try {
                if (Build.VERSION.SDK_INT >= 31) checkNotNull(currentActivity).startActivity(
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
                promise.resolve(true)
            } catch (_: Exception) { promise.reject("EXACT_SETTINGS", "Open Alarms & reminders in Android app settings.") }
        }
    }
    private fun token() = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
}
