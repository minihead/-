package com.lingyun.fortune

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.abs

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var webView: WebView
    private var lastBackPressTime: Long = 0

    // Physical Accelerometer Sensor Shake Detection
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var lastShakeTime: Long = 0
    private var lastX = 0f
    private var lastY = 0f
    private var lastZ = 0f
    private var isFirstSensorRead = true

    private var cachedStatusTopDp = 28
    private var cachedNavBottomDp = 24

    private fun setupInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, windowInsets ->
            val navInsets = windowInsets.getInsets(WindowInsetsCompat.Type.navigationBars())
            val statusInsets = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars())
            val density = resources.displayMetrics.density
            if (density > 0) {
                cachedNavBottomDp = (navInsets.bottom / density).toInt()
                cachedStatusTopDp = (statusInsets.top / density).toInt()
            }
            dispatchInsetsToWeb()
            windowInsets
        }
    }

    private fun dispatchInsetsToWeb() {
        val top = if (cachedStatusTopDp > 0) cachedStatusTopDp else 28
        val bottom = if (cachedNavBottomDp > 0) cachedNavBottomDp else 24
        webView.post {
            webView.evaluateJavascript(
                "if (typeof window.setSystemInsets === 'function') { window.setSystemInsets($top, $bottom); }",
                null
            )
        }
    }


    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge immersive setup
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.parseColor("#07080E")

        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = false
        insetsController.isAppearanceLightNavigationBars = false

        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)

        webView = WebView(this)
        setContentView(webView)

        setupInsets()
        setupWebView()
        setupBackNavigation()
        setupAccelerometer()

        // Load local bundled web application
        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun setupAccelerometer() {
        try {
            sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            accelerometer?.let {
                sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            sensorManager?.unregisterListener(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        if (isFirstSensorRead) {
            lastX = x
            lastY = y
            lastZ = z
            isFirstSensorRead = false
            return
        }

        val deltaX = abs(x - lastX)
        val deltaY = abs(y - lastY)
        val deltaZ = abs(z - lastZ)
        val speed = deltaX + deltaY + deltaZ

        lastX = x
        lastY = y
        lastZ = z

        val now = System.currentTimeMillis()
        // Threshold for physical phone shake
        if (speed > 13.0f && (now - lastShakeTime > 800)) {
            lastShakeTime = now
            runOnUiThread {
                webView.evaluateJavascript("if (typeof window.handleNativeShake === 'function') { window.handleNativeShake(); }", null)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.apply {
            setBackgroundColor(Color.parseColor("#07080E"))
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            setLayerType(View.LAYER_TYPE_HARDWARE, null)

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                allowFileAccessFromFileURLs = true
                allowUniversalAccessFromFileURLs = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT

                useWideViewPort = false
                loadWithOverviewMode = false

                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                textZoom = 100
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }

            addJavascriptInterface(WebAppInterface(this@MainActivity), "AndroidBridge")

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    dispatchInsetsToWeb()
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                    consoleMessage?.let {
                        Log.d("XingyunFortune", "[JS] ${it.message()} -- line ${it.lineNumber()} of ${it.sourceId()}")
                    }
                    return true
                }
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("typeof window.handleAndroidBack === 'function' ? window.handleAndroidBack() : false") { result ->
                    val handled = result == "true"
                    if (!handled) {
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastBackPressTime < 2000) {
                            finish()
                        } else {
                            lastBackPressTime = currentTime
                            Toast.makeText(this@MainActivity, "再按一次退出星运灵签", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        })
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
