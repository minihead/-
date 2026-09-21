# Keep Javascript Interface
-keepattributes JavascriptInterface
-keepclassmembers class com.lingyun.fortune.WebAppInterface {
    <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
