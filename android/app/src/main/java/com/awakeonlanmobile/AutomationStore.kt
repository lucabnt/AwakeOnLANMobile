package com.awakeonlanmobile

import android.content.Context
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** Access only on DeviceStorageAccess.executor. The encrypted journal completes interrupted imports. */
internal object AutomationStore {
    private fun store(context: Context) = ProtectedDeviceStore(context.noBackupFilesDir,
        File(context.noBackupFilesDir, "automation-unused-legacy"), "AwakeOnLANMobile.automation.v1", "automation.enc")

    fun load(context: Context): JSONObject {
        val json = store(context).load()
        val state = if (json == null) JSONObject().put("version", 1).put("enabled", false)
            .put("rules", JSONArray()).put("history", JSONArray()).put("seen", JSONArray())
        else JSONArray(json).getJSONObject(0)
        require(state.getInt("version") == 1)
        require(state.getJSONArray("rules").length() <= 100)
        if (state.has("pendingDevices")) {
            DeviceStorageAccess.store(context).save(state.getString("pendingDevices"))
            state.remove("pendingDevices")
            save(context, state)
        }
        return state
    }

    fun save(context: Context, state: JSONObject) = store(context).save(JSONArray().put(state).toString())

    fun reconcile(context: Context) {
        val state = load(context)
        val ids = WidgetDevice.parseArchive(DeviceStorageAccess.store(context).load()).map { it.id }.toSet()
        val rules = state.getJSONArray("rules")
        repeat(rules.length()) {
            val rule = rules.getJSONObject(it)
            if (rule.getString("deviceId") !in ids) {
                rule.put("enabled", false).remove("token")
                rule.remove("nextAt")
            }
        }
        save(context, state)
        AutomationScheduler.sync(context, state)
    }
}
