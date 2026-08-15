// ==UserScript==
// @name         X Canlı Yayın Filtresi
// @namespace    https://github.com/tunamaran/x-live-stream-filter
// @version      3.2.0
// @description  X.com (Twitter) sol menüsüne sade ve şık "Canlı Yayınlar" butonu ekler. Kayıtlı video kliplerini engelleyip SADECE gerçek canlı yayınları ve Spaces odalarını sessizce ve temizce listeler.
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
  // 1. Sabitler ve Ayar Yönetimi
  // ─────────────────────────────────────────────

  const BUTTON_ID = 'data-x-live-filter';
  const POPUP_ID = 'data-x-live-popup';
  const FILTERED_ATTR = 'data-xlf-checked';
  const THROTTLE_MS = 300;

  const STORAGE_SEARCH_KEY = 'x-live-filter-last-search';
  const STORAGE_SETTINGS_KEY = 'x-live-filter-settings';

  /** Canlı yayın arama sorgusu kalıbı */
  const LIVE_QUERY_PATTERN = '(CANLI OR LIVE OR "canlı yayın" OR "live stream" OR "live now" OR "yayında")';

  /** Hızlı Kategori Tanımları */
  const CATEGORIES = [
    { name: '⚽ Futbol', query: 'fenerbahçe OR galatasaray OR beşiktaş OR trabzonspor OR "süper lig" OR "şampiyonlar ligi"' },
    { name: '🏀 Basketbol', query: 'nba OR euroleague OR "anadolu efes" OR "fenerbahçe beko"' },
    { name: '🎮 Gaming', query: 'twitch OR kick OR valorant OR "league of legends" OR cs2 OR gta' },
    { name: '📰 Gündem', query: 'haber OR sondakika OR gündem OR deprem' },
    { name: '🎵 Müzik', query: 'konser OR akustik OR "canlı performans" OR dj' },
    { name: '🎙️ Spaces', query: 'spaces OR "sesli oda" OR "x spaces"' }
  ];

  /** Varsayılan ayarlar */
  const DEFAULT_SETTINGS = {
    sensitivity: 'medium',      // 'low' | 'medium' | 'high'
    autoRefresh: 30,             // 0 (kapalı), 30, 60 (saniye)
    showLiveBadge: true          // Tweet üstünde sade "🔴 CANLI" etiketi göster
  };

  const loadSettings = () => {
    try {
      const data = localStorage.getItem(STORAGE_SETTINGS_KEY);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  };

  const saveSettings = (newSettings) => {
    try {
      const updated = { ...loadSettings(), ...newSettings };
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    } catch {
      return newSettings;
    }
  };

  // ─────────────────────────────────────────────
  // 2. Arama URL Oluşturucu
  // ─────────────────────────────────────────────

  const buildSearchURL = (rawKeyword, tab = 'live') => {
    let clean = rawKeyword.trim();
    if (!clean) clean = 'canlı yayın';

    let topicPart = clean;
    if (clean.includes(',')) {
      const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
      topicPart = `(${parts.map(p => (p.includes(' ') ? `"${p}"` : p)).join(' OR ')})`;
    } else if (!clean.startsWith('(') && clean.includes(' OR ')) {
      topicPart = `(${clean})`;
    }

    const fullQuery = `${topicPart} ${LIVE_QUERY_PATTERN}`;
    const encoded = encodeURIComponent(fullQuery);
    return `/search?q=${encoded}&src=typed_query&f=${tab}`;
  };

  // ─────────────────────────────────────────────
  // 3. SVG İkonlar & Tema Renkleri
  // ─────────────────────────────────────────────

  const getLiveIcon = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <g>
        <path d="M16 6H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-2.5l4 3V9.5l-4 3V8c0-1.1-.9-2-2-2z"/>
        <circle cx="5" cy="9" r="1.5" fill="#E0245E" />
      </g>
    `;
    return svg;
  };

  const detectTheme = () => {
    const bg = getComputedStyle(document.body).backgroundColor;
    if (!bg) return 'dark';
    const match = bg.match(/\d+/g);
    if (!match) return 'dark';
    const [r, g, b] = match.map(Number);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance < 30) return 'dark';
    if (luminance < 75) return 'dim';
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
          buttonText: '#FFFFFF', hoverBg: 'rgba(239, 243, 244, 0.1)',
          liveRed: '#F4212E'
        };
      case 'dim':
        return {
          bg: '#15202B', cardBg: '#1E2732', border: '#38444D', text: '#F7F9F9',
          textSecondary: '#8B98A5', inputBg: '#273340', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(247, 249, 249, 0.1)',
          liveRed: '#F4212E'
        };
      default:
        return {
          bg: '#FFFFFF', cardBg: '#FFFFFF', border: '#EFF3F4', text: '#0F1419',
          textSecondary: '#536471', inputBg: '#F7F9F9', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(0, 0, 0, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(15, 20, 25, 0.1)',
          liveRed: '#E0245E'
        };
    }
  };

  // ─────────────────────────────────────────────
  // 4. Kesin Canlı Yayın Analiz & Filtre Motoru
  // ─────────────────────────────────────────────

  /**
   * Bir tweet'in GERÇEK bir canlı yayın / Spaces olup olmadığını analiz eder.
   * Kayıtlı MP4 video kliplerini (0:13 gibi süresi olanlar) KESİNLİKLE eler.
   *
   * @param {HTMLElement} tweetEl
   * @param {string} sensitivity - 'low' | 'medium' | 'high'
   * @returns {boolean} Gerçek canlı yayın ise true
   */
  const isRealLiveTweet = (tweetEl, sensitivity = 'medium') => {
    // 1. Tweet metnini al (Kullanıcı adı/handle kısmını ÇIKAR)
    const tweetTextEl = tweetEl.querySelector('[data-testid="tweetText"]');
    const tweetText = tweetTextEl ? tweetTextEl.textContent.toLowerCase() : '';

    const clone = tweetEl.cloneNode(true);
    const userNameEl = clone.querySelector('[data-testid="User-Name"]');
    if (userNameEl) userNameEl.remove();
    const bodyContentText = (clone.textContent || '').toLowerCase();

    // 2. Medya alanını tespit et
    const mediaContainer = tweetEl.querySelector('[data-testid="videoPlayer"]') ||
                           tweetEl.querySelector('[data-testid="videoComponent"]') ||
                           tweetEl.querySelector('[data-testid="tweetPhoto"]') ||
                           tweetEl;

    // 3. KESİN REDDETME: Kayıtlı Video Süresi (Timecode) Tespiti
    // Normal videolarda sol altta "0:13", "1:45", "12:00" gibi süre badge'i bulunur.
    // Canlı yayınlarda ise video süresi YAZMAZ, yerine kırmızı "LIVE" veya izleyici sayısı yazar!
    let hasRecordedDuration = false;

    const durationBadgeCandidates = mediaContainer.querySelectorAll('div, span, time');
    for (const el of durationBadgeCandidates) {
      if (el.children.length === 0) {
        const txt = el.textContent.trim();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(txt)) {
          hasRecordedDuration = true;
          break;
        }
      }
    }

    if (!hasRecordedDuration) {
      const timeEls = mediaContainer.querySelectorAll('time, [aria-label*="duration"], [aria-label*="Süre"], [aria-label*="süre"]');
      for (const tel of timeEls) {
        const aria = tel.getAttribute('aria-label') || tel.textContent || '';
        if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(aria)) {
          hasRecordedDuration = true;
          break;
        }
      }
    }

    // 4. Kırmızı CANLI / LIVE Rozeti Tespiti
    let hasRealLiveBadge = false;
    for (const el of mediaContainer.querySelectorAll('*')) {
      const txt = (el.textContent || '').trim().toUpperCase();
      if (txt === 'LIVE' || txt === 'CANLI' || txt === 'YAYINDA' || txt.startsWith('LIVE ') || txt.startsWith('CANLI ')) {
        const style = getComputedStyle(el);
        const bg = style.backgroundColor || '';
        if (bg.includes('rgb(244') || bg.includes('rgb(224') || bg.includes('rgb(234') || bg.includes('red') ||
            el.closest('[style*="background-color: rgb(244"], [style*="background-color: rgb(224"]')) {
          hasRealLiveBadge = true;
          break;
        }
        if (!hasRecordedDuration && (txt === 'LIVE' || txt === 'CANLI')) {
          hasRealLiveBadge = true;
          break;
        }
      }
    }

    // 5. Spaces (Sesli Oda) & Broadcast Linki Tespiti
    const hasAudioSpace = tweetEl.querySelector('[data-testid="audioSpaceCard"]') !== null ||
                          tweetEl.querySelector('a[href*="/spaces/"]') !== null ||
                          bodyContentText.includes('spaces') && tweetEl.querySelector('[data-testid="card.wrapper"]') !== null;

    const hasBroadcastPlayer = tweetEl.querySelector('[data-testid="broadcastPlayer"]') !== null ||
                               tweetEl.querySelector('a[href*="/i/broadcasts/"]') !== null;

    // ── KESİN KARARLAR ──

    // Kural A: Kayıtlı video süresi (0:13) varsa ve Live badge'i yoksa -> ELENİR
    if (hasRecordedDuration && !hasRealLiveBadge) {
      return false;
    }

    // Kural B: Spaces odası veya Broadcast player varsa -> CANLI
    if (hasAudioSpace || hasBroadcastPlayer) {
      return true;
    }

    // Kural C: Video üzerinde gerçek kırmızı LIVE rozeti varsa -> CANLI
    if (hasRealLiveBadge) {
      return true;
    }

    // Kural D: Hiçbir video veya medya kartı yoksa -> ELENİR
    const hasAnyVideo = tweetEl.querySelector('video') !== null ||
                        tweetEl.querySelector('[data-testid="videoPlayer"]') !== null ||
                        tweetEl.querySelector('[data-testid="card.wrapper"]') !== null;

    if (!hasAnyVideo) {
      return false;
    }

    // Kural E: Klip/gol/özet kelimeleri içeriyorsa -> ELENİR
    const clipIndicators = ['gol |', 'goal |', 'anlık goller', 'anlık gol', 'özet |', 'highlights', 'from @'];
    for (const ci of clipIndicators) {
      if (bodyContentText.includes(ci)) {
        return false;
      }
    }

    // Kural F: Metin kontrolü (Süresiz video buffer'ları için)
    let score = 0;
    const liveKeywords = ['canlı yayın', 'live stream', 'live now', 'yayındayız', 'canlı izle', 'canlı maç yayını'];
    for (const kw of liveKeywords) {
      if (tweetText.includes(kw)) score += 35;
    }

    if (bodyContentText.includes('viewers') || bodyContentText.includes('watching') || bodyContentText.includes('izleyici')) {
      score += 25;
    }

    let threshold = 40;
    if (sensitivity === 'high') threshold = 55;
    if (sensitivity === 'low') threshold = 25;

    return score >= threshold;
  };

  // ─────────────────────────────────────────────
  // 5. Sade Tweet Etiketi
  // ─────────────────────────────────────────────

  const attachMinimalLiveTag = (tweetEl) => {
    const settings = loadSettings();
    if (!settings.showLiveBadge) return;
    if (tweetEl.querySelector('.xlf-live-tag')) return;

    const headerEl = tweetEl.querySelector('[data-testid="User-Name"]');
    if (headerEl) {
      const colors = getThemeColors();
      const tag = document.createElement('span');
      tag.className = 'xlf-live-tag';
      tag.style.display = 'inline-flex';
      tag.style.alignItems = 'center';
      tag.style.padding = '1px 6px';
      tag.style.marginRight = '6px';
      tag.style.borderRadius = '4px';
      tag.style.backgroundColor = colors.liveRed;
      tag.style.color = '#FFFFFF';
      tag.style.fontSize = '11px';
      tag.style.fontWeight = '700';
      tag.textContent = '🔴 CANLI';

      headerEl.parentNode?.insertBefore(tag, headerEl);
    }
  };

  // ─────────────────────────────────────────────
  // 6. DOM Post-Filtresi
  // ─────────────────────────────────────────────

  const isOurSearchPage = () => {
    const url = window.location.href;
    return url.includes('/search') && (
      url.includes('CANLI') || url.includes('LIVE') ||
      url.includes('canl%C4%B1') || url.includes('live') ||
      url.includes('yay%C4%B1n')
    );
  };

  const filterTimelineTweets = () => {
    if (!isOurSearchPage()) return;

    const settings = loadSettings();
    const tweets = document.querySelectorAll(`article[data-testid="tweet"]:not([${FILTERED_ATTR}])`);

    tweets.forEach((tweet) => {
      tweet.setAttribute(FILTERED_ATTR, 'true');
      const isLive = isRealLiveTweet(tweet, settings.sensitivity);

      const cellInner = tweet.closest('[data-testid="cellInnerDiv"]');
      const target = cellInner || tweet;

      if (isLive) {
        target.style.display = '';
        attachMinimalLiveTag(tweet);
      } else {
        target.style.display = 'none';
      }
    });
  };

  // ─────────────────────────────────────────────
  // 7. Otomatik Yenileme
  // ─────────────────────────────────────────────

  let autoRefreshTimer = null;

  const startAutoRefreshCycle = () => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }

    if (!isOurSearchPage()) return;
    const settings = loadSettings();
    if (!settings.autoRefresh || settings.autoRefresh <= 0) return;

    autoRefreshTimer = setInterval(() => {
      if (!isOurSearchPage()) {
        clearInterval(autoRefreshTimer);
        return;
      }

      // X.com yeni tweetler hapı
      const newPostsPill = document.querySelector('[data-testid="pill-new-tweets"]') ||
                           document.querySelector('[role="button"][aria-label*="yeni"]');
      if (newPostsPill) {
        newPostsPill.click();
      }

      filterTimelineTweets();
    }, settings.autoRefresh * 1000);
  };

  // ─────────────────────────────────────────────
  // 8. Sade Arama & Ayarlar Popup UI
  // ─────────────────────────────────────────────

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
        width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
        border-radius: 16px; padding: 22px; box-shadow: 0 8px 30px rgba(0,0,0,0.35);
        animation: xlf-slideUp 0.18s ease-out; box-sizing: border-box;
      }
      .xlf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .xlf-title {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px;
      }
      .xlf-close {
        width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 16px;
        transition: background-color 0.2s; background: transparent;
      }
      .xlf-input {
        width: 100%; padding: 11px 14px; border-radius: 10px; border: 2px solid transparent;
        font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        outline: none; transition: border-color 0.2s; box-sizing: border-box; margin-bottom: 12px;
      }
      .xlf-input:focus { border-color: #1D9BF0; }
      .xlf-categories {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px;
      }
      .xlf-category-chip {
        padding: 5px 11px; border-radius: 9999px; font-size: 12px; font-weight: 600;
        cursor: pointer; border: 1px solid; transition: all 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-category-chip:hover { transform: translateY(-1px); }
      .xlf-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
      .xlf-tab {
        flex: 1; padding: 8px 12px; border-radius: 9999px; border: 1px solid;
        cursor: pointer; font-size: 13px; font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: all 0.2s; text-align: center;
      }
      .xlf-search-btn {
        width: 100%; padding: 11px; border-radius: 9999px; border: none;
        font-size: 14px; font-weight: 700;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: pointer; transition: background-color 0.2s;
      }
      .xlf-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .xlf-recent-item {
        display: inline-block; padding: 3px 9px; border-radius: 9999px; font-size: 12px;
        cursor: pointer; margin-right: 5px; margin-bottom: 5px;
        transition: background-color 0.15s; border: 1px solid;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      @keyframes xlf-fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes xlf-slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes xlf-fadeOut { from { opacity: 1; } to { opacity: 0; } }
    `;
    document.head.appendChild(style);
  };

  const getRecentSearches = () => {
    try {
      const data = localStorage.getItem(STORAGE_SEARCH_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  };

  const saveRecentSearch = (term) => {
    try {
      let searches = getRecentSearches();
      searches = searches.filter(s => s.toLowerCase() !== term.toLowerCase());
      searches.unshift(term);
      searches = searches.slice(0, 5);
      localStorage.setItem(STORAGE_SEARCH_KEY, JSON.stringify(searches));
    } catch { /* ignore */ }
  };

  const showSearchPopup = () => {
    if (document.querySelector(`[${POPUP_ID}]`)) return;

    injectPopupStyles();
    const colors = getThemeColors();
    const recentSearches = getRecentSearches();

    const overlay = document.createElement('div');
    overlay.className = 'xlf-overlay';
    overlay.setAttribute(POPUP_ID, 'true');
    overlay.style.backgroundColor = colors.overlay;

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
    title.innerHTML = '<span style="color: #E0245E; font-size: 12px;">🔴</span> Canlı Yayın Ara';

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
    input.placeholder = 'Canlı yayın konusu (örn: fenerbahçe, nba)...';
    input.style.backgroundColor = colors.inputBg;
    input.style.color = colors.text;
    if (recentSearches.length > 0) input.value = recentSearches[0];

    // Hızlı Kategoriler
    const catContainer = document.createElement('div');
    catContainer.className = 'xlf-categories';

    CATEGORIES.forEach(cat => {
      const chip = document.createElement('span');
      chip.className = 'xlf-category-chip';
      chip.textContent = cat.name;
      chip.style.borderColor = colors.border;
      chip.style.color = colors.text;
      chip.style.backgroundColor = colors.inputBg;

      chip.addEventListener('click', () => {
        input.value = cat.query;
        searchBtn.disabled = false;
        doSearch();
      });
      catContainer.appendChild(chip);
    });

    // Sekmeler
    let selectedTab = 'live';
    const tabs = document.createElement('div');
    tabs.className = 'xlf-tabs';

    const createTab = (label, value, isActive = false) => {
      const tab = document.createElement('button');
      tab.className = `xlf-tab ${isActive ? 'active' : ''}`;
      tab.textContent = label;

      const update = (act) => {
        tab.style.backgroundColor = act ? colors.accent : 'transparent';
        tab.style.color = act ? colors.buttonText : colors.text;
        tab.style.borderColor = act ? 'transparent' : colors.border;
      };
      update(isActive);

      tab.addEventListener('click', () => {
        selectedTab = value;
        tabs.querySelectorAll('.xlf-tab').forEach(t => {
          const isThis = t === tab;
          t.className = `xlf-tab ${isThis ? 'active' : ''}`;
          if (isThis) update(true);
          else {
            t.style.backgroundColor = 'transparent';
            t.style.color = colors.text;
            t.style.borderColor = colors.border;
          }
        });
      });
      return tab;
    };

    tabs.appendChild(createTab('📋 Güncel', 'live', true));
    tabs.appendChild(createTab('🎥 Videolar', 'video'));

    // Arama Butonu
    const searchBtn = document.createElement('button');
    searchBtn.className = 'xlf-search-btn';
    searchBtn.textContent = 'Canlı Yayınları Bul';
    searchBtn.style.backgroundColor = colors.liveRed;
    searchBtn.style.color = '#FFFFFF';
    searchBtn.disabled = input.value.trim().length === 0;

    input.addEventListener('input', () => {
      searchBtn.disabled = input.value.trim().length === 0;
    });

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

    // Son aramalar
    const recentDiv = document.createElement('div');
    if (recentSearches.length > 0) {
      recentDiv.style.marginTop = '12px';
      recentDiv.style.paddingTop = '10px';
      recentDiv.style.borderTop = `1px solid ${colors.border}`;

      const rTitle = document.createElement('div');
      rTitle.style.fontSize = '11px';
      rTitle.style.fontWeight = '700';
      rTitle.style.color = colors.textSecondary;
      rTitle.style.marginBottom = '5px';
      rTitle.textContent = 'Son Aramalar:';
      recentDiv.appendChild(rTitle);

      recentSearches.forEach(term => {
        const item = document.createElement('span');
        item.className = 'xlf-recent-item';
        item.textContent = term.length > 25 ? term.substring(0, 23) + '...' : term;
        item.style.color = colors.accent;
        item.style.borderColor = colors.border;
        item.addEventListener('click', () => {
          input.value = term;
          searchBtn.disabled = false;
          input.focus();
        });
        recentDiv.appendChild(item);
      });
    }

    const closePopup = () => {
      overlay.style.animation = 'xlf-fadeOut 0.15s ease-in';
      setTimeout(() => overlay.remove(), 150);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    card.appendChild(header);
    card.appendChild(input);
    card.appendChild(catContainer);
    card.appendChild(tabs);
    card.appendChild(searchBtn);
    if (recentSearches.length > 0) card.appendChild(recentDiv);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => { input.focus(); input.select(); }, 100);
  };

  // ─────────────────────────────────────────────
  // 9. Sol Menü Enjeksiyonu
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

    const existingSvg = clone.querySelector('svg');
    if (existingSvg) {
      const newIcon = getLiveIcon();
      const cls = existingSvg.getAttribute('class');
      if (cls) newIcon.setAttribute('class', cls);
      existingSvg.parentNode.replaceChild(newIcon, existingSvg);
    }

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

    clone.removeAttribute('aria-current');
    clone.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current'));
    clone.querySelectorAll('span').forEach(span => {
      if (span.style.fontWeight === 'bold' || span.style.fontWeight === '700') {
        span.style.fontWeight = 'normal';
      }
    });

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
  // 10. Gözlemciler & Yaşam Döngüsü
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

  let timelineObserver = null;

  const startTimelineObserver = () => {
    if (timelineObserver) {
      timelineObserver.disconnect();
      timelineObserver = null;
    }
    if (!isOurSearchPage()) return;

    filterTimelineTweets();
    const throttledFilter = throttle(filterTimelineTweets, 150);

    timelineObserver = new MutationObserver(() => {
      throttledFilter();
    });

    const target = document.querySelector('[data-testid="primaryColumn"]') ||
                   document.querySelector('main') || document.body;

    timelineObserver.observe(target, { childList: true, subtree: true });
  };

  const startMenuObserver = () => {
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

    const onNav = () => {
      throttledInject();
      setTimeout(() => {
        if (isOurSearchPage()) {
          startTimelineObserver();
          startAutoRefreshCycle();
        } else {
          if (timelineObserver) timelineObserver.disconnect();
          if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        }
      }, 800);
    };

    history.pushState = (...args) => { origPush(...args); onNav(); };
    history.replaceState = (...args) => { origReplace(...args); onNav(); };
    window.addEventListener('popstate', onNav);
  };

  const registerKeyboardShortcut = () => {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        showSearchPopup();
      }
    });
  };

  // ─────────────────────────────────────────────
  // 11. Başlatıcı (Entry Point)
  // ─────────────────────────────────────────────

  const init = () => {
    console.log('[X Canlı Yayın Filtresi] 🚀 v3.2.0 (Minimal & Sade) başlatılıyor...');

    interceptSPANavigation();
    injectLiveButton();
    startMenuObserver();
    registerKeyboardShortcut();

    setInterval(() => {
      if (!document.querySelector(`[${BUTTON_ID}]`)) injectLiveButton();
    }, 3000);

    if (isOurSearchPage()) {
      setTimeout(() => {
        startTimelineObserver();
        startAutoRefreshCycle();
      }, 1000);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
