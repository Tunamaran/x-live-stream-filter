// ==UserScript==
// @name         X Canlı Yayın Filtresi
// @namespace    https://github.com/tunamaran/x-live-stream-filter
// @version      2.0.0
// @description  X.com (Twitter) sol menüsüne "Canlı Yayınlar" butonu ekler. Anahtar kelime girerek canlı yayınları ve Spaces odalarını kolayca bulmanızı sağlar.
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

  /** Butonumuzu tanımlayan benzersiz data attribute */
  const BUTTON_ID = 'data-x-live-filter';

  /** Popup'ı tanımlayan benzersiz data attribute */
  const POPUP_ID = 'data-x-live-popup';

  /** MutationObserver throttle süresi (ms) */
  const THROTTLE_MS = 500;

  /** Son kullanılan arama terimi (localStorage key) */
  const STORAGE_KEY = 'x-live-filter-last-search';

  // ─────────────────────────────────────────────
  // Arama URL Oluşturucu
  // ─────────────────────────────────────────────

  /**
   * Kullanıcının girdiği anahtar kelime ile arama URL'si oluşturur.
   * @param {string} keyword - Aranacak kelime (örn: "fenerbahçe")
   * @param {string} tab - Arama sekmesi: 'live' (Güncel) veya 'video' (Videolar)
   * @returns {string} X.com arama URL'si
   */
  const buildSearchURL = (keyword, tab = 'live') => {
    const encodedKeyword = encodeURIComponent(keyword.trim());
    return `/search?q=${encodedKeyword}&src=typed_query&f=${tab}`;
  };

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
  // Arama Popup'ı — X.com Tasarım Diline Uygun
  // ─────────────────────────────────────────────

  /**
   * X.com'un dark/light modunu tespit eder.
   * @returns {'dark' | 'dim' | 'light'}
   */
  const detectTheme = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return 'dark';

    // RGB değerlerini parse et
    const match = bg.match(/\d+/g);
    if (!match) return 'dark';

    const [r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

    if (luminance < 30) return 'dark';       // Karanlık (Lights out)
    if (luminance < 60) return 'dim';        // Karatılmış (Dim)
    return 'light';                           // Açık (Default)
  };

  /**
   * Tema renklerini döndürür.
   */
  const getThemeColors = () => {
    const theme = detectTheme();
    switch (theme) {
      case 'dark':
        return {
          bg: '#000000',
          cardBg: '#16181C',
          border: '#2F3336',
          text: '#E7E9EA',
          textSecondary: '#71767B',
          inputBg: '#202327',
          accent: '#1D9BF0',
          accentHover: '#1A8CD8',
          overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF',
          hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
      case 'dim':
        return {
          bg: '#15202B',
          cardBg: '#1E2732',
          border: '#38444D',
          text: '#F7F9F9',
          textSecondary: '#8B98A5',
          inputBg: '#273340',
          accent: '#1D9BF0',
          accentHover: '#1A8CD8',
          overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF',
          hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
      default: // light
        return {
          bg: '#FFFFFF',
          cardBg: '#FFFFFF',
          border: '#EFF3F4',
          text: '#0F1419',
          textSecondary: '#536471',
          inputBg: '#EFF3F4',
          accent: '#1D9BF0',
          accentHover: '#1A8CD8',
          overlay: 'rgba(0, 0, 0, 0.4)',
          buttonText: '#FFFFFF',
          hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
    }
  };

  /**
   * Arama popup CSS'ini oluşturur ve inject eder.
   */
  const injectPopupStyles = () => {
    if (document.getElementById('x-live-filter-styles')) return;

    const style = document.createElement('style');
    style.id = 'x-live-filter-styles';
    style.textContent = `
      .xlf-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: xlf-fadeIn 0.15s ease-out;
      }

      .xlf-card {
        width: 400px;
        max-width: 90vw;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
        animation: xlf-slideUp 0.2s ease-out;
        position: relative;
      }

      .xlf-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .xlf-title {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 20px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .xlf-close {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: background-color 0.2s;
        background: transparent;
      }

      .xlf-input-wrapper {
        position: relative;
        margin-bottom: 16px;
      }

      .xlf-input {
        width: 100%;
        padding: 12px 16px;
        border-radius: 12px;
        border: 2px solid transparent;
        font-size: 15px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      .xlf-input:focus {
        border-color: #1D9BF0;
      }

      .xlf-input::placeholder {
        opacity: 0.6;
      }

      .xlf-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
      }

      .xlf-tab {
        flex: 1;
        padding: 10px 16px;
        border-radius: 9999px;
        border: 1px solid;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.2s;
        text-align: center;
      }

      .xlf-tab.active {
        border-color: transparent;
      }

      .xlf-search-btn {
        width: 100%;
        padding: 12px;
        border-radius: 9999px;
        border: none;
        font-size: 15px;
        font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .xlf-search-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .xlf-hint {
        text-align: center;
        font-size: 13px;
        margin-top: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .xlf-recent {
        margin-top: 12px;
        padding-top: 12px;
      }

      .xlf-recent-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .xlf-recent-item {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 13px;
        cursor: pointer;
        margin-right: 6px;
        margin-bottom: 6px;
        transition: background-color 0.15s;
        border: 1px solid;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      @keyframes xlf-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes xlf-slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      @keyframes xlf-fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  };

  /**
   * Son aramaları localStorage'dan alır.
   * @returns {string[]}
   */
  const getRecentSearches = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  /**
   * Yeni arama terimini son aramalar listesine ekler.
   * @param {string} term
   */
  const saveRecentSearch = (term) => {
    try {
      let searches = getRecentSearches();
      // Mevcut varsa kaldır ve başa ekle
      searches = searches.filter((s) => s.toLowerCase() !== term.toLowerCase());
      searches.unshift(term);
      // Maksimum 5 arama tut
      searches = searches.slice(0, 5);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    } catch {
      // localStorage erişim hatası — sessizce geç
    }
  };

  /**
   * Arama popup'ını oluşturur ve gösterir.
   */
  const showSearchPopup = () => {
    // Zaten açıksa tekrar açma
    if (document.querySelector(`[${POPUP_ID}]`)) return;

    injectPopupStyles();
    const colors = getThemeColors();
    const recentSearches = getRecentSearches();

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'xlf-overlay';
    overlay.setAttribute(POPUP_ID, 'true');
    overlay.style.backgroundColor = colors.overlay;

    // Card
    const card = document.createElement('div');
    card.className = 'xlf-card';
    card.style.backgroundColor = colors.cardBg;
    card.style.border = `1px solid ${colors.border}`;

    // Header
    const header = document.createElement('div');
    header.className = 'xlf-header';

    const title = document.createElement('div');
    title.className = 'xlf-title';
    title.style.color = colors.text;
    title.innerHTML = `<span style="color: red; font-size: 10px;">🔴</span> Canlı Yayın Ara`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'xlf-close';
    closeBtn.style.color = colors.text;
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = colors.hoverBg;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Input
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'xlf-input-wrapper';

    const input = document.createElement('input');
    input.className = 'xlf-input';
    input.type = 'text';
    input.placeholder = 'Ne arıyorsun? (örn: fenerbahçe, galatasaray, nba...)';
    input.style.backgroundColor = colors.inputBg;
    input.style.color = colors.text;
    // Son aramayı önceden doldur
    if (recentSearches.length > 0) {
      input.value = recentSearches[0];
    }

    inputWrapper.appendChild(input);

    // Sekme seçimi (Güncel / Videolar)
    let selectedTab = 'live';

    const tabs = document.createElement('div');
    tabs.className = 'xlf-tabs';

    const createTab = (label, value, isActive = false) => {
      const tab = document.createElement('button');
      tab.className = `xlf-tab ${isActive ? 'active' : ''}`;
      tab.textContent = label;
      tab.dataset.value = value;

      const updateTabStyle = (active) => {
        if (active) {
          tab.style.backgroundColor = colors.accent;
          tab.style.color = colors.buttonText;
          tab.style.borderColor = 'transparent';
        } else {
          tab.style.backgroundColor = 'transparent';
          tab.style.color = colors.text;
          tab.style.borderColor = colors.border;
        }
      };

      updateTabStyle(isActive);

      tab.addEventListener('click', () => {
        selectedTab = value;
        tabs.querySelectorAll('.xlf-tab').forEach((t) => {
          const isThis = t === tab;
          t.className = `xlf-tab ${isThis ? 'active' : ''}`;
          updateTabStyle(isThis);

          // Diğer tabların stilini de güncelle
          if (!isThis) {
            t.style.backgroundColor = 'transparent';
            t.style.color = colors.text;
            t.style.borderColor = colors.border;
          }
        });
      });

      return tab;
    };

    tabs.appendChild(createTab('📋 Güncel (Latest)', 'live', true));
    tabs.appendChild(createTab('🎥 Videolar', 'video'));

    // Arama butonu
    const searchBtn = document.createElement('button');
    searchBtn.className = 'xlf-search-btn';
    searchBtn.textContent = 'Canlı Yayınları Ara';
    searchBtn.style.backgroundColor = colors.accent;
    searchBtn.style.color = colors.buttonText;
    searchBtn.disabled = input.value.trim().length === 0;

    searchBtn.addEventListener('mouseenter', () => {
      if (!searchBtn.disabled) {
        searchBtn.style.backgroundColor = colors.accentHover;
      }
    });
    searchBtn.addEventListener('mouseleave', () => {
      searchBtn.style.backgroundColor = colors.accent;
    });

    // Input değişikliğinde buton durumunu güncelle
    input.addEventListener('input', () => {
      searchBtn.disabled = input.value.trim().length === 0;
    });

    // Arama fonksiyonu
    const doSearch = () => {
      const keyword = input.value.trim();
      if (!keyword) return;

      saveRecentSearch(keyword);
      closePopup();
      window.location.href = buildSearchURL(keyword, selectedTab);
    };

    // Enter tuşu ile arama
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopup();
      }
    });

    searchBtn.addEventListener('click', doSearch);

    // İpucu
    const hint = document.createElement('div');
    hint.className = 'xlf-hint';
    hint.style.color = colors.textSecondary;
    hint.textContent = 'Enter ile ara • Escape ile kapat';

    // Son aramalar
    let recentSection = null;
    if (recentSearches.length > 0) {
      recentSection = document.createElement('div');
      recentSection.className = 'xlf-recent';
      recentSection.style.borderTop = `1px solid ${colors.border}`;

      const recentTitle = document.createElement('div');
      recentTitle.className = 'xlf-recent-title';
      recentTitle.style.color = colors.textSecondary;
      recentTitle.textContent = 'Son aramalar:';
      recentSection.appendChild(recentTitle);

      recentSearches.forEach((term) => {
        const item = document.createElement('span');
        item.className = 'xlf-recent-item';
        item.textContent = term;
        item.style.color = colors.accent;
        item.style.borderColor = colors.border;
        item.addEventListener('click', () => {
          input.value = term;
          searchBtn.disabled = false;
          input.focus();
        });
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = colors.hoverBg;
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'transparent';
        });
        recentSection.appendChild(item);
      });
    }

    // Popup'ı kapat
    const closePopup = () => {
      overlay.style.animation = 'xlf-fadeOut 0.15s ease-in';
      setTimeout(() => overlay.remove(), 150);
    };

    closeBtn.addEventListener('click', closePopup);

    // Overlay'a tıklayınca kapat (card dışına tıklama)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup();
    });

    // Card'ı birleştir
    card.appendChild(header);
    card.appendChild(inputWrapper);
    card.appendChild(tabs);
    card.appendChild(searchBtn);
    card.appendChild(hint);
    if (recentSection) card.appendChild(recentSection);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Input'a otomatik focus
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
  };

  // ─────────────────────────────────────────────
  // Yardımcı Fonksiyonlar
  // ─────────────────────────────────────────────

  /**
   * Sol gezinme menüsünü (nav) DOM'dan bulur.
   * X.com obfuscated class kullandığı için aria-label ve yapısal seçicilere güveniyoruz.
   */
  const findNavMenu = () => {
    const navElements = document.querySelectorAll('nav[role="navigation"]');

    for (const nav of navElements) {
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
    const clone = referenceLink.cloneNode(true);

    // Benzersiz tanımlayıcı ekle
    clone.setAttribute(BUTTON_ID, 'true');

    // Href'i güncelle — tıklamada popup açılacak
    clone.setAttribute('href', '#');

    // aria-label ekle
    clone.setAttribute('aria-label', 'Canlı Yayınlar');

    // Klonlanmış SVG ikonunu kendi ikonumuzla değiştir
    const existingSvg = clone.querySelector('svg');
    if (existingSvg) {
      const newIcon = getLiveIcon();
      const existingClasses = existingSvg.getAttribute('class');
      if (existingClasses) {
        newIcon.setAttribute('class', existingClasses);
      }
      existingSvg.parentNode.replaceChild(newIcon, existingSvg);
    }

    // Metin içeriğini güncelle
    const spans = clone.querySelectorAll('span');
    let textUpdated = false;

    for (const span of spans) {
      if (span.children.length === 0 && span.textContent.trim().length > 0) {
        span.textContent = 'Canlı Yayınlar';
        textUpdated = true;
        break;
      }
    }

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

    // Aktif sayfa vurgusunu kaldır
    clone.removeAttribute('aria-current');
    const activeIndicators = clone.querySelectorAll('[aria-current]');
    activeIndicators.forEach((el) => el.removeAttribute('aria-current'));

    // Kalın font ağırlığını normale çevir
    const boldSpans = clone.querySelectorAll('span');
    boldSpans.forEach((span) => {
      if (span.style.fontWeight === 'bold' || span.style.fontWeight === '700') {
        span.style.fontWeight = 'normal';
      }
    });

    // Tıklama — popup aç
    clone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSearchPopup();
    });

    return clone;
  };

  // ─────────────────────────────────────────────
  // Ana Enjeksiyon Mantığı
  // ─────────────────────────────────────────────

  /**
   * Sol menüye "Canlı Yayınlar" butonunu enjekte eder.
   */
  const injectLiveButton = () => {
    if (document.querySelector(`[${BUTTON_ID}]`)) {
      return;
    }

    const nav = findNavMenu();
    if (!nav) return;

    const exploreLink = nav.querySelector('a[href="/explore"]') ||
      nav.querySelector('a[href="/search"]');

    const referenceLink = exploreLink || nav.querySelector('a[href]');

    if (!referenceLink) return;

    const liveButton = createLiveButton(referenceLink);

    const parentContainer = referenceLink.parentElement;

    if (parentContainer && parentContainer !== nav) {
      const wrapperClone = parentContainer.cloneNode(false);
      wrapperClone.setAttribute(BUTTON_ID + '-wrapper', 'true');
      wrapperClone.appendChild(liveButton);
      parentContainer.after(wrapperClone);
    } else {
      referenceLink.after(liveButton);
    }

    console.log('[X Canlı Yayın Filtresi] ✅ "Canlı Yayınlar" butonu menüye eklendi.');
  };

  // ─────────────────────────────────────────────
  // MutationObserver — Throttled DOM İzleyici
  // ─────────────────────────────────────────────

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

  const startObserver = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);

    const observer = new MutationObserver(() => {
      if (document.querySelector(`[${BUTTON_ID}]`)) {
        return;
      }
      throttledInject();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return observer;
  };

  // ─────────────────────────────────────────────
  // SPA Navigasyon Dinleyicisi
  // ─────────────────────────────────────────────

  const interceptSPANavigation = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);

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

    window.addEventListener('popstate', () => {
      throttledInject();
    });
  };

  // ─────────────────────────────────────────────
  // Buton Kaybolma Koruması
  // ─────────────────────────────────────────────

  const startHeartbeat = () => {
    setInterval(() => {
      if (!document.querySelector(`[${BUTTON_ID}]`)) {
        injectLiveButton();
      }
    }, 3000);
  };

  // ─────────────────────────────────────────────
  // Klavye Kısayolu
  // ─────────────────────────────────────────────

  /**
   * Alt+L kısayolu ile popup'ı açar.
   */
  const registerKeyboardShortcut = () => {
    document.addEventListener('keydown', (e) => {
      // Alt+L kısayolu
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        showSearchPopup();
      }
    });
  };

  // ─────────────────────────────────────────────
  // Başlatıcı (Entry Point)
  // ─────────────────────────────────────────────

  const init = () => {
    console.log('[X Canlı Yayın Filtresi] 🚀 v2.0.0 başlatılıyor...');

    interceptSPANavigation();
    injectLiveButton();
    startObserver();
    startHeartbeat();
    registerKeyboardShortcut();

    console.log('[X Canlı Yayın Filtresi] ✅ Hazır! Menüden "Canlı Yayınlar" butonunu kullan veya Alt+L kısayoluna bas.');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
