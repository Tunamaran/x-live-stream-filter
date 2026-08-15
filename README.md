# 🔴 X Canlı Yayın Filtresi (X Live Stream Filter)

**X.com (Twitter) üzerinde canlı yayınları, Spaces odalarını ve maç yayınlarını tek tıkla bulun.**

Bu Tampermonkey userscript'i, X.com'un sol menüsüne **"Canlı Yayınlar"** butonu ekler. Akıllı puanlama motoru, hazır kategori filtreleri, otomatik yenileme ve anlık masaüstü bildirimleriyle SADECE gerçek canlı yayınları önünüze getirir.

---

## ✨ v3.0.0 Özellikleri

| Özellik | Açıklama |
|---------|----------|
| 🎥 **Menü Entegrasyonu** | Sol navigasyon menüsüne doğal görünümlü "Canlı Yayınlar" butonu |
| 🎯 **Akıllı Puanlama Filtresi** | Video/Spaces varlığı, kırmızı canlı rozetleri ve izleyici sayılarını analiz eden filtreleme |
| ⚽ **Hızlı Kategoriler** | Futbol, Basketbol/NBA, Gaming, Gündem, Müzik ve Spaces için tek tıkla arama |
| ⏱️ **Otomatik Yenileme** | 30s / 60s / 120s aralıklarla yeni yayınları arka planda otomatik arama |
| 🔔 **Masaüstü & Sesli Bildirimler** | Yeni canlı yayın başladığında tarayıcı bildirimi ve hoş melodik ses (Chime) |
| 🌟 **Zengin Canlı Kartlar** | Doğrulanan canlı yayın tweet'lerine neon kırmızı kenarlık ve puan etiketi |
| ⚙️ **Dahili Ayarlar Paneli** | Filtre hassasiyeti, otomatik yenileme ve bildirimleri doğrudan popup'tan yönetme |
| 🔢 **Canlı Sayaç Badge'i** | Sağ altta kaç adet canlı yayın bulunduğunu gösteren dinamik rozet |
| 🌗 **Dark / Dim / Light Mod** | X.com'un 3 renk moduna tam uyum |
| ⌨️ **Klavye Kısayolu** | `Alt + L` ile popup'ı her yerden anında açma |

---

## 🚀 Kurulum

### Gereksinimler

- Modern bir tarayıcı (Chrome, Firefox, Edge, Brave, Opera, Safari)
- [Tampermonkey](https://www.tampermonkey.net/) eklentisi yüklü olmalı

### Adım Adım Kurulum

1. **Tampermonkey'i Yükleyin** — Tarayıcınızın eklenti mağazasından [Tampermonkey](https://www.tampermonkey.net/)'i kurun.
2. **Script'i Yükleyin** — Aşağıdaki doğrudan yükleme bağlantısına tıklayın:

   👉 **[Script'i Yükle / Güncelle (v3.0.0)](https://raw.githubusercontent.com/tunamaran/x-live-stream-filter/main/x-live-filter.user.js)**

   Tampermonkey ekranında **"Install" (Yükle)** butonuna tıklayın.

3. **X.com'u Açın** — [x.com](https://x.com) adresine gidin. Sol menüdeki **"Canlı Yayınlar"** butonunu veya `Alt+L` kısayolunu kullanın! 🎉

---

## 🎬 Nasıl Kullanılır?

1. Sol menüdeki **"Canlı Yayınlar"** butonuna tıklayın veya klavyeden `Alt + L` tuşlarına basın.
2. Açılan pencerede:
   - İster aramak istediğiniz kelimeleri yazın (örn: `fenerbahçe`, `galatasaray, beşiktaş`, `nba`).
   - İsterseniz hazır kategori butonlarından birini seçin (⚽ Futbol, 🎮 Gaming vb.).
3. **"Canlı Yayınları Filtrele & Ara"** butonuna basın.
4. X.com akışında sadece canlı yayınlar listelenir.
5. Yeni bir yayın başladığında script size masaüstü bildirimi gönderir ve melodik bir ses çalar!

---

## ⚙️ Ayarlar

Arama popup'ındaki **"⚙️ Ayarlar & Filtre"** sekmesinden veya sağ alttaki canlı sayacına tıklayarak:

- **Filtre Hassasiyeti:** Düşük, Orta (Önerilen), Yüksek
- **Otomatik Yenileme:** Kapalı, 30s, 60s, 120s
- **Masaüstü Bildirimleri:** Açık / Kapalı
- **Sesli Bildirim (Chime):** Açık / Kapalı
- **Canlı Kart Vurgusu:** Açık / Kapalı

özelliklerini istediğiniz gibi özelleştirebilirsiniz.

---

## ⌨️ Klavye Kısayolları

| Kısayol | İşlev |
|---------|-------|
| `Alt + L` | Canlı Yayın Arama & Ayarlar Penceresini Aç |
| `Enter` | Aramayı Başlat |
| `Escape` | Pencereyi Kapat |

---

## 🔄 Otomatik Güncelleme

Script `@updateURL` ve `@downloadURL` meta etiketlerini içerir. GitHub üzerinden yeni bir sürüm yayınlandığında Tampermonkey scriptinizi otomatik olarak günceller.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.
