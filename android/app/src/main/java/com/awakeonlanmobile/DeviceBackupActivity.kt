package com.awakeonlanmobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors
import org.json.JSONArray

@android.annotation.TargetApi(26)
class DeviceBackupActivity : Activity() {
    private var mode = ""
    private var uri: Uri? = null
    private var busy = false
    private var decrypted: String? = null
    private var pendingExport: ByteArray? = null

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (android.os.Build.VERSION.SDK_INT < 26) { finish(); return }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setResult(RESULT_CANCELED)
        mode = state?.getString("mode").orEmpty()
        uri = if (mode == "import") state?.getString("uri")?.toUri() else null
        showForm()
    }

    @Suppress("DEPRECATION")
    @Deprecated("Back is blocked only while a backup transaction is running")
    override fun onBackPressed() {
        if (!busy) super.onBackPressed()
    }

    override fun onSaveInstanceState(out: Bundle) {
        out.putString("mode", mode)
        if (mode == "import") out.putString("uri", uri?.toString())
        // Passwords and decrypted archives are deliberately never saved in Activity state.
        super.onSaveInstanceState(out)
    }

    private fun showForm(message: String? = null) {
        val column = nativeColumn()
        column.addView(TextView(this).apply { setText(R.string.backup_title); textSize = 24f })
        column.addView(TextView(this).apply { text = message ?: getString(R.string.backup_explanation); textSize = 16f })
        if (mode != "export" && uri == null) {
            column.addView(Button(this).apply {
                setText(R.string.backup_export)
                setOnClickListener { mode = "export"; showForm() }
            })
            column.addView(Button(this).apply {
                setText(R.string.backup_import)
                setOnClickListener { choose("import") }
            })
        } else {
            column.addView(TextView(this).apply { setText(R.string.backup_password_hint) })
            val password = passwordInput(R.string.backup_password)
            column.addView(password)
            val confirm = passwordInput(R.string.backup_confirm)
            if (mode == "export") column.addView(confirm)
            column.addView(Button(this).apply {
                setText(if (mode == "export") R.string.backup_choose_destination else R.string.backup_decrypt)
                setOnClickListener {
                    if (busy) return@setOnClickListener
                    if (password.length() !in 12..256 || (mode == "export" && password.text.toString() != confirm.text.toString())) {
                        password.error = getString(R.string.backup_password_error)
                        return@setOnClickListener
                    }
                    val secret = password.text.toString().toCharArray()
                    password.text.clear(); confirm.text.clear()
                    begin(secret)
                }
            })
        }
        column.addView(Button(this).apply {
            setText(android.R.string.cancel)
            setOnClickListener { finish() }
        })
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun passwordInput(hint: Int) = EditText(this).apply {
        setHint(hint)
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        filters = arrayOf(android.text.InputFilter.LengthFilter(256))
        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        isSaveEnabled = false
    }

    private fun choose(operation: String) {
        mode = operation
        val intent = Intent(if (mode == "export") Intent.ACTION_CREATE_DOCUMENT else Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream")
        if (mode == "export") intent.putExtra(Intent.EXTRA_TITLE, "awakeonlan-backup.awol")
        else intent.type = "*/*"
        try { startActivityForResult(intent, 1) }
        catch (_: Exception) { pendingExport = null; showForm(getString(R.string.backup_failure)) }
    }

    @Deprecated("Activity result API is used without adding an Activity dependency")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        if (request != 1) return
        if (request == 1 && result == RESULT_OK) {
            uri = runCatching { DeviceBackup.documentUri(checkNotNull(data?.data)) }.getOrNull()
            if (uri == null) { pendingExport = null; showForm(getString(R.string.backup_failure)); return }
            if (mode == "export") {
                val ciphertext = pendingExport
                pendingExport = null
                if (ciphertext == null) { uri = null; showForm(getString(R.string.backup_failure)); return }
                writeExport(uri!!, ciphertext)
                return
            }
        }
        pendingExport = null
        showForm()
    }

    private fun begin(password: CharArray) {
        busy = true
        val destination = uri
        val operation = mode
        setContentView(nativeColumn().apply {
            addView(TextView(this@DeviceBackupActivity).apply { setText(R.string.backup_working); textSize = 20f })
        })
        crypto.execute {
            try {
                check(!getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked)
                if (operation == "export") {
                    val json = DeviceStorageAccess.executor.submit<String> {
                        DeviceBackup.exportDocument(this)
                    }.get()
                    val ciphertext = DeviceBackup.encrypt(json, password)
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            pendingExport = ciphertext
                            busy = false
                            showForm(getString(R.string.backup_choose_destination))
                            choose("export")
                        }
                    }
                } else {
                    val bytes = checkNotNull(contentResolver.openInputStream(DeviceBackup.documentUri(checkNotNull(destination)))).use { DeviceBackup.read(it) }
                    val json = DeviceBackup.decrypt(bytes, password)
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            decrypted = json
                            busy = false
                            val count = DeviceBackup.countDevices(json)
                            AlertDialog.Builder(this)
                                .setTitle(R.string.backup_import)
                                .setMessage(resources.getQuantityString(R.plurals.backup_import_count, count, count) + "\nImported automations stay disabled. Re-enable them explicitly; external integrations need a new token.")
                                .setPositiveButton(R.string.backup_add) { _, _ -> commitImport() }
                                .setNegativeButton(android.R.string.cancel) { _, _ -> decrypted = null; showForm() }
                                .setOnCancelListener { decrypted = null; showForm() }
                                .show()
                        }
                    }
                }
            } catch (_: Exception) {
                runOnUiThread { if (!isFinishing && !isDestroyed) { busy = false; showForm(getString(R.string.backup_failure)) } }
            } finally { password.fill('\u0000') }
        }
    }

    private fun writeExport(destination: Uri, ciphertext: ByteArray) {
        busy = true
        setContentView(nativeColumn().apply {
            addView(TextView(this@DeviceBackupActivity).apply { setText(R.string.backup_working) })
        })
        crypto.execute {
            val success = runCatching {
                check(!getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked)
                checkNotNull(contentResolver.openOutputStream(DeviceBackup.documentUri(destination), "wt")).use {
                    it.write(ciphertext); it.flush()
                }
            }.isSuccess
            runOnUiThread {
                if (!isFinishing && !isDestroyed) {
                    uri = null; mode = ""; busy = false
                    showForm(getString(if (success) R.string.backup_exported else R.string.backup_failure))
                }
            }
        }
    }

    override fun onDestroy() {
        pendingExport = null
        decrypted = null
        super.onDestroy()
    }

    private fun commitImport() {
        val json = decrypted ?: return
        decrypted = null
        busy = true
        DeviceStorageAccess.executor.execute {
            try {
                DeviceBackup.importDocument(this, json)
                runCatching { WakeWidgetProvider.refreshAll(this) }
                runOnUiThread { setResult(RESULT_OK); finish() }
            } catch (_: Exception) {
                runOnUiThread { if (!isFinishing && !isDestroyed) { busy = false; showForm(getString(R.string.backup_failure)) } }
            }
        }
    }

    companion object {
        private val crypto = Executors.newSingleThreadExecutor { Thread(it, "EncryptedBackup").apply { isDaemon = true } }
    }
}
