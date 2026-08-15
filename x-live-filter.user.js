// ==UserScript==
// @name         X Canlı Yayın Filtresi
// @namespace    https://github.com/tunamaran/x-live-stream-filter
// @version      1.0.0
// @description  X.com (Twitter) sol menüsüne "Canlı Yayınlar" butonu ekler. filter:live aramasıyla canlı yayınları ve Spaces odalarını kolayca bulmanızı sağlar.
// @author       tunamaran
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://abs.twimg.com/favicons/twitter.3.ico
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/tunamaran/x-live-stream-filter/main/x-live-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/tunamaran/x-live-stream-filter/main/x-live-filter.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  // Sabitler
  // ─────────────────────────────────────────────

  /** Canlı yayın arama URL'si */
  const LIVE_SEARCH_URL = '/search?q=filter%3Alive&src=typed_query&f=live';

  /** Butonumuzu tanımlayan benzersiz data attribute */
  const BUTTON_ID = 'data-x-live-filter';

  /** MutationObserver throttle süresi (ms) */
  const THROTTLE_MS = 500;

  // ─────────────────────────────────────────────
  // SVG İkon — Kamera / Canlı Yayın
  // ─────────────────────────────────────────────

  /**
   * X'in tasarım diline uygun 24×24 SVG ikonu döndürür.
   * currentColor kullanarak dark/light mod'a otomatik uyum sağlar.
   */
  const getLiveIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '26.25');
    svg.setAttribute('height', '26.25');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    // Video kamera ikonu
    svg.innerHTML = `
      <g>
        <path d="M16 6H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-2.5l4 3V9.5l-4 3V8c0-1.1-.9-2-2-2z"/>
        <circle cx="5" cy="9" r="1.5" fill="red" opacity="0.9">
          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" repeatCount="indefinite"/>
        </circle>
      </g>
    `;
    return svg;
  };

  // ─────────────────────────────────────────────
  // Yardımcı Fonksiyonlar
  // ─────────────────────────────────────────────

  /**
   * Sol gezinme menüsünü (nav) DOM'dan bulur.
   * X.com obfuscated class kullandığı için aria-label ve yapısal seçicilere güveniyoruz.
   *
   * Strateji:
   * 1. <nav> etiketini bul (genelde sol menü <nav role="navigation"> içinde)
   * 2. İçindeki ana link grubunu hedefle
   */
  const findNavMenu = () => {
    // X.com sol menüsü bir <nav> element içinde yer alır.
    // "Ana sayfa" (Home) linkini içeren <nav> elementini bul.
    const navElements = document.querySelectorAll('nav[role="navigation"]');

    for (const nav of navElements) {
      // Ana menü bağlantılarından birini (href="/home") içerip içermediğini kontrol et
      const homeLink = nav.querySelector('a[href="/home"]');
      if (homeLink) {
        return nav;
      }
    }

    // Alternatif: aria-label ile dene (dile göre değişebilir)
    const primaryNav = document.querySelector('nav[aria-label="Primary"]') ||
      document.querySelector('nav[aria-label="Ana"]');
    if (primaryNav) return primaryNav;

    return null;
  };

  /**
   * Menüdeki mevcut bir buton/linkin stilini klonlayarak
   * "Canlı Yayınlar" butonumuzu oluşturur.
   */
  const createLiveButton = (referenceLink) => {
    // Mevcut bir menü linkini klonla (tüm iç stilleri ve yapıyı korumak için)
    const clone = referenceLink.cloneNode(true);

    // Benzersiz tanımlayıcı ekle (tekrar eklenmesini önlemek için)
    clone.setAttribute(BUTTON_ID, 'true');

    // Href'i güncelle
    clone.setAttribute('href', LIVE_SEARCH_URL);

    // aria-label ekle
    clone.setAttribute('aria-label', 'Canlı Yayınlar');

    // Klonlanmış SVG ikonunu kendi ikonumuzla değiştir
    const existingSvg = clone.querySelector('svg');
    if (existingSvg) {
      const newIcon = getLiveIcon();
      // Mevcut SVG'nin stil özelliklerini kopyala
      const existingClasses = existingSvg.getAttribute('class');
      if (existingClasses) {
        newIcon.setAttribute('class', existingClasses);
      }
      existingSvg.parentNode.replaceChild(newIcon, existingSvg);
    }

    // Metin içeriğini güncelle
    // X.com menü yapısı: <a> > <div> > ... > <span> (metin)
    const spans = clone.querySelectorAll('span');
    let textUpdated = false;

    for (const span of spans) {
      // Sadece doğrudan metin içeren span'ları güncelle (ikon span'ları hariç)
      if (span.children.length === 0 && span.textContent.trim().length > 0) {
        span.textContent = 'Canlı Yayınlar';
        textUpdated = true;
        break;
      }
    }

    // Eğer span bulunamadıysa, tüm text node'ları tara
    if (!textUpdated) {
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim().length > 0) {
          node.textContent = 'Canlı Yayınlar';
          break;
        }
      }
    }

    // Aktif sayfa vurgusunu kaldır (aria-current vb.)
    clone.removeAttribute('aria-current');
    const activeIndicators = clone.querySelectorAll('[aria-current]');
    activeIndicators.forEach((el) => el.removeAttribute('aria-current'));

    // Kalın font ağırlığını normale çevir (aktif olmayan menü görünümü)
    const boldSpans = clone.querySelectorAll('span');
    boldSpans.forEach((span) => {
      if (span.style.fontWeight === 'bold' || span.style.fontWeight === '700') {
        span.style.fontWeight = 'normal';
      }
    });

    // Tıklama davranışı — SPA navigasyonunu tetikle
    clone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // X.com SPA yönlendirmesi: history.pushState ile URL değiştir
      // ve ardından popstate event'i tetikleyerek React router'ı haberdar et
      window.history.pushState({}, '', LIVE_SEARCH_URL);
      window.dispatchEvent(new PopStateEvent('popstate'));

      // Bazı SPA'lar popstate yerine hashchange veya custom event dinler
      // Güvenlik için location.assign ile de dene
      setTimeout(() => {
        // Eğer sayfa değişmediyse hard navigation yap
        if (!window.location.pathname.startsWith('/search')) {
          window.location.href = LIVE_SEARCH_URL;
        }
      }, 300);
    });

    return clone;
  };

  // ─────────────────────────────────────────────
  // Ana Enjeksiyon Mantığı
  // ─────────────────────────────────────────────

  /**
   * Sol menüye "Canlı Yayınlar" butonunu enjekte eder.
   * Zaten eklenmişse tekrar eklemez.
   */
  const injectLiveButton = () => {
    // Zaten eklenmişse çık
    if (document.querySelector(`[${BUTTON_ID}]`)) {
      return;
    }

    const nav = findNavMenu();
    if (!nav) return;

    // Menüdeki ilk bağlantı elementini referans olarak al
    // "Keşfet" (Explore) veya "Arama" linkini tercih et — konumsal olarak uygun
    const exploreLink = nav.querySelector('a[href="/explore"]') ||
      nav.querySelector('a[href="/search"]');

    // Herhangi bir menü linki bulunamazsa ilk <a> etiketini kullan
    const referenceLink = exploreLink || nav.querySelector('a[href]');

    if (!referenceLink) return;

    // Butonu oluştur
    const liveButton = createLiveButton(referenceLink);

    // Referans linkin hemen altına ekle
    // Menü yapısı: her link genelde bir üst <div> veya doğrudan <nav> altında
    const parentContainer = referenceLink.parentElement;

    if (parentContainer && parentContainer !== nav) {
      // Link bir wrapper div içindeyse, wrapper'ı klonlayıp altına ekle
      const wrapperClone = parentContainer.cloneNode(false);
      wrapperClone.setAttribute(BUTTON_ID + '-wrapper', 'true');
      wrapperClone.appendChild(liveButton);
      parentContainer.after(wrapperClone);
    } else {
      // Doğrudan nav altındaysa linkin yanına ekle
      referenceLink.after(liveButton);
    }

    console.log('[X Canlı Yayın Filtresi] ✅ "Canlı Yayınlar" butonu menüye eklendi.');
  };

  // ─────────────────────────────────────────────
  // MutationObserver — Throttled DOM İzleyici
  // ─────────────────────────────────────────────

  /**
   * Throttle fonksiyonu — aşırı DOM mutation'larında performans kaybını önler.
   */
  const throttle = (fn, delay) => {
    let lastCall = 0;
    let timeoutId = null;

    return (...args) => {
      const now = Date.now();
      const remaining = delay - (now - lastCall);

      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        lastCall = now;
        fn(...args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          fn(...args);
        }, remaining);
      }
    };
  };

  /**
   * DOM değişikliklerini izleyen MutationObserver'ı başlatır.
   * X.com React SPA olduğu için menü gecikmeli yüklenebilir.
   */
  const startObserver = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);

    const observer = new MutationObserver((mutations) => {
      // Buton zaten eklenmişse gereksiz işlem yapma
      if (document.querySelector(`[${BUTTON_ID}]`)) {
        return;
      }
      throttledInject();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('[X Canlı Yayın Filtresi] 👁️ MutationObserver başlatıldı.');

    return observer;
  };

  // ─────────────────────────────────────────────
  // SPA Navigasyon Dinleyicisi
  // ─────────────────────────────────────────────

  /**
   * X.com SPA navigasyonlarını yakalar.
   * pushState ve replaceState monkey-patch ile dinlenir.
   */
  const interceptSPANavigation = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);

    // history.pushState ve replaceState'i sar (wrap)
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      originalPushState(...args);
      throttledInject();
    };

    history.replaceState = (...args) => {
      originalReplaceState(...args);
      throttledInject();
    };

    // popstate event'ini dinle (geri/ileri butonları)
    window.addEventListener('popstate', () => {
      throttledInject();
    });

    console.log('[X Canlı Yayın Filtresi] 🔄 SPA navigasyon dinleyicisi aktif.');
  };

  // ─────────────────────────────────────────────
  // Buton Kaybolma Koruması
  // ─────────────────────────────────────────────

  /**
   * X.com React re-render'larında butonumuz DOM'dan silinebilir.
   * Bu fonksiyon periyodik olarak butonun varlığını kontrol eder.
   */
  const startHeartbeat = () => {
    setInterval(() => {
      if (!document.querySelector(`[${BUTTON_ID}]`)) {
        injectLiveButton();
      }
    }, 3000);

    console.log('[X Canlı Yayın Filtresi] 💓 Heartbeat kontrolü başlatıldı (3s aralık).');
  };

  // ─────────────────────────────────────────────
  // Başlatıcı (Entry Point)
  // ─────────────────────────────────────────────

  const init = () => {
    console.log('[X Canlı Yayın Filtresi] 🚀 Script başlatılıyor...');

    // 1) SPA navigasyon yakalayıcısını kur
    interceptSPANavigation();

    // 2) İlk enjeksiyonu dene
    injectLiveButton();

    // 3) DOM izleyicisini başlat (menü henüz yüklenmediyse yakalayacak)
    startObserver();

    // 4) Heartbeat — React re-render koruması
    startHeartbeat();
  };

  // DOM hazır olduğunda başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
