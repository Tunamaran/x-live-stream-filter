// ==UserScript==
// @name         X Canlı Yayın Filtresi
// @namespace    https://github.com/tunamaran/x-live-stream-filter
// @version      2.1.0
// @description  X.com (Twitter) sol menüsüne "Canlı Yayınlar" butonu ekler. Anahtar kelime girerek SADECE canlı yayın içeren tweetleri bulmanızı sağlar.
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

  /** Filtrelenmiş tweet işaretleyicisi */
  const FILTERED_ATTR = 'data-xlf-checked';

  /** MutationObserver throttle süresi (ms) */
  const THROTTLE_MS = 500;

  /** Son kullanılan arama terimi (localStorage key) */
  const STORAGE_KEY = 'x-live-filter-last-search';

  /** Canlı yayın anahtar kelimeleri — arama sorgusuna eklenir */
  const LIVE_KEYWORDS = '(CANLI OR LIVE OR "canl\u0131 yay\u0131n" OR "live stream" OR "live now")';

  /**
   * DOM'da canlı yayın göstergesi olarak aranan kelimeler.
   * Tweet text, badge ve alt-text içinde aranır.
   */
  const LIVE_INDICATORS = [
    'LIVE',           // İngilizce canlı badge
    'CANLI',          // Türkçe canlı badge
    'Canl\u0131',          // Türkçe başlık
    'canl\u0131 yay\u0131n',    // Türkçe açıklama
    'live stream',    // İngilizce açıklama
    'live now',       // İngilizce badge
    'viewers',        // İzleyici sayısı göstergesi
    'watching',       // İzleniyor göstergesi
    'izleyici',       // Türkçe izleyici
    'izleniyor',      // Türkçe izleniyor
  ];

  // ─────────────────────────────────────────────
  // Arama URL Oluşturucu
  // ─────────────────────────────────────────────

  /**
   * Kullanıcının girdiği anahtar kelime ile canlı yayın arama URL'si oluşturur.
   * Sorguya otomatik olarak canlı yayın anahtar kelimeleri eklenir.
   *
   * Örnek: "fenerbahçe" → "fenerbahçe (CANLI OR LIVE OR ...)"
   *
   * @param {string} keyword - Aranacak kelime (örn: "fenerbahçe")
   * @param {string} tab - Arama sekmesi: 'live' (Güncel) veya 'video' (Videolar)
   * @returns {string} X.com arama URL'si
   */
  const buildSearchURL = (keyword, tab = 'live') => {
    const query = `${keyword.trim()} ${LIVE_KEYWORDS}`;
    const encodedQuery = encodeURIComponent(query);
    return `/search?q=${encodedQuery}&src=typed_query&f=${tab}`;
  };

  // ─────────────────────────────────────────────
  // SVG İkon — Kamera / Canlı Yayın
  // ─────────────────────────────────────────────

  const getLiveIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '26.25');
    svg.setAttribute('height', '26.25');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
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
  // DOM Post-Filtresi — Canlı Olmayan Tweetleri Gizle
  // ─────────────────────────────────────────────

  /**
   * Bir tweet elementinin canlı yayın içerip içermediğini kontrol eder.
   *
   * Kontrol edilen alanlar:
   * 1. Tweet metin içeriği (CANLI, LIVE vb.)
   * 2. Video/medya badge'leri
   * 3. Alt text ve aria-label'lar
   *
   * @param {HTMLElement} tweetEl - article[data-testid="tweet"] elementi
   * @returns {boolean} Canlı yayın göstergesi bulunduysa true
   */
  const tweetHasLiveIndicator = (tweetEl) => {
    // Tweet'in tüm metin içeriğini al
    const fullText = tweetEl.textContent || '';

    // Canlı yayın göstergelerinden herhangi biri var mı kontrol et
    for (const indicator of LIVE_INDICATORS) {
      if (fullText.includes(indicator)) {
        return true;
      }
    }

    // Ek kontrol: Video player içinde kırmızı "LIVE" badge'i ara
    // X.com canlı yayınlarda kırmızı arka planlı "LIVE" veya "CANLI" badge'i gösterir
    const allElements = tweetEl.querySelectorAll('*');
    for (const el of allElements) {
      const bg = el.style?.backgroundColor || '';
      const computedBg = getComputedStyle(el).backgroundColor || '';

      // Kırmızı arka plan kontrolü (live badge genelde kırmızıdır)
      const isRedBg = bg.includes('red') || bg.includes('rgb(234') ||
        computedBg.includes('rgb(234') || computedBg.includes('rgb(244');

      if (isRedBg) {
        const text = (el.textContent || '').trim().toUpperCase();
        if (text === 'LIVE' || text === 'CANLI') {
          return true;
        }
      }
    }

    return false;
  };

  /**
   * Scriptimizin tetiklediği bir arama sayfasında olup olmadığımızı kontrol eder.
   * URL'de canlı yayın anahtar kelimeleri varsa bizim aramamz demektir.
   */
  const isOurSearchPage = () => {
    const url = window.location.href;
    return url.includes('/search') && (
      url.includes('CANLI') || url.includes('LIVE') ||
      url.includes('canl%C4%B1') || url.includes('live')
    );
  };

  /**
   * Arama sonuçlarındaki tweetleri tarar ve canlı yayın içermeyenleri gizler.
   * Her tweet sadece bir kere kontrol edilir (FILTERED_ATTR ile işaretlenir).
   */
  const filterTimelineTweets = () => {
    if (!isOurSearchPage()) return;

    // Tüm tweet article elementlerini bul
    const tweets = document.querySelectorAll(`article[data-testid="tweet"]:not([${FILTERED_ATTR}])`);

    tweets.forEach((tweet) => {
      // İşaretle — tekrar kontrol edilmesini önle
      tweet.setAttribute(FILTERED_ATTR, 'true');

      if (!tweetHasLiveIndicator(tweet)) {
        // Canlı yayın göstergesi yok — tweeti gizle
        // Tweeti içeren en yakın timeline-item container'ını bul
        const cellInner = tweet.closest('[data-testid="cellInnerDiv"]');
        const target = cellInner || tweet;

        target.style.display = 'none';
      }
    });
  };

  /**
   * Arama sonuçları sayfasında DOM post-filtresini başlatır.
   * Timeline'a eklenen yeni tweetleri de filtreler (sonsuz kaydırma desteği).
   */
  let timelineObserver = null;

  const startTimelineFilter = () => {
    // Önceki observer varsa temizle
    if (timelineObserver) {
      timelineObserver.disconnect();
      timelineObserver = null;
    }

    if (!isOurSearchPage()) return;

    // İlk filtreleme
    filterTimelineTweets();

    // Yeni tweetler yüklendigğinde filtrele (sonsuz kaydırma)
    const throttledFilter = throttle(filterTimelineTweets, 300);

    timelineObserver = new MutationObserver(() => {
      throttledFilter();
    });

    // Timeline container'ını bul ve izle
    const timeline = document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('main') ||
      document.body;

    timelineObserver.observe(timeline, {
      childList: true,
      subtree: true,
    });

    console.log('[X Canlı Yayın Filtresi] 🔍 DOM post-filtresi aktif — canlı olmayan tweetler gizleniyor.');
  };

  // ─────────────────────────────────────────────
  // Arama Popup'ı — X.com Tasarım Diline Uygun
  // ─────────────────────────────────────────────

  const detectTheme = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return 'dark';
    const match = bg.match(/\d+/g);
    if (!match) return 'dark';
    const [r, g, b] = match.map(Number);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    if (luminance < 30) return 'dark';
    if (luminance < 60) return 'dim';
    return 'light';
  };

  const getThemeColors = () => {
    const theme = detectTheme();
    switch (theme) {
      case 'dark':
        return {
          bg: '#000000', cardBg: '#16181C', border: '#2F3336', text: '#E7E9EA',
          textSecondary: '#71767B', inputBg: '#202327', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
      case 'dim':
        return {
          bg: '#15202B', cardBg: '#1E2732', border: '#38444D', text: '#F7F9F9',
          textSecondary: '#8B98A5', inputBg: '#273340', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
      default:
        return {
          bg: '#FFFFFF', cardBg: '#FFFFFF', border: '#EFF3F4', text: '#0F1419',
          textSecondary: '#536471', inputBg: '#EFF3F4', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(0, 0, 0, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(29, 155, 240, 0.1)',
        };
    }
  };

  const injectPopupStyles = () => {
    if (document.getElementById('x-live-filter-styles')) return;
    const style = document.createElement('style');
    style.id = 'x-live-filter-styles';
    style.textContent = `
      .xlf-overlay {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        z-index: 10000; display: flex; align-items: center; justify-content: center;
        animation: xlf-fadeIn 0.15s ease-out;
      }
      .xlf-card {
        width: 420px; max-width: 90vw; border-radius: 16px; padding: 24px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.3); animation: xlf-slideUp 0.2s ease-out;
      }
      .xlf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
      .xlf-title {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;
      }
      .xlf-close {
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
        transition: background-color 0.2s; background: transparent;
      }
      .xlf-input {
        width: 100%; padding: 12px 16px; border-radius: 12px; border: 2px solid transparent;
        font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        outline: none; transition: border-color 0.2s; box-sizing: border-box; margin-bottom: 16px;
      }
      .xlf-input:focus { border-color: #1D9BF0; }
      .xlf-input::placeholder { opacity: 0.6; }
      .xlf-info {
        padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.4; display: flex; align-items: flex-start; gap: 8px;
      }
      .xlf-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
      .xlf-tab {
        flex: 1; padding: 10px 16px; border-radius: 9999px; border: 1px solid;
        cursor: pointer; font-size: 14px; font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.2s; text-align: center;
      }
      .xlf-search-btn {
        width: 100%; padding: 12px; border-radius: 9999px; border: none;
        font-size: 15px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer; transition: background-color 0.2s;
      }
      .xlf-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .xlf-hint {
        text-align: center; font-size: 13px; margin-top: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-recent { margin-top: 12px; padding-top: 12px; }
      .xlf-recent-title {
        font-size: 13px; font-weight: 600; margin-bottom: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-recent-item {
        display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 13px;
        cursor: pointer; margin-right: 6px; margin-bottom: 6px;
        transition: background-color 0.15s; border: 1px solid;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-filter-badge {
        position: fixed; bottom: 20px; right: 20px; padding: 10px 18px; border-radius: 9999px;
        font-size: 13px; font-weight: 600; z-index: 9999; display: flex; align-items: center;
        gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: xlf-slideUp 0.3s ease-out; transition: opacity 0.2s;
      }
      .xlf-filter-badge:hover { opacity: 0.85; }
      @keyframes xlf-fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes xlf-slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes xlf-fadeOut { from { opacity: 1; } to { opacity: 0; } }
    `;
    document.head.appendChild(style);
  };

  const getRecentSearches = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  };

  const saveRecentSearch = (term) => {
    try {
      let searches = getRecentSearches();
      searches = searches.filter((s) => s.toLowerCase() !== term.toLowerCase());
      searches.unshift(term);
      searches = searches.slice(0, 5);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    } catch { /* sessizce geç */ }
  };

  /**
   * Filtre aktif göstergesi badge'ini gösterir.
   */
  const showFilterBadge = () => {
    if (document.querySelector('.xlf-filter-badge')) return;

    injectPopupStyles();
    const colors = getThemeColors();

    const badge = document.createElement('div');
    badge.className = 'xlf-filter-badge';
    badge.style.backgroundColor = '#E0245E';
    badge.style.color = '#FFFFFF';
    badge.innerHTML = '🔴 Canlı Filtresi Aktif';
    badge.title = 'Canlı yayın filtresi çalışıyor — sadece canlı yayınlar gösteriliyor';

    badge.addEventListener('click', () => {
      // Badge'e tıklayınca filtreyi kaldır — gizlenen tweetleri göster
      document.querySelectorAll(`[${FILTERED_ATTR}]`).forEach((el) => {
        const cellInner = el.closest('[data-testid="cellInnerDiv"]');
        const target = cellInner || el;
        target.style.display = '';
        el.removeAttribute(FILTERED_ATTR);
      });
      badge.remove();
      if (timelineObserver) {
        timelineObserver.disconnect();
        timelineObserver = null;
      }
    });

    document.body.appendChild(badge);
  };

  /**
   * Arama popup'ını oluşturur ve gösterir.
   */
  const showSearchPopup = () => {
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
    title.innerHTML = '<span style="color: red; font-size: 10px;">🔴</span> Canlı Yayın Ara';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'xlf-close';
    closeBtn.style.color = colors.text;
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.backgroundColor = colors.hoverBg; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.backgroundColor = 'transparent'; });
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Input
    const input = document.createElement('input');
    input.className = 'xlf-input';
    input.type = 'text';
    input.placeholder = 'Ne arıyorsun? (örn: fenerbahçe, nba, galatasaray...)';
    input.style.backgroundColor = colors.inputBg;
    input.style.color = colors.text;
    if (recentSearches.length > 0) input.value = recentSearches[0];

    // Bilgi kutusu — filtreleme açıklaması
    const info = document.createElement('div');
    info.className = 'xlf-info';
    info.style.backgroundColor = colors.inputBg;
    info.style.color = colors.textSecondary;
    info.innerHTML = `
      <span style="font-size: 16px; flex-shrink: 0;">🛡️</span>
      <span>
        <strong style="color: ${colors.text}">Akıllı Filtre:</strong>
        Arama sorgusuna otomatik olarak canlı yayın anahtar kelimeleri eklenir.
        Sonuçlarda sadece <strong style="color: #E0245E">CANLI</strong> /
        <strong style="color: #E0245E">LIVE</strong> içerikler gösterilir.
      </span>
    `;

    // Sekme seçimi
    let selectedTab = 'live';
    const tabs = document.createElement('div');
    tabs.className = 'xlf-tabs';

    const createTab = (label, value, isActive = false) => {
      const tab = document.createElement('button');
      tab.className = `xlf-tab ${isActive ? 'active' : ''}`;
      tab.textContent = label;

      const updateStyle = (active) => {
        tab.style.backgroundColor = active ? colors.accent : 'transparent';
        tab.style.color = active ? colors.buttonText : colors.text;
        tab.style.borderColor = active ? 'transparent' : colors.border;
      };
      updateStyle(isActive);

      tab.addEventListener('click', () => {
        selectedTab = value;
        tabs.querySelectorAll('.xlf-tab').forEach((t) => {
          const isThis = t === tab;
          t.className = `xlf-tab ${isThis ? 'active' : ''}`;
          if (isThis) updateStyle(true);
          else {
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
      if (!searchBtn.disabled) searchBtn.style.backgroundColor = colors.accentHover;
    });
    searchBtn.addEventListener('mouseleave', () => {
      searchBtn.style.backgroundColor = colors.accent;
    });

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

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
      if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
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
        item.addEventListener('click', () => { input.value = term; searchBtn.disabled = false; input.focus(); });
        item.addEventListener('mouseenter', () => { item.style.backgroundColor = colors.hoverBg; });
        item.addEventListener('mouseleave', () => { item.style.backgroundColor = 'transparent'; });
        recentSection.appendChild(item);
      });
    }

    const closePopup = () => {
      overlay.style.animation = 'xlf-fadeOut 0.15s ease-in';
      setTimeout(() => overlay.remove(), 150);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    // Birleştir
    card.appendChild(header);
    card.appendChild(input);
    card.appendChild(info);
    card.appendChild(tabs);
    card.appendChild(searchBtn);
    card.appendChild(hint);
    if (recentSection) card.appendChild(recentSection);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => { input.focus(); input.select(); }, 100);
  };

  // ─────────────────────────────────────────────
  // Menü Butonu ve Enjeksiyon
  // ─────────────────────────────────────────────

  const findNavMenu = () => {
    const navElements = document.querySelectorAll('nav[role="navigation"]');
    for (const nav of navElements) {
      if (nav.querySelector('a[href="/home"]')) return nav;
    }
    return document.querySelector('nav[aria-label="Primary"]') ||
      document.querySelector('nav[aria-label="Ana"]') || null;
  };

  const createLiveButton = (referenceLink) => {
    const clone = referenceLink.cloneNode(true);
    clone.setAttribute(BUTTON_ID, 'true');
    clone.setAttribute('href', '#');
    clone.setAttribute('aria-label', 'Canlı Yayınlar');

    // SVG ikon değiştir
    const existingSvg = clone.querySelector('svg');
    if (existingSvg) {
      const newIcon = getLiveIcon();
      const cls = existingSvg.getAttribute('class');
      if (cls) newIcon.setAttribute('class', cls);
      existingSvg.parentNode.replaceChild(newIcon, existingSvg);
    }

    // Metin güncelle
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
        if (node.textContent.trim().length > 0) { node.textContent = 'Canlı Yayınlar'; break; }
      }
    }

    // Aktif vurguyu kaldır
    clone.removeAttribute('aria-current');
    clone.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current'));
    clone.querySelectorAll('span').forEach((span) => {
      if (span.style.fontWeight === 'bold' || span.style.fontWeight === '700') {
        span.style.fontWeight = 'normal';
      }
    });

    // Tıklama → popup
    clone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSearchPopup();
    });

    return clone;
  };

  const injectLiveButton = () => {
    if (document.querySelector(`[${BUTTON_ID}]`)) return;
    const nav = findNavMenu();
    if (!nav) return;

    const exploreLink = nav.querySelector('a[href="/explore"]') || nav.querySelector('a[href="/search"]');
    const referenceLink = exploreLink || nav.querySelector('a[href]');
    if (!referenceLink) return;

    const liveButton = createLiveButton(referenceLink);
    const parentContainer = referenceLink.parentElement;

    if (parentContainer && parentContainer !== nav) {
      const wrapper = parentContainer.cloneNode(false);
      wrapper.setAttribute(BUTTON_ID + '-wrapper', 'true');
      wrapper.appendChild(liveButton);
      parentContainer.after(wrapper);
    } else {
      referenceLink.after(liveButton);
    }

    console.log('[X Canlı Yayın Filtresi] ✅ "Canlı Yayınlar" butonu menüye eklendi.');
  };

  // ─────────────────────────────────────────────
  // Yardımcı — Throttle, Observer, Heartbeat
  // ─────────────────────────────────────────────

  const throttle = (fn, delay) => {
    let lastCall = 0;
    let timeoutId = null;
    return (...args) => {
      const now = Date.now();
      const remaining = delay - (now - lastCall);
      if (remaining <= 0) {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        lastCall = now;
        fn(...args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now(); timeoutId = null; fn(...args);
        }, remaining);
      }
    };
  };

  const startObserver = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);
    const observer = new MutationObserver(() => {
      if (!document.querySelector(`[${BUTTON_ID}]`)) throttledInject();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  };

  const interceptSPANavigation = () => {
    const throttledInject = throttle(injectLiveButton, THROTTLE_MS);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);

    history.pushState = (...args) => { origPush(...args); throttledInject(); checkAndStartFilter(); };
    history.replaceState = (...args) => { origReplace(...args); throttledInject(); checkAndStartFilter(); };
    window.addEventListener('popstate', () => { throttledInject(); checkAndStartFilter(); });
  };

  const startHeartbeat = () => {
    setInterval(() => {
      if (!document.querySelector(`[${BUTTON_ID}]`)) injectLiveButton();
    }, 3000);
  };

  // ─────────────────────────────────────────────
  // Arama Sayfası Algılama ve Post-Filtre Başlatma
  // ─────────────────────────────────────────────

  /**
   * URL değişikliğinde, eğer bizim arama sayfamızdaysak DOM filtresini başlat.
   */
  const checkAndStartFilter = () => {
    if (isOurSearchPage()) {
      // Sayfa DOM'u yüklendikten sonra filtreyi başlat
      setTimeout(() => {
        startTimelineFilter();
        showFilterBadge();
      }, 1500);
    } else {
      // Arama sayfasından çıkıldıysa badge'i kaldır
      const badge = document.querySelector('.xlf-filter-badge');
      if (badge) badge.remove();
      if (timelineObserver) {
        timelineObserver.disconnect();
        timelineObserver = null;
      }
    }
  };

  // ─────────────────────────────────────────────
  // Klavye Kısayolu
  // ─────────────────────────────────────────────

  const registerKeyboardShortcut = () => {
    document.addEventListener('keydown', (e) => {
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
    console.log('[X Canlı Yayın Filtresi] 🚀 v2.1.0 başlatılıyor...');

    interceptSPANavigation();
    injectLiveButton();
    startObserver();
    startHeartbeat();
    registerKeyboardShortcut();

    // Eğer sayfa zaten bir arama sayfasıysa filtreyi hemen başlat
    checkAndStartFilter();

    console.log('[X Canlı Yayın Filtresi] ✅ Hazır! "Canlı Yayınlar" butonu veya Alt+L kısayolu ile arama yapın.');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
