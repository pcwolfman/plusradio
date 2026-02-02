# Android WebView Entegrasyonu - Mikrofon İzni

Bu dosya, Android uygulamanızda WebView içinde mikrofon izni için gerekli entegrasyonu açıklar.

## Android Tarafı (Java/Kotlin)

### 1. WebView'e JavaScript Interface Ekleme

```java
public class MainActivity extends AppCompatActivity {
    private WebView webView;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        webView = findViewById(R.id.webView);
        
        // WebView ayarları
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        
        // JavaScript Interface ekle
        webView.addJavascriptInterface(new WebAppInterface(this), "Android");
        
        // WebView'e URL yükle
        webView.loadUrl("file:///android_asset/index.html");
        // veya
        // webView.loadUrl("http://your-server.com/index.html");
    }
}
```

### 2. JavaScript Interface Sınıfı

```java
public class WebAppInterface {
    private Activity activity;
    private static final int REQUEST_MICROPHONE_PERMISSION = 100;
    
    public WebAppInterface(Activity activity) {
        this.activity = activity;
    }
    
    @JavascriptInterface
    public void requestMicrophonePermission() {
        activity.runOnUiThread(() -> {
            // Android 6.0 (API 23) ve üzeri için runtime permission kontrolü
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (ContextCompat.checkSelfPermission(activity, 
                        Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    
                    // İzin yoksa, kullanıcıdan izin iste
                    ActivityCompat.requestPermissions(activity,
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            REQUEST_MICROPHONE_PERMISSION);
                } else {
                    // İzin zaten verilmiş
                    grantMicrophonePermission();
                }
            } else {
                // Android 6.0 altı için izin otomatik verilmiş sayılır
                grantMicrophonePermission();
            }
        });
    }
    
    private void grantMicrophonePermission() {
        // JavaScript'e izin verildiğini bildir
        webView.evaluateJavascript(
            "if (typeof onMicrophonePermissionGranted === 'function') { " +
            "onMicrophonePermissionGranted(); }", null);
    }
    
    private void denyMicrophonePermission() {
        // JavaScript'e izin reddedildiğini bildir
        webView.evaluateJavascript(
            "if (typeof onMicrophonePermissionDenied === 'function') { " +
            "onMicrophonePermissionDenied(); }", null);
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, 
                                           @NonNull String[] permissions, 
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == REQUEST_MICROPHONE_PERMISSION) {
            if (grantResults.length > 0 && 
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // İzin verildi
                grantMicrophonePermission();
            } else {
                // İzin reddedildi
                denyMicrophonePermission();
            }
        }
    }
}
```

### 3. AndroidManifest.xml

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.plusradio">
    
    <!-- Mikrofon izni -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        
        <activity android:name=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

## Kotlin Versiyonu

```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val REQUEST_MICROPHONE_PERMISSION = 100
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        webView = findViewById(R.id.webView)
        
        val webSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.mediaPlaybackRequiresUserGesture = false
        
        // JavaScript Interface ekle
        webView.addJavascriptInterface(WebAppInterface(this), "Android")
        
        webView.loadUrl("file:///android_asset/index.html")
    }
    
    inner class WebAppInterface(private val activity: Activity) {
        @JavascriptInterface
        fun requestMicrophonePermission() {
            activity.runOnUiThread {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (ContextCompat.checkSelfPermission(
                            activity,
                            Manifest.permission.RECORD_AUDIO
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        ActivityCompat.requestPermissions(
                            activity,
                            arrayOf(Manifest.permission.RECORD_AUDIO),
                            REQUEST_MICROPHONE_PERMISSION
                        )
                    } else {
                        grantMicrophonePermission()
                    }
                } else {
                    grantMicrophonePermission()
                }
            }
        }
        
        private fun grantMicrophonePermission() {
            webView.evaluateJavascript(
                "if (typeof onMicrophonePermissionGranted === 'function') { " +
                "onMicrophonePermissionGranted(); }", null
            )
        }
        
        private fun denyMicrophonePermission() {
            webView.evaluateJavascript(
                "if (typeof onMicrophonePermissionDenied === 'function') { " +
                "onMicrophonePermissionDenied(); }", null
            )
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == REQUEST_MICROPHONE_PERMISSION) {
            if (grantResults.isNotEmpty() && 
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                grantMicrophonePermission()
            } else {
                denyMicrophonePermission()
            }
        }
    }
}
```

## Çalışma Mantığı

1. **Kullanıcı mikrofon butonuna tıklar**
2. **JavaScript** `window.Android.requestMicrophonePermission()` çağrılır
3. **Android** runtime permission kontrolü yapar
4. **İzin yoksa:** Android native izin dialog'u gösterilir
5. **İzin verildiyse:** `onMicrophonePermissionGranted()` JavaScript fonksiyonu çağrılır
6. **İzin reddedildiyse:** `onMicrophonePermissionDenied()` JavaScript fonksiyonu çağrılır
7. **JavaScript** Web Speech API'yi başlatır veya hata mesajı gösterir

## Test Etme

1. Android uygulamanızı derleyin ve çalıştırın
2. WebView içinde mikrofon butonuna tıklayın
3. Android izin dialog'u görünmeli
4. "İzin Ver" seçeneğini seçin
5. Sesli arama çalışmalı

## Notlar

- Android 6.0 (API 23) ve üzeri için runtime permission gereklidir
- Android 6.0 altı için manifest'te izin yeterlidir
- WebView'in JavaScript desteği açık olmalı
- `RECORD_AUDIO` izni manifest'te tanımlı olmalı





