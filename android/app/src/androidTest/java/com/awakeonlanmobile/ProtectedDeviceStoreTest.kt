package com.awakeonlanmobile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import java.util.UUID
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProtectedDeviceStoreTest {
    private lateinit var directory: File
    private lateinit var legacy: File
    private lateinit var alias: String
    private lateinit var store: ProtectedDeviceStore
    private val json = """[{"id":"pc","macAddr":"001122334455","passwd":" private "}]"""

    @Before fun setup() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        alias = "AwakeOnLANMobile.test.${UUID.randomUUID()}"
        directory = File(context.noBackupFilesDir, alias).apply { mkdirs() }
        legacy = File(directory, "devices.json")
        store = ProtectedDeviceStore(directory, legacy, alias)
    }

    @After fun cleanup() {
        directory.deleteRecursively()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
    }

    private fun fails(block: () -> Unit) {
        var failed = false
        try { block() } catch (_: Exception) { failed = true }
        assertTrue("Operation must fail without plaintext fallback", failed)
    }

    @Test fun migratesOnlyAfterEncryptedCommitAndUsesRandomIVs() {
        legacy.writeText(json)
        assertEquals(json, store.load())
        assertTrue(legacy.exists())
        store.save(json)
        assertFalse(legacy.exists())
        val encrypted = File(directory, "devices.enc")
        val first = encrypted.readBytes()
        assertFalse(encrypted.readText().contains("private"))
        assertEquals(json, store.load())
        store.save(json)
        assertFalse(first.contentEquals(encrypted.readBytes()))
        assertEquals(json, store.load())
    }

    @Test fun detectsTamperingAndNeverFallsBackToLegacy() {
        store.save(json)
        val encrypted = File(directory, "devices.enc")
        val bytes = encrypted.readBytes()
        bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte()
        encrypted.writeBytes(bytes)
        legacy.writeText("[]")
        fails { store.load() }
        assertEquals("[]", legacy.readText())
        assertTrue(bytes.contentEquals(encrypted.readBytes()))
    }

    @Test fun missingKeyDoesNotGenerateReplacementOrEraseData() {
        store.save(json)
        val encrypted = File(directory, "devices.enc").readBytes()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
        fails { store.load() }
        fails { store.save("[]") }
        assertTrue(encrypted.contentEquals(File(directory, "devices.enc").readBytes()))
    }

    @Test fun rejectsInvalidWritesWithoutRemovingLegacy() {
        legacy.writeText(json)
        fails { store.save("{}") }
        assertEquals(json, legacy.readText())
        assertFalse(File(directory, "devices.enc").exists())
        fails { store.save("[\"" + "x".repeat(1024 * 1024) + "\"]") }
        assertEquals(json, legacy.readText())
    }

    @Test fun recoversAtomicFileBackup() {
        store.save(json)
        val encrypted = File(directory, "devices.enc")
        encrypted.copyTo(File(directory, "devices.enc.bak"))
        encrypted.writeText("interrupted write")
        assertEquals(json, store.load())
    }
}
