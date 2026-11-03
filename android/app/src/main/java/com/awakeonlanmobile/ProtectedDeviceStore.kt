package com.awakeonlanmobile

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.io.IOException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray

/** Authenticated encryption at rest. Never fall back after a decryption failure. */
internal class ProtectedDeviceStore(
    directory: File,
    private val legacyFile: File,
    private val keyAlias: String = "AwakeOnLANMobile.devices.v1",
    fileName: String = "devices.enc",
) {
    private val file = AtomicFile(File(directory, fileName))
    private val header = "AWOL1".toByteArray(Charsets.US_ASCII)
    private val maxBytes = 1024 * 1024

    private fun key(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(keyAlias)) {
            return store.getKey(keyAlias, null) as SecretKey
        }
        check(create) { "Device storage key is unavailable." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setKeySize(256)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    @Synchronized
    fun load(): String? {
        // openRead also restores AtomicFile's backup after an interrupted write.
        if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists()) {
            val bytes = file.openRead().use { it.readBytesLimited(maxBytes + 64) }
            require(bytes.size >= header.size + 12 + 16 && bytes.take(header.size).toByteArray().contentEquals(header)) {
                "Invalid encrypted storage format."
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, bytes.copyOfRange(header.size, header.size + 12)))
            cipher.updateAAD(header)
            val plaintext = cipher.doFinal(bytes, header.size + 12, bytes.size - header.size - 12)
            return plaintext.toString(Charsets.UTF_8)
        }
        // JS validates the legacy schema before calling save to commit migration.
        return if (legacyFile.exists()) legacyFile.inputStream().use {
            it.readBytesLimited(maxBytes).toString(Charsets.UTF_8)
        } else null
    }

    @Synchronized
    fun save(json: String) {
        val plaintext = json.toByteArray(Charsets.UTF_8)
        require(plaintext.size <= maxBytes) { "Device storage is too large." }
        JSONArray(json) // Refuse non-array payloads even if called outside the JS storage service.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()))
        cipher.updateAAD(header)
        check(cipher.iv.size == 12) { "Unexpected GCM IV length." }
        val encrypted = header + cipher.iv + cipher.doFinal(plaintext)
        val output = file.startWrite()
        try {
            output.write(encrypted)
            file.finishWrite(output)
        } catch (error: Exception) {
            file.failWrite(output)
            throw error
        }
        // Verify the durable copy before removing the original plaintext.
        check(load() == json) { "Encrypted device storage verification failed." }
        if (legacyFile.exists() && !legacyFile.delete()) {
            throw IOException("Could not remove legacy device storage.")
        }
    }

    private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = read(buffer)
            if (count == -1) break
            require(output.size() + count <= limit) { "Device storage is too large." }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }
}
