package com.lingyun.fortune

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class WebAppInterface(
    context: Context,
    private val requestLegacySave: (ByteArray) -> Unit,
    private val report: (String, Boolean, String) -> Unit
) {
    private val context = context.applicationContext
    private val store = PrivateStore(context)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)

    @JavascriptInterface
    fun readState(): String = try { store.read() } catch (_: Exception) { "{\"error\":\"encrypted_state_unavailable\"}" }

    @JavascriptInterface
    fun writeState(value: String): Boolean = try { store.write(value) } catch (_: Exception) { false }

    private fun complete(operation: String, success: Boolean, message: String) {
        busy.set(false)
        if (!closed.get()) mainHandler.post { if (!closed.get()) report(operation, success, message) }
    }

    private fun execute(operation: String, action: () -> Unit): Boolean {
        if (closed.get() || !busy.compareAndSet(false, true)) return false
        try {
            executor.execute {
                try { action() } catch (_: Exception) { complete(operation, false, "操作未完成，请重试；已有记录未更改") }
            }
        } catch (_: Exception) {
            busy.set(false)
            return false
        }
        return true
    }

    private fun imageBytes(value: String): ByteArray {
        require(value.length <= 8_000_000 && value.startsWith("data:image/png;base64,"))
        val bytes = Base64.decode(value.substringAfter(','), Base64.DEFAULT)
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        require(options.outWidth in 1..2048 && options.outHeight in 1..2048)
        val bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        return try {
            java.io.ByteArrayOutputStream().use { stream ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
                stream.toByteArray()
            }
        } finally { bitmap.recycle() }
    }

    @JavascriptInterface
    fun saveImageToGallery(value: String): Boolean = execute("save") {
        val bytes = imageBytes(value)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            mainHandler.post {
                if (closed.get()) busy.set(false)
                else requestLegacySave(bytes)
            }
        } else {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "Xingyun_" + UUID.randomUUID() + ".png")
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/XingyunFortune")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val uri = requireNotNull(resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values))
            try {
                requireNotNull(resolver.openOutputStream(uri)).use { it.write(bytes) }
                val published = ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }
                check(resolver.update(uri, published, null, null) == 1)
                complete("save", true, "运势卡已保存到相册")
            } catch (error: Exception) {
                resolver.delete(uri, null, null)
                throw error
            }
        }
    }

    fun finishLegacySave(uri: Uri?, bytes: ByteArray?) {
        if (uri == null || bytes == null) { complete("save", false, "已取消保存"); return }
        if (closed.get()) return
        executor.execute {
            try {
                requireNotNull(context.contentResolver.openOutputStream(uri)).use { it.write(bytes) }
                complete("save", true, "运势卡已保存到所选位置")
            } catch (_: Exception) { complete("save", false, "保存失败，请重新选择位置") }
        }
    }

    private fun share(bytes: ByteArray, mimeType: String, extension: String, operation: String) {
        val folder = File(context.cacheDir, "images").apply { mkdirs() }
        val cutoff = System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L
        folder.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
        val file = File(folder, "xingyun_" + UUID.randomUUID() + "." + extension)
        file.outputStream().use { it.write(bytes) }
        val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
        mainHandler.post {
            if (closed.get()) { busy.set(false); return@post }
            try {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = ClipData.newRawUri("星运灵签", uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(intent, "分享星运灵签").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                complete(operation, true, "已打开分享面板")
            } catch (_: Exception) { complete(operation, false, "没有可用的分享应用") }
        }
    }

    @JavascriptInterface
    fun shareImage(value: String): Boolean = execute("share") { share(imageBytes(value), "image/png", "png", "share") }

    @JavascriptInterface
    fun exportData(value: String): Boolean = execute("export") {
        require(value.toByteArray().size <= 1_000_000)
        share(value.toByteArray(Charsets.UTF_8), "application/json", "json", "export")
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        if (closed.get()) return
        try {
            val duration = durationMs.coerceIn(5, 100)
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(VibratorManager::class.java).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE))
            else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(duration)
            }
        } catch (_: Exception) {}
    }

    fun close() {
        closed.set(true)
        mainHandler.removeCallbacksAndMessages(null)
        executor.shutdown()
    }
}
