package com.lingyun.fortune

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.math.abs

class MainActivity : AppCompatActivity(), SensorEventListener {
    private lateinit var webView: WebView
    private lateinit var bridge: WebAppInterface
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var lastBackPressTime = 0L
    private var lastShakeTime = 0L
    private var lastValues: FloatArray? = null
    private var safeTop = 0
    private var safeBottom = 0
    private var pendingImage: ByteArray? = null
    private var resumed = false
    private val appUrl = "https://appassets.androidplatform.net/assets/index.html"
    private val saveDocument = registerForActivityResult(ActivityResultContracts.CreateDocument("image/png")) { uri ->
        val image = pendingImage
        pendingImage = null
        bridge.finishLegacySave(uri, image)
    }
    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { updatePowerMode() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.parseColor("#07080E")
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        val container = FrameLayout(this)
        webView = WebView(this)
        container.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(container)
        ViewCompat.setOnApplyWindowInsetsListener(container) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            val density = resources.displayMetrics.density
            safeTop = (bars.top / density).toInt()
            safeBottom = if (keyboard > bars.bottom) 0 else (bars.bottom / density).toInt()
            val params = webView.layoutParams as FrameLayout.LayoutParams
            val margin = if (keyboard > bars.bottom) keyboard else 0
            if (params.bottomMargin != margin || params.leftMargin != bars.left || params.rightMargin != bars.right) {
                params.bottomMargin = margin
                params.leftMargin = bars.left
                params.rightMargin = bars.right
                webView.layoutParams = params
            }
            dispatchInsets()
            insets
        }
        bridge = WebAppInterface(this, { bytes ->
            pendingImage = bytes
            try { saveDocument.launch("Xingyun_" + System.currentTimeMillis() + ".png") }
            catch (_: Exception) { pendingImage = null; bridge.finishLegacySave(null, null) }
        }, { operation, success, message ->
            evaluate("window.onNativeResult?.(" + JSONObject.quote(operation) + "," + success + "," + JSONObject.quote(message) + ")")
            Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
        })
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView.setBackgroundColor(Color.parseColor("#030406"))
        webView.isVerticalScrollBarEnabled = false
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            textZoom = 100
        }
        webView.addJavascriptInterface(bridge, "AndroidBridge")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse {
                if (request.url.scheme == "https" && request.url.host == "appassets.androidplatform.net") {
                    loader.shouldInterceptRequest(request.url)?.let { return it }
                }
                return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean = request.url.toString() != appUrl
            override fun onPageFinished(view: WebView?, url: String?) {
                dispatchInsets()
                updatePowerMode()
                evaluate(if (resumed) "window.onNativeResume?.()" else "window.onNativePause?.()")
            }
        }
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("window.handleAndroidBack?.() || false") { handled ->
                    if (handled != "true") {
                        val now = SystemClock.elapsedRealtime()
                        if (lastBackPressTime > 0 && now - lastBackPressTime < 2000) finish()
                        else { lastBackPressTime = now; Toast.makeText(this@MainActivity, "再按一次退出星运灵签", Toast.LENGTH_SHORT).show() }
                    }
                }
            }
        })
        webView.loadUrl(appUrl)
        ViewCompat.requestApplyInsets(container)
    }

    private fun evaluate(script: String) {
        if (!isDestroyed) webView.evaluateJavascript(script, null)
    }

    private fun dispatchInsets() { evaluate("window.setSystemInsets?.(" + safeTop + "," + safeBottom + ")") }

    private fun updatePowerMode() {
        val saving = (getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode
        val screen = window.decorView.display
        val target = if (saving) 60f else 120f
        if (screen != null) {
            val mode = screen.supportedModes.filter {
                it.physicalWidth == screen.mode.physicalWidth && it.physicalHeight == screen.mode.physicalHeight && it.refreshRate <= target + 0.5f
            }.maxByOrNull { it.refreshRate }
            if (mode != null) window.attributes = window.attributes.apply { preferredDisplayModeId = mode.modeId }
        }
        evaluate("window.setPowerSaving?.(" + saving + ")")
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        lastValues = null
        webView.onResume()
        accelerometer?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        ContextCompat.registerReceiver(this, powerReceiver, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
        updatePowerMode()
        evaluate("window.onNativeResume?.()")
    }

    override fun onPause() {
        resumed = false
        sensorManager?.unregisterListener(this)
        unregisterReceiver(powerReceiver)
        evaluate("window.onNativePause?.()")
        webView.onPause()
        super.onPause()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!resumed || event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        val previous = lastValues
        lastValues = event.values.copyOf()
        if (previous == null) return
        val delta = (0..2).sumOf { abs(event.values[it] - previous[it]).toDouble() }
        val now = SystemClock.elapsedRealtime()
        if (delta > 13 && now - lastShakeTime > 1000) {
            lastShakeTime = now
            evaluate("window.handleNativeShake?.()")
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        sensorManager?.unregisterListener(this)
        bridge.close()
        webView.removeJavascriptInterface("AndroidBridge")
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
