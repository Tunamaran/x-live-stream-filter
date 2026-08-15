# 🔴 X Canlı Yayın Filtresi

**X.com (Twitter) üzerinde canlı yayınları ve Spaces odalarını tek tıkla bulun.**

Bu Tampermonkey userscript'i, X.com'un sol gezinme menüsüne **"Canlı Yayınlar"** butonu ekler. Butona tıkladığınızda X'in kendi arama altyapısını kullanarak tüm aktif canlı yayınları ve Spaces odalarını listeler.

---

## ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| 🎥 **Menü Entegrasyonu** | Sol navigasyon menüsüne doğal görünümlü "Canlı Yayınlar" butonu |
| 🌗 **Dark/Light Mod** | X.com'un tema değişikliklerine otomatik uyum |
| 🔄 **SPA Desteği** | Sayfa yenilenmeden yapılan navigasyonlarda bile çalışır |
| 🛡️ **React Re-render Koruması** | Buton DOM'dan silinse bile otomatik olarak yeniden eklenir |
| 📡 **Otomatik Güncelleme** | GitHub üzerinden tek tıkla güncelleme desteği |

---

## 📦 Kurulum

### Gereksinimler

- Bir modern tarayıcı (Chrome, Firefox, Edge, Safari)
- [Tampermonkey](https://www.tampermonkey.net/) eklentisi yüklü olmalı

### Adım Adım Kurulum

1. **Tampermonkey'i yükleyin** — Tarayıcınızın eklenti mağazasından [Tampermonkey](https://www.tampermonkey.net/) eklentisini indirin.

2. **Script'i yükleyin** — Aşağıdaki bağlantıya tıklayın:

   👉 **[Script'i Yükle](https://raw.githubusercontent.com/tunamaran/x-live-stream-filter/main/x-live-filter.user.js)**

   Tampermonkey otomatik olarak kurulum ekranını açacaktır. **"Install"** (Yükle) butonuna tıklayın.

3. **X.com'u açın** — [x.com](https://x.com) adresine gidin. Sol menüde **"Canlı Yayınlar"** butonunu göreceksiniz! 🎉

### Manuel Kurulum

Eğer doğrudan bağlantı çalışmazsa:

1. Tampermonkey simgesine tıklayın → **"Yeni script oluştur"**
2. Editördeki varsayılan kodu silin
3. [`x-live-filter.user.js`](x-live-filter.user.js) dosyasının içeriğini kopyalayıp yapıştırın
4. `Ctrl+S` ile kaydedin

---

## 🔄 Otomatik Güncelleme

Script, Tampermonkey'in yerleşik güncelleme mekanizmasını kullanır:

- `@updateURL` ve `@downloadURL` meta etiketleri bu repository'nin `main` dalını işaret eder
- Tampermonkey varsayılan olarak günlük güncelleme kontrolü yapar
- **Manuel kontrol:** Tampermonkey → Kontrol Paneli → Script'e tıklayın → "Güncellemeleri kontrol et"

> **Not:** Güncelleme sıklığını ayarlamak için: Tampermonkey → Ayarlar → "Güncellemeleri kontrol et" → İstediğiniz aralığı seçin.

---

## 🛠️ Nasıl Çalışır?

```
┌─────────────────────────────────────────┐
│           Script Başlatma               │
├─────────────────────────────────────────┤
│                                         │
│  1. SPA Navigasyon Dinleyicisi          │
│     └─ pushState / popstate yakalama    │
│                                         │
│  2. İlk Enjeksiyon Denemesi            │
│     └─ Nav menüsünü bul & buton ekle   │
│                                         │
│  3. MutationObserver (Throttled)        │
│     └─ DOM değişikliklerini izle        │
│                                         │
│  4. Heartbeat (3s aralık)              │
│     └─ Buton kaybolursa yeniden ekle    │
│                                         │
└─────────────────────────────────────────┘
```

### Teknik Detaylar

- **Obfuscated CSS'e Bağımlılık Yok:** Element seçimi `aria-label`, `role`, `href` ve HTML yapısı üzerinden yapılır
- **Performans Odaklı:** MutationObserver throttle mekanizmasıyla çalışır (500ms)
- **Klonlama Stratejisi:** Mevcut menü öğeleri klonlanarak stil tutarlılığı sağlanır — X.com tema güncellemelerine otomatik uyum

---

## ❓ Sıkça Sorulan Sorular

<details>
<summary><b>Buton görünmüyor, ne yapmalıyım?</b></summary>

1. Tampermonkey'in etkin olduğundan emin olun
2. Script'in X.com için aktif olduğunu kontrol edin
3. Sayfayı yenileyin (`F5`)
4. Tarayıcı konsolunda (`F12`) hata mesajlarını kontrol edin

</details>

<details>
<summary><b>X.com güncellendikten sonra çalışmayı durdurdu</b></summary>

X.com DOM yapısını zaman zaman değiştirebilir. Bu durumda:
1. Bu repository'de güncellenmiş bir sürüm olup olmadığını kontrol edin
2. Hâlâ düzeltilmediyse bir [Issue](../../issues/new) açın

</details>

<details>
<summary><b>Farklı bir dilde X.com kullanıyorum, çalışır mı?</b></summary>

Evet! Script, dile bağımlı `aria-label` yerine `href` ve DOM yapısı kullanarak element bulur. Tüm dillerde çalışması hedeflenmiştir.

</details>

---

## 🤝 Katkıda Bulunma

Katkılarınızı memnuniyetle karşılıyoruz!

1. Bu repository'yi fork edin
2. Feature branch oluşturun (`git checkout -b feature/harika-ozellik`)
3. Değişikliklerinizi commit edin (`git commit -m 'feat: harika özellik eklendi'`)
4. Branch'i push edin (`git push origin feature/harika-ozellik`)
5. Pull Request açın

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.

---

## ⭐ Beğendiyseniz

Bu script işinize yaradıysa **yıldız ⭐** bırakmayı unutmayın! Bu, projenin daha fazla kişiye ulaşmasına yardımcı olur.

---

<p align="center">
  <sub>X.com üzerinde canlı içerikleri kaçırmayın 🔴</sub>
</p>
