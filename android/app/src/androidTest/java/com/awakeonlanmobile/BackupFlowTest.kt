package com.awakeonlanmobile

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.content.IntentFilter
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BackupFlowTest {
    @Test fun exportValidatesPasswordBeforeOpeningSavePickerAndCancellationAllowsRetry() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val filter = IntentFilter(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            addDataType("application/octet-stream")
        }
        val monitor = instrumentation.addMonitor(filter, Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null), true)
        val activity = instrumentation.startActivitySync(Intent(context, DeviceBackupActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        fun views(view: View): List<View> = listOf(view) + if (view is ViewGroup)
            (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
        fun all() = views(activity.window.decorView)
        fun click(label: Int) = all().filterIsInstance<Button>().single { it.text == context.getString(label) }.performClick()
        try {
            instrumentation.runOnMainSync {
                click(R.string.backup_export)
                assertEquals(2, all().filterIsInstance<EditText>().size)
                assertEquals(0, monitor.hits)
                click(R.string.backup_choose_destination)
                assertEquals(0, monitor.hits)
                val fields = all().filterIsInstance<EditText>()
                fields[0].setText("A long backup password")
                fields[1].setText("A different password")
                click(R.string.backup_choose_destination)
                assertEquals(0, monitor.hits)
                fields[1].setText("A long backup password")
                click(R.string.backup_choose_destination)
            }
            val deadline = android.os.SystemClock.elapsedRealtime() + 15000
            while (monitor.hits == 0 && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(50)
            instrumentation.waitForIdleSync()
            assertEquals(1, monitor.hits)
            instrumentation.runOnMainSync {
                assertTrue(all().filterIsInstance<EditText>().all { it.text.isEmpty() })
                assertEquals(2, all().filterIsInstance<EditText>().size)
                click(R.string.backup_choose_destination)
                assertEquals(1, monitor.hits)
            }
        } finally {
            instrumentation.runOnMainSync { activity.finish() }
            instrumentation.removeMonitor(monitor)
        }
    }
}
