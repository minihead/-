package com.lingyun.fortune

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

class WebAppInterface(private val context: Context) {

    private val mainHandler = Handler(Looper.getMainLooper())

    private fun postToast(msg: String, duration: Int = Toast.LENGTH_SHORT) {
        mainHandler.post {
            try {
                Toast.makeText(context.applicationContext, msg, duration).show()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * Decode base64 image data and save into Android System MediaStore (Gallery)
     */
    @JavascriptInterface
    fun saveImageToGallery(base64Data: String) {
        Thread {
            try {
                val cleanBase64 = if (base64Data.contains(",")) {
                    base64Data.substringAfter(",")
                } else {
                    base64Data
                }

                val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)

                if (bitmap != null) {
                    val fileName = "Xingyun_Fortune_${System.currentTimeMillis()}.png"
                    val contentValues = ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/XingyunFortune")
                            put(MediaStore.Images.Media.IS_PENDING, 1)
                        }
                    }

                    val resolver = context.contentResolver
                    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)

                    if (uri != null) {
                        val out: OutputStream? = resolver.openOutputStream(uri)
                        out?.use {
                            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            contentValues.clear()
                            contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                            resolver.update(uri, contentValues, null, null)
                        }

                        postToast("✦ 专属运势签卡已保存至系统相册 ✦", Toast.LENGTH_LONG)
                        vibrate(40)
                    } else {
                        postToast("保存失败：无法创建图片文件")
                    }
                } else {
                    postToast("保存失败：图片解析异常")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                postToast("保存异常: ${e.localizedMessage}")
            }
        }.start()
    }

    /**
     * Share fortune card via Android Native Intent.ACTION_SEND
     */
    @JavascriptInterface
    fun shareImage(base64Data: String) {
        Thread {
            try {
                val cleanBase64 = if (base64Data.contains(",")) {
                    base64Data.substringAfter(",")
                } else {
                    base64Data
                }

                val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)

                if (bitmap != null) {
                    val cacheFolder = File(context.cacheDir, "images")
                    if (!cacheFolder.exists()) {
                        cacheFolder.mkdirs()
                    }
                    val file = File(cacheFolder, "xingyun_fortune_share.png")
                    val out = FileOutputStream(file)
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    out.flush()
                    out.close()

                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "image/png"
                        putExtra(Intent.EXTRA_STREAM, uri)
                        putExtra(Intent.EXTRA_TEXT, "✦ 星运灵签 · 乾坤吉曜 ✦ 今日专属运势指引")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }

                    val chooser = Intent.createChooser(shareIntent, "分享我的今日运势签卡").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(chooser)
                } else {
                    postToast("分享失败：图片解析异常")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                postToast("分享失败: ${e.localizedMessage}")
            }
        }.start()
    }

    /**
     * Native physical haptic vibration
     */
    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        try {
            val dur = if (durationMs in 5..1000) durationMs else 35L
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(dur)
                }
            }
        } catch (e: Exception) {
            // Ignored
        }
    }

    @JavascriptInterface
    fun showToast(message: String) {
        postToast(message)
    }
}
