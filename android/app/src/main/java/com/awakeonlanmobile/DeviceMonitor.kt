package com.awakeonlanmobile

import android.os.SystemClock
import com.facebook.react.bridge.Promise
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

internal class DeviceMonitor {
    private val sessions = ConcurrentHashMap<String, AtomicBoolean>()
    private val workers = Executors.newFixedThreadPool(2)
    @Synchronized fun start(id: String, device: WidgetDevice, duration: Int, promise: Promise) {
        // Two workers probe; two extra slots allow a new visible-list generation to replace cancelling sessions.
        if (sessions.size >= 4 || sessions.containsKey(id)) { promise.reject("STATUS_BUSY", "Status sessions are busy."); return }
        val cancelled = AtomicBoolean(false)
        sessions[id] = cancelled
        workers.execute {
            val deadline = SystemClock.elapsedRealtime() + duration
            var previous: Boolean? = null
            var result = "timeout"
            try {
                while (!cancelled.get() && SystemClock.elapsedRealtime() < deadline) {
                    val remaining = (deadline - SystemClock.elapsedRealtime()).toInt()
                    if (remaining <= 0) break
                    val reachable = device.reachable(minOf(1500, remaining))
                    if (reachable && previous == true) { result = "reachable"; break }
                    if (duration <= 6000 && !reachable && previous == false) break
                    previous = reachable
                    var wait = minOf(2000L, deadline - SystemClock.elapsedRealtime())
                    while (wait > 0 && !cancelled.get()) { Thread.sleep(minOf(100L, wait)); wait -= 100 }
                }
                if (cancelled.get()) result = "cancelled"
            } catch (_: Exception) { result = if (cancelled.get()) "cancelled" else "error" }
            finally {
                sessions.remove(id)
                promise.resolve(JSONObject().put("state", result).put("checkedAt", System.currentTimeMillis()).toString())
            }
        }
    }
    fun cancel(id: String) { sessions[id]?.set(true) }
    fun close() { sessions.values.forEach { it.set(true) }; workers.shutdown() }
}
