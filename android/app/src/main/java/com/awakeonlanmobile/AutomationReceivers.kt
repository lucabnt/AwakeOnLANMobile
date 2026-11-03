package com.awakeonlanmobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.os.UserManager
import java.util.concurrent.atomic.AtomicInteger

/** Bounded receiver work: external traffic cannot occupy all admission slots. */
abstract class AutomationReceiver : BroadcastReceiver() {
    final override fun onReceive(context: Context, intent: Intent) {
        if (!context.getSystemService(UserManager::class.java).isUserUnlocked) return
        val count = if (this is AutomationEventReceiver) external else internal
        val limit = if (this is AutomationEventReceiver) 2 else 128
        if (count.incrementAndGet() > limit) { count.decrementAndGet(); return }
        val ordered = isOrderedBroadcast
        val pending = goAsync()
        val lock = context.getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AwakeOnLAN:automation")
        lock.acquire(9000)
        val received = android.os.SystemClock.elapsedRealtime()
        DeviceStorageAccess.executor.execute {
            try {
                if (android.os.SystemClock.elapsedRealtime() - received < 7000) {
                    val result = handle(context, intent)
                    if (ordered && result != null) { pending.resultCode = if (result == "sent") 1 else 0; pending.resultData = result }
                }
            } catch (_: Exception) { /* Fail closed; never log archive contents or Intent credentials. */ }
            finally { if (lock.isHeld) lock.release(); pending.finish(); count.decrementAndGet() }
        }
    }
    protected abstract fun handle(context: Context, intent: Intent): String?
    companion object { private val external = AtomicInteger(0); private val internal = AtomicInteger(0) }
}

class AutomationAlarmReceiver : AutomationReceiver() {
    override fun handle(context: Context, intent: Intent): String? {
        val id = intent.getStringExtra("id") ?: return null
        val at = intent.getLongExtra("at", -1)
        return AutomationEngine.execute(context, id, "alarm:$id:$at", at)
    }
}

class AutomationEventReceiver : AutomationReceiver() {
    override fun handle(context: Context, intent: Intent): String? {
        if (intent.action != "com.awakeonlanmobile.AUTOMATION_EVENT") return "rejected"
        val id = intent.getStringExtra("rule_id") ?: return "rejected"
        val token = intent.getStringExtra("token") ?: return "rejected"
        val event = intent.getStringExtra("event_id") ?: return "rejected"
        if (id.length !in 1..128 || token.length != 64 || !Regex("[a-zA-Z0-9_.:-]{1,128}").matches(event)) return "rejected"
        return AutomationEngine.execute(context, id, event, token = token)
    }
}

class AutomationSystemReceiver : AutomationReceiver() {
    override fun handle(context: Context, intent: Intent): String? {
        val state = AutomationStore.load(context)
        if (intent.action in listOf(Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) {
            val rules = state.getJSONArray("rules")
            repeat(rules.length()) { rules.getJSONObject(it).remove("nextAt") }
        }
        AutomationScheduler.sync(context, state)
        return null
    }
}
