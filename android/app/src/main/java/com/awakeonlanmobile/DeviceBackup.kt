package com.awakeonlanmobile

import android.os.Build
import java.io.InputStream
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONArray
import org.json.JSONObject

internal object DeviceBackup {
    const val MAX_ARCHIVE = 1024 * 1024
    private val magic = "AWOLBK01".toByteArray(Charsets.US_ASCII)
    private const val SALT_SIZE = 32
    private const val IV_SIZE = 12
    // These parameters are part of AWOLBK01; changing them requires a new format version.
    private const val ITERATIONS = 600_000
    private val fields = listOf("id", "name", "macAddr", "ipAddr", "port", "passwd", "statusIp", "statusPort")

    fun documentUri(uri: android.net.Uri): android.net.Uri {
        // SAF grants content URIs. Never let a forged file:// result target private app files.
        require(uri.scheme == "content" && !uri.authority.isNullOrEmpty())
        return uri
    }

    fun normalize(json: String): String {
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_ARCHIVE)
        WidgetDevice.parseArchive(json)
        val source = JSONArray(json)
        return JSONArray().apply {
            repeat(source.length()) { index ->
                val item = source.getJSONObject(index)
                put(JSONObject().apply { fields.forEach { key -> if (item.has(key)) put(key, item.getString(key)) } })
            }
        }.toString().also { require(it.toByteArray(Charsets.UTF_8).size <= MAX_ARCHIVE) }
    }

    fun merge(existing: String?, imported: String): String {
        val target = JSONArray(normalize(existing ?: "[]"))
        val source = JSONArray(normalize(imported))
        require(target.length() + source.length() <= 1000)
        repeat(source.length()) { index ->
            target.put(source.getJSONObject(index).put("id", UUID.randomUUID().toString()))
        }
        return normalize(target.toString())
    }

    private fun key(password: CharArray, salt: ByteArray): ByteArray {
        check(Build.VERSION.SDK_INT >= 26) { "Encrypted backups require Android 8 or newer." }
        require(password.size in 12..256)
        val spec = PBEKeySpec(password, salt, ITERATIONS, 256)
        return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
        finally { spec.clearPassword() }
    }

    fun encrypt(json: String, password: CharArray): ByteArray {
        val plaintext = normalize(json).toByteArray(Charsets.UTF_8)
        val salt = ByteArray(SALT_SIZE).also { SecureRandom().nextBytes(it) }
        val derived = key(password, salt)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(derived, "AES"))
            check(cipher.iv.size == IV_SIZE)
            val header = magic + salt + cipher.iv
            cipher.updateAAD(header)
            header + cipher.doFinal(plaintext)
        } finally { derived.fill(0); plaintext.fill(0) }
    }

    fun decrypt(bytes: ByteArray, password: CharArray): String {
        val headerSize = magic.size + SALT_SIZE + IV_SIZE
        require(bytes.size in (headerSize + 16)..(MAX_ARCHIVE + headerSize + 16))
        require(bytes.copyOfRange(0, magic.size).contentEquals(magic))
        val salt = bytes.copyOfRange(magic.size, magic.size + SALT_SIZE)
        val derived = key(password, salt)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(derived, "AES"),
                GCMParameterSpec(128, bytes.copyOfRange(magic.size + SALT_SIZE, headerSize)))
            cipher.updateAAD(bytes.copyOfRange(0, headerSize))
            val plaintext = cipher.doFinal(bytes, headerSize, bytes.size - headerSize)
            try { normalize(plaintext.toString(Charsets.UTF_8)) } finally { plaintext.fill(0) }
        } finally { derived.fill(0) }
    }

    fun read(input: InputStream): ByteArray {
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) return output.toByteArray()
            require(output.size() + count <= MAX_ARCHIVE + 68)
            output.write(buffer, 0, count)
        }
    }
}
