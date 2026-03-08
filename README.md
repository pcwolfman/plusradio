# Plus Radio 📻

Modern ve kullanıcı dostu radyo dinleme uygulaması. Özellikle yatay ekran (landscape) ve araba kullanımı için optimize edilmiştir.

## ✨ Özellikler

- 🎵 **Binlerce Radyo Kanalı** - M3U playlist desteği ile yüzlerce radyo istasyonu
- 🎨 **Modern Arayüz** - Koyu tema, gradyan efektler ve animasyonlar
- 🔍 **Gelişmiş Arama** - Kanalları isim veya kategoriye göre arayın
- 📱 **Yatay Ekran Optimize** - Araba için ideal landscape tasarım
- 🎛️ **Kolay Kontrol** - Büyük, dokunmatik dostu kontrol butonları
- 🔊 **Ses Kontrolü** - Kolay ses ayarlama ve sessize alma
- 📂 **Kategori Desteği** - Kanalları kategorilere göre filtreleyin

## 🚀 Kurulum

1. Projeyi klonlayın veya indirin:
```bash
git clone https://github.com/[username]/PlusRadio.git
cd PlusRadio
```

2. M3U dosyasını proje klasörüne ekleyin (`Radyo.m3u`)

3. Uygulamayı açın:
   - **Yerel sunucu ile:** (Önerilen)
     ```bash
     # Python ile
     python -m http.server 8000
     
     # veya Node.js ile
     npx http-server -p 8000
     ```
     Sonra tarayıcınızda `http://localhost:8000` adresine gidin.
   
   - **Doğrudan:** `index.html` dosyasını tarayıcıda açın (bazı özellikler çalışmayabilir)

## 📁 Dosya Yapısı

```
PlusRadio/
├── index.html          # Ana HTML dosyası
├── styles.css          # Stil dosyası
├── app.js              # Ana uygulama mantığı
├── m3u-parser.js       # M3U playlist parser
├── Radyo.m3u          # Radyo kanalları playlist dosyası
└── README.md          # Bu dosya
```

## 🎮 Kullanım

1. **Kanal Seçimi:** Sol panelden bir kategori seçin veya tüm kanallara göz atın
2. **Oynatma:** Bir kanala tıklayarak seçin ve play butonuna basın
3. **Arama:** Üst menüdeki arama kutusunu kullanarak kanalları arayın
4. **Ses Kontrolü:** Sağ alttaki ses çubuğu ile ses seviyesini ayarlayın

## ⌨️ Klavye Kısayolları

- **Space:** Oynat/Duraklat

## 🎨 Özelleştirme

Renkler ve stiller `styles.css` dosyasındaki CSS değişkenleri ile özelleştirilebilir:

```css
:root {
    --primary-color: #6366f1;
    --secondary-color: #8b5cf6;
    --background: #0f172a;
    /* ... */
}
```

## 🌐 Tarayıcı Desteği

- ✅ Chrome/Edge (Önerilen)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## 📝 Notlar

- İlk oynatma için kullanıcı etkileşimi gerekebilir (tarayıcı politikaları)
- Bazı radyo istasyonları CORS kısıtlamaları nedeniyle çalışmayabilir
- En iyi deneyim için yatay ekran (landscape) modunda kullanın

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz! Lütfen pull request gönderin.

<a href="https://www.buymeacoffee.com/pcwolfman" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>


## 📄 Lisans

Bu proje açık kaynaklıdır ve özgürce kullanılabilir.

---

**Plus Radio** - Modern radyo deneyimi 🎵





























