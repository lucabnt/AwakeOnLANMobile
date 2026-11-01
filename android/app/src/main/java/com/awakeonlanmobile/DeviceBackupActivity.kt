package com.awakeonlanmobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
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

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        if (android.os.Build.VERSION.SDK_INT < 26) { finish(); return }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setResult(RESULT_CANCELED)
        mode = state?.getString("mode").orEmpty()
        uri = state?.getString("uri")?.let { Uri.parse(it) }
        showForm()
    }

    @Suppress("DEPRECATION")
    @Deprecated("Back is blocked only while a backup transaction is running")
    override fun onBackPressed() {
        if (!busy) super.onBackPressed()
    }

    override fun onSaveInstanceState(out: Bundle) {
        out.putString("mode", mode)
        out.putString("uri", uri?.toString())
        // Passwords and decrypted archives are deliberately never saved in Activity state.
        super.onSaveInstanceState(out)
    }

    private fun showForm(message: String? = null) {
        val column = nativeColumn()
        column.addView(TextView(this).apply { setText(R.string.backup_title); textSize = 24f })
        column.addView(TextView(this).apply { text = message ?: getString(R.string.backup_explanation); textSize = 16f })
        if (uri == null) {
            column.addView(Button(this).apply {
                setText(R.string.backup_export)
                setOnClickListener { choose("export") }
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
                setText(if (mode == "export") R.string.backup_export else R.string.backup_decrypt)
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
        catch (_: Exception) { showForm(getString(R.string.backup_failure)) }
    }

    @Deprecated("Activity result API is used without adding an Activity dependency")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        if (request == 1 && result == RESULT_OK) {
            uri = runCatching { DeviceBackup.documentUri(checkNotNull(data?.data)) }.getOrNull()
            if (uri == null) { showForm(getString(R.string.backup_failure)); return }
        }
        showForm()
    }

    private fun begin(password: CharArray) {
        busy = true
        val destination = checkNotNull(uri)
        val operation = mode
        setContentView(nativeColumn().apply {
            addView(TextView(this@DeviceBackupActivity).apply { setText(R.string.backup_working); textSize = 20f })
        })
        crypto.execute {
            try {
                DeviceBackup.documentUri(destination)
                check(!getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked)
                if (operation == "export") {
                    val json = DeviceStorageAccess.executor.submit<String> {
                        DeviceBackup.normalize(DeviceStorageAccess.store(this).load() ?: "[]")
                    }.get()
                    val ciphertext = DeviceBackup.encrypt(json, password)
                    checkNotNull(contentResolver.openOutputStream(destination, "wt")).use { it.write(ciphertext); it.flush() }
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            uri = null; busy = false
                            showForm(getString(R.string.backup_exported))
                        }
                    }
                } else {
                    val bytes = checkNotNull(contentResolver.openInputStream(destination)).use { DeviceBackup.read(it) }
                    val json = DeviceBackup.decrypt(bytes, password)
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            decrypted = json
                            busy = false
                            AlertDialog.Builder(this)
                                .setTitle(R.string.backup_import)
                                .setMessage(getString(R.string.backup_import_count, JSONArray(json).length()))
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

    private fun commitImport() {
        val json = decrypted ?: return
        decrypted = null
        busy = true
        DeviceStorageAccess.executor.execute {
            try {
                val store = DeviceStorageAccess.store(this)
                store.save(DeviceBackup.merge(store.load(), json))
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
