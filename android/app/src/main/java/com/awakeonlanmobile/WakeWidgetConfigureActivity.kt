package com.awakeonlanmobile

import android.app.Activity
import android.app.KeyguardManager
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView

/** Native configuration also works when the React UI/Metro is not running. */
class WakeWidgetConfigureActivity : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setResult(RESULT_CANCELED)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (!WakeWidgetProvider.owns(this, widgetId)) { finish(); return }
        showDevices()
    }

    private fun showDevices() {
        val layout = nativeColumn()
        val message = TextView(this).apply {
            setText(R.string.widget_loading)
            textSize = 20f
        }
        layout.addView(message)
        val list = ListView(this)
        layout.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
        val retry = Button(this).apply {
            setText(R.string.widget_retry)
            visibility = View.GONE
            setOnClickListener { showDevices() }
        }
        layout.addView(retry)
        layout.addView(Button(this).apply {
            setText(R.string.widget_open_app)
            setOnClickListener {
                startActivity(Intent(this@WakeWidgetConfigureActivity, MainActivity::class.java))
                finish()
            }
        })
        layout.addView(Button(this).apply {
            setText(android.R.string.cancel)
            setOnClickListener { finish() }
        })
        setContentView(layout)
        DeviceStorageAccess.executor.execute {
            try {
                check(!getSystemService(KeyguardManager::class.java).isDeviceLocked)
                val devices = WidgetDevice.parseArchive(DeviceStorageAccess.store(this).load())
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    message.setText(if (devices.isEmpty()) R.string.widget_empty else R.string.widget_choose)
                    // No addresses or passwords are disclosed in the configuration picker.
                    list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_single_choice,
                        devices.mapIndexed { index, device -> device.name.ifEmpty { getString(R.string.widget_unnamed, index + 1) } })
                    list.choiceMode = ListView.CHOICE_MODE_SINGLE
                    val selected = devices.indexOfFirst { it.id == WakeWidgetProvider.selected(this, widgetId) }
                    if (selected >= 0) list.setItemChecked(selected, true)
                    list.setOnItemClickListener { _, _, position, _ ->
                        list.isEnabled = false
                        DeviceStorageAccess.executor.execute {
                            try {
                                WakeWidgetProvider.select(this, widgetId, devices[position].id)
                                WakeWidgetProvider.refreshAll(this)
                                runOnUiThread {
                                    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
                                    finish()
                                }
                            } catch (_: Exception) {
                                runOnUiThread {
                                    message.setText(R.string.widget_error)
                                    retry.visibility = View.VISIBLE
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) {
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        message.setText(R.string.widget_error)
                        retry.visibility = View.VISIBLE
                    }
                }
            }
        }
    }
}
