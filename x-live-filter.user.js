// ==UserScript==
// @name         X Canlı Yayın Filtresi
// @namespace    https://github.com/tunamaran/x-live-stream-filter
// @version      3.1.0
// @description  X.com (Twitter) sol menüsüne "Canlı Yayınlar" butonu ekler. Kayıtlı video ve gol kliplerini engelleyip SADECE gerçek canlı yayın ve Spaces odalarını gösterir.
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
  const LIVE_CARD_ATTR = 'data-xlf-live-card';
  const THROTTLE_MS = 350;

  const STORAGE_SEARCH_KEY = 'x-live-filter-last-search';
  const STORAGE_SETTINGS_KEY = 'x-live-filter-settings';

  /** Canlı yayın anahtar kelime sorgu kalıbı */
  const LIVE_QUERY_PATTERN = '(CANLI OR LIVE OR "canlı yayın" OR "live stream" OR "live now" OR "yayında")';

  /** Hızlı Kategori Tanımları */
  const CATEGORIES = [
    { name: '⚽ Futbol', query: 'fenerbahçe OR galatasaray OR beşiktaş OR trabzonspor OR "süper lig" OR "şampiyonlar ligi"' },
    { name: '🏀 Basketbol', query: 'nba OR euroleague OR "anadolu efes" OR "fenerbahçe beko"' },
    { name: '🎮 Gaming', query: 'twitch OR kick OR valorant OR "league of legends" OR cs2 OR gta' },
    { name: '📰 Gündem', query: 'haber OR sondakika OR gündem OR deprem' },
    { name: '🎵 Müzik', query: 'konser OR akustik OR "canlı performans" OR dj OR müzik' },
    { name: '🎙️ Spaces', query: 'spaces OR "sesli oda" OR "x spaces" OR "audio space"' }
  ];

  /** Varsayılan kullanıcı ayarları */
  const DEFAULT_SETTINGS = {
    sensitivity: 'medium',      // 'low' | 'medium' | 'high'
    autoRefresh: 30,             // 0 (kapalı), 30, 60, 120 (saniye)
    desktopNotifications: true,  // Bildirim izni varsa bildirim gönder
    soundAlerts: true,           // Sesli uyarı çal (Web Audio API)
    highlightCards: true,        // Canlı yayın tweetlerine neon/vurgu efekti ekle
    customKeywords: ['maç izle', 'canlı izle', 'yayındayız', 'canlı maç']
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
  // 2. Web Audio API — Bildirim Sesi (Synthesizer)
  // ─────────────────────────────────────────────

  const playAlertSound = () => {
    const settings = loadSettings();
    if (!settings.soundAlerts) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Ses engeli
    }
  };

  // ─────────────────────────────────────────────
  // 3. Masaüstü Bildirimleri
  // ─────────────────────────────────────────────

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  };

  const sendDesktopNotification = (title, body, onClickUrl) => {
    const settings = loadSettings();
    if (!settings.desktopNotifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(title, {
        body: body,
        icon: 'https://abs.twimg.com/favicons/twitter.3.ico',
        tag: 'x-live-stream-alert',
        renotify: true
      });

      if (onClickUrl) {
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }
    } catch {
      // Ignore
    }
  };

  // ─────────────────────────────────────────────
  // 4. Arama URL Oluşturucu
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
  // 5. SVG İkonlar & Tema Renkleri
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
        <circle cx="5" cy="9" r="1.5" fill="#E0245E">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/>
        </circle>
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
          liveRed: '#F4212E', liveRedBg: 'rgba(244, 33, 46, 0.12)'
        };
      case 'dim':
        return {
          bg: '#15202B', cardBg: '#1E2732', border: '#38444D', text: '#F7F9F9',
          textSecondary: '#8B98A5', inputBg: '#273340', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(91, 112, 131, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(247, 249, 249, 0.1)',
          liveRed: '#F4212E', liveRedBg: 'rgba(244, 33, 46, 0.15)'
        };
      default:
        return {
          bg: '#FFFFFF', cardBg: '#FFFFFF', border: '#EFF3F4', text: '#0F1419',
          textSecondary: '#536471', inputBg: '#F7F9F9', accent: '#1D9BF0',
          accentHover: '#1A8CD8', overlay: 'rgba(0, 0, 0, 0.4)',
          buttonText: '#FFFFFF', hoverBg: 'rgba(15, 20, 25, 0.1)',
          liveRed: '#E0245E', liveRedBg: 'rgba(224, 36, 94, 0.1)'
        };
    }
  };

  // ─────────────────────────────────────────────
  // 6. Kesin Canlı Yayın Analiz & Puanlama Motoru (v3.1.0)
  // ─────────────────────────────────────────────

  /**
   * Bir tweet'in GERÇEK bir canlı yayın / Spaces olup olmadığını analiz eder.
   * Kayıtlı MP4 video kliplerini (0:13 gibi süresi olanlar) KESİNLİKLE eler.
   *
   * @param {HTMLElement} tweetEl
   * @param {string} sensitivity - 'low' | 'medium' | 'high'
   * @returns {{ isLive: boolean, score: number, details: string }}
   */
  const evaluateTweetLiveScore = (tweetEl, sensitivity = 'medium') => {
    // 1. Tweet metnini al (Kullanıcı adı/handle kısmını ÇIKAR - false positive önleme)
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
    let durationText = '';

    const durationBadgeCandidates = mediaContainer.querySelectorAll('div, span, time');
    for (const el of durationBadgeCandidates) {
      if (el.children.length === 0) {
        const txt = el.textContent.trim();
        // 0:13 veya 1:45 veya 10:20 formatı
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(txt)) {
          hasRecordedDuration = true;
          durationText = txt;
          break;
        }
      }
    }

    // Ekstra duration kontrolü (aria-label="0:13" veya time etiketi)
    if (!hasRecordedDuration) {
      const timeEls = mediaContainer.querySelectorAll('time, [aria-label*="duration"], [aria-label*="Süre"], [aria-label*="süre"]');
      for (const tel of timeEls) {
        const aria = tel.getAttribute('aria-label') || tel.textContent || '';
        if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(aria)) {
          hasRecordedDuration = true;
          durationText = aria;
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

    // ─────────────────────────────────────────────
    // FİLTRELEME VE KARAR VERME KURALLARI
    // ─────────────────────────────────────────────

    // KURAL A: Süresi olan (0:13 gibi) ve gerçek Live badge'i OLMAYAN videolar KESİNLİKLE CANLI DEĞİLDİR!
    if (hasRecordedDuration && !hasRealLiveBadge) {
      return {
        isLive: false,
        score: -100,
        details: `rejected-video-duration(${durationText})`
      };
    }

    // KURAL B: Spaces odası veya doğrudan Broadcast Player varsa KESİNLİKLE CANLIDIR!
    if (hasAudioSpace || hasBroadcastPlayer) {
      return {
        isLive: true,
        score: 95,
        details: hasAudioSpace ? 'verified-spaces-room' : 'verified-broadcast-player'
      };
    }

    // KURAL C: Video üzerinde gerçek kırmızı LIVE / CANLI rozeti varsa KESİNLİKLE CANLIDIR!
    if (hasRealLiveBadge) {
      return {
        isLive: true,
        score: 90,
        details: 'verified-live-badge'
      };
    }

    // KURAL D: Tweet içerisinde hiçbir video veya kart yoksa CANLI DEĞİLDİR!
    const hasAnyVideo = tweetEl.querySelector('video') !== null ||
                        tweetEl.querySelector('[data-testid="videoPlayer"]') !== null ||
                        tweetEl.querySelector('[data-testid="card.wrapper"]') !== null;

    if (!hasAnyVideo) {
      return {
        isLive: false,
        score: 0,
        details: 'no-media'
      };
    }

    // KURAL E: Video var ama süresi tespit edilemedi (Stream buffer) -> Sıkı metin analizi
    let score = 0;
    const details = [];

    // Klip / Gol / Özet kelimeleri varsa ceza ver (Kayıtlı video indikatörü)
    const clipIndicators = ['gol |', 'goal |', 'anlık goller', 'anlık gol', 'özet |', 'highlights', 'from @'];
    for (const ci of clipIndicators) {
      if (bodyContentText.includes(ci)) {
        return {
          isLive: false,
          score: -50,
          details: `rejected-clip-word(${ci})`
        };
      }
    }

    // Canlı yayın anahtar kelimeleri
    const liveKeywords = ['canlı yayın', 'live stream', 'live now', 'yayındayız', 'canlı izle', 'canlı maç yayını'];
    for (const kw of liveKeywords) {
      if (tweetText.includes(kw)) {
        score += 35;
        details.push(`kw(${kw})`);
      }
    }

    // İzleyici sayısı göstergesi
    if (bodyContentText.includes('viewers') || bodyContentText.includes('watching') || bodyContentText.includes('izleyici')) {
      score += 25;
      details.push('viewers');
    }

    let threshold = 40; // medium
    if (sensitivity === 'high') threshold = 55;
    if (sensitivity === 'low') threshold = 25;

    return {
      isLive: score >= threshold,
      score,
      details: details.join(' | ') || 'fallback-check'
    };
  };

  // ─────────────────────────────────────────────
  // 7. Zengin Canlı Kartlar (Card Highlighting)
  // ─────────────────────────────────────────────

  const enrichLiveCard = (tweetEl, evaluation) => {
    const settings = loadSettings();
    if (!settings.highlightCards) return;
    if (tweetEl.getAttribute(LIVE_CARD_ATTR)) return;

    tweetEl.setAttribute(LIVE_CARD_ATTR, 'true');
    const colors = getThemeColors();

    tweetEl.style.transition = 'border-left 0.2s, box-shadow 0.2s';
    tweetEl.style.borderLeft = `4px solid ${colors.liveRed}`;
    tweetEl.style.boxShadow = `inset 4px 0 12px -2px ${colors.liveRedBg}`;

    const headerEl = tweetEl.querySelector('[data-testid="User-Name"]') || tweetEl.querySelector('div');
    if (headerEl && !tweetEl.querySelector('.xlf-live-tag')) {
      const tag = document.createElement('span');
      tag.className = 'xlf-live-tag';
      tag.style.display = 'inline-flex';
      tag.style.alignItems = 'center';
      tag.style.gap = '4px';
      tag.style.padding = '2px 8px';
      tag.style.marginRight = '8px';
      tag.style.borderRadius = '9999px';
      tag.style.backgroundColor = colors.liveRed;
      tag.style.color = '#FFFFFF';
      tag.style.fontSize = '11px';
      tag.style.fontWeight = '700';
      tag.style.letterSpacing = '0.5px';
      tag.innerHTML = `🔴 CANLI YAYIN <span style="opacity:0.8;font-size:9px">(${evaluation.score}p)</span>`;

      headerEl.parentNode?.insertBefore(tag, headerEl);
    }
  };

  // ─────────────────────────────────────────────
  // 8. DOM Post-Filtresi, Sayıcı ve Bildirimler
  // ─────────────────────────────────────────────

  let liveTweetCount = 0;
  let previousLiveCount = 0;

  const isOurSearchPage = () => {
    const url = window.location.href;
    return url.includes('/search') && (
      url.includes('CANLI') || url.includes('LIVE') ||
      url.includes('canl%C4%B1') || url.includes('live') ||
      url.includes('yay%C4%B1n')
    );
  };

  const updateCounterBadge = () => {
    let badge = document.querySelector('.xlf-filter-badge');
    if (!badge) {
      if (!isOurSearchPage()) return;
      showFilterBadge();
      badge = document.querySelector('.xlf-filter-badge');
    }

    if (badge) {
      const countSpan = badge.querySelector('.xlf-count');
      if (countSpan) {
        countSpan.textContent = liveTweetCount;
      }
    }
  };

  const filterTimelineTweets = () => {
    if (!isOurSearchPage()) return;

    const settings = loadSettings();
    const tweets = document.querySelectorAll(`article[data-testid="tweet"]:not([${FILTERED_ATTR}])`);
    let newlyDiscoveredLive = 0;

    tweets.forEach((tweet) => {
      tweet.setAttribute(FILTERED_ATTR, 'true');
      const evaluation = evaluateTweetLiveScore(tweet, settings.sensitivity);

      const cellInner = tweet.closest('[data-testid="cellInnerDiv"]');
      const target = cellInner || tweet;

      if (evaluation.isLive) {
        target.style.display = '';
        enrichLiveCard(tweet, evaluation);
        liveTweetCount++;
        newlyDiscoveredLive++;
      } else {
        target.style.display = 'none';
      }
    });

    if (newlyDiscoveredLive > 0) {
      updateCounterBadge();

      if (previousLiveCount > 0 && newlyDiscoveredLive > 0) {
        playAlertSound();
        sendDesktopNotification(
          '🔴 Yeni Canlı Yayın Bulundu!',
          `${newlyDiscoveredLive} yeni canlı yayın arama sonuçlarına eklendi.`,
          window.location.href
        );
        showNewLiveAlertBanner(newlyDiscoveredLive);
      }
      previousLiveCount = liveTweetCount;
    }
  };

  const showNewLiveAlertBanner = (newCount) => {
    if (document.querySelector('.xlf-new-banner')) return;

    const colors = getThemeColors();
    const banner = document.createElement('div');
    banner.className = 'xlf-new-banner';
    banner.style.position = 'sticky';
    banner.style.top = '54px';
    banner.style.zIndex = '999';
    banner.style.backgroundColor = colors.liveRed;
    banner.style.color = '#FFFFFF';
    banner.style.padding = '10px 16px';
    banner.style.borderRadius = '12px';
    banner.style.margin = '8px 16px';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.justifyContent = 'space-between';
    banner.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
    banner.style.fontSize = '14px';
    banner.style.fontWeight = '700';
    banner.style.cursor = 'pointer';
    banner.style.animation = 'xlf-slideUp 0.3s ease-out';

    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span>✨</span>
        <span>${newCount} Yeni Canlı Yayın Akışa Eklendi ↑</span>
      </div>
      <button style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:4px 10px;border-radius:9999px;font-size:12px;cursor:pointer;font-weight:700">Yukarı Çık</button>
    `;

    banner.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      banner.remove();
    });

    const primaryCol = document.querySelector('[data-testid="primaryColumn"]') || document.body;
    primaryCol.prepend(banner);

    setTimeout(() => {
      if (banner.parentNode) banner.remove();
    }, 8000);
  };

  // ─────────────────────────────────────────────
  // 9. Otomatik Yenileme Döngüsü
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

      const newPostsPill = document.querySelector('[data-testid="pill-new-tweets"]') ||
                           document.querySelector('[role="button"][aria-label*="yeni"]');
      if (newPostsPill) {
        newPostsPill.click();
      }

      filterTimelineTweets();
    }, settings.autoRefresh * 1000);

    console.log(`[X Canlı Yayın Filtresi] ⏱️ Otomatik yenileme aktif (${settings.autoRefresh}s).`);
  };

  // ─────────────────────────────────────────────
  // 10. Arama & Ayarlar Popup UI
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
        width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto;
        border-radius: 16px; padding: 24px; box-shadow: 0 12px 36px rgba(0,0,0,0.4);
        animation: xlf-slideUp 0.2s ease-out; box-sizing: border-box;
      }
      .xlf-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .xlf-title {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 20px; font-weight: 800; display: flex; align-items: center; gap: 8px;
      }
      .xlf-nav-tabs {
        display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid;
        padding-bottom: 8px;
      }
      .xlf-nav-tab {
        background: transparent; border: none; font-size: 14px; font-weight: 700;
        cursor: pointer; padding: 6px 12px; border-radius: 8px; transition: all 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-nav-tab.active { background: rgba(29, 155, 240, 0.15); color: #1D9BF0 !important; }
      .xlf-close {
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 18px;
        transition: background-color 0.2s; background: transparent;
      }
      .xlf-input {
        width: 100%; padding: 12px 16px; border-radius: 12px; border: 2px solid transparent;
        font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        outline: none; transition: border-color 0.2s; box-sizing: border-box; margin-bottom: 12px;
      }
      .xlf-input:focus { border-color: #1D9BF0; }
      .xlf-categories {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;
      }
      .xlf-category-chip {
        padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600;
        cursor: pointer; border: 1px solid; transition: all 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-category-chip:hover { transform: translateY(-1px); }
      .xlf-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
      .xlf-tab {
        flex: 1; padding: 10px 14px; border-radius: 9999px; border: 1px solid;
        cursor: pointer; font-size: 13px; font-weight: 700;
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
      .xlf-setting-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 0; border-bottom: 1px solid;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .xlf-setting-label { font-size: 14px; font-weight: 600; }
      .xlf-setting-desc { font-size: 12px; opacity: 0.7; margin-top: 2px; }
      .xlf-select {
        padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600;
        border: 1px solid; outline: none; cursor: pointer;
      }
      .xlf-toggle {
        width: 44px; height: 24px; border-radius: 9999px; background: #71767B;
        position: relative; cursor: pointer; transition: background 0.2s;
      }
      .xlf-toggle.on { background: #1D9BF0; }
      .xlf-toggle-knob {
        width: 20px; height: 20px; border-radius: 50%; background: #FFFFFF;
        position: absolute; top: 2px; left: 2px; transition: transform 0.2s;
      }
      .xlf-toggle.on .xlf-toggle-knob { transform: translateX(20px); }
      .xlf-filter-badge {
        position: fixed; bottom: 20px; right: 20px; padding: 10px 18px; border-radius: 9999px;
        font-size: 13px; font-weight: 700; z-index: 9999; display: flex; align-items: center;
        gap: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.35); cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        animation: xlf-slideUp 0.3s ease-out; transition: transform 0.2s, opacity 0.2s;
      }
      .xlf-filter-badge:hover { transform: scale(1.03); }
      .xlf-recent-item {
        display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px;
        cursor: pointer; margin-right: 6px; margin-bottom: 6px;
        transition: background-color 0.15s; border: 1px solid;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      @keyframes xlf-fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes xlf-slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
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
      searches = searches.slice(0, 6);
      localStorage.setItem(STORAGE_SEARCH_KEY, JSON.stringify(searches));
    } catch { /* ignore */ }
  };

  const showFilterBadge = () => {
    if (document.querySelector('.xlf-filter-badge')) return;

    injectPopupStyles();
    const colors = getThemeColors();

    const badge = document.createElement('div');
    badge.className = 'xlf-filter-badge';
    badge.style.backgroundColor = colors.liveRed;
    badge.style.color = '#FFFFFF';
    badge.innerHTML = `🔴 <span class="xlf-count">${liveTweetCount}</span> Canlı Yayın Aktif`;
    badge.title = 'Tıkla: Filtreyi ve ayarları yönet';

    badge.addEventListener('click', () => {
      showSearchPopup('settings');
    });

    document.body.appendChild(badge);
  };

  const showSearchPopup = (initialTab = 'search') => {
    if (document.querySelector(`[${POPUP_ID}]`)) return;

    injectPopupStyles();
    const colors = getThemeColors();
    const recentSearches = getRecentSearches();
    let currentSettings = loadSettings();

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
    title.innerHTML = '<span style="color: #F4212E; font-size: 14px;">🔴</span> Canlı Yayın Merkezi';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'xlf-close';
    closeBtn.style.color = colors.text;
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.backgroundColor = colors.hoverBg; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.backgroundColor = 'transparent'; });
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Nav Tabs
    const navTabs = document.createElement('div');
    navTabs.className = 'xlf-nav-tabs';
    navTabs.style.borderColor = colors.border;

    const searchNavTab = document.createElement('button');
    searchNavTab.className = `xlf-nav-tab ${initialTab === 'search' ? 'active' : ''}`;
    searchNavTab.style.color = colors.text;
    searchNavTab.textContent = '🔍 Canlı Ara';

    const settingsNavTab = document.createElement('button');
    settingsNavTab.className = `xlf-nav-tab ${initialTab === 'settings' ? 'active' : ''}`;
    settingsNavTab.style.color = colors.text;
    settingsNavTab.textContent = '⚙️ Ayarlar & Filtre';

    navTabs.appendChild(searchNavTab);
    navTabs.appendChild(settingsNavTab);

    const viewContainer = document.createElement('div');

    // ── SEARCH VIEW ──
    const searchView = document.createElement('div');

    const input = document.createElement('input');
    input.className = 'xlf-input';
    input.type = 'text';
    input.placeholder = 'Konu veya kelimeler (örn: fenerbahçe, nba, konser)...';
    input.style.backgroundColor = colors.inputBg;
    input.style.color = colors.text;
    if (recentSearches.length > 0) input.value = recentSearches[0];

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

    tabs.appendChild(createTab('📋 Güncel (Latest)', 'live', true));
    tabs.appendChild(createTab('🎥 Videolar', 'video'));

    const searchBtn = document.createElement('button');
    searchBtn.className = 'xlf-search-btn';
    searchBtn.textContent = '🔴 Canlı Yayınları Filtrele & Ara';
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

    const recentDiv = document.createElement('div');
    if (recentSearches.length > 0) {
      recentDiv.style.marginTop = '14px';
      recentDiv.style.paddingTop = '12px';
      recentDiv.style.borderTop = `1px solid ${colors.border}`;

      const rTitle = document.createElement('div');
      rTitle.style.fontSize = '12px';
      rTitle.style.fontWeight = '700';
      rTitle.style.color = colors.textSecondary;
      rTitle.style.marginBottom = '6px';
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

    searchView.appendChild(input);
    searchView.appendChild(catContainer);
    searchView.appendChild(tabs);
    searchView.appendChild(searchBtn);
    if (recentSearches.length > 0) searchView.appendChild(recentDiv);

    // ── SETTINGS VIEW ──
    const settingsView = document.createElement('div');
    settingsView.style.display = 'none';

    // 1. Filtre Hassasiyeti
    const sensRow = document.createElement('div');
    sensRow.className = 'xlf-setting-row';
    sensRow.style.borderColor = colors.border;
    sensRow.innerHTML = `
      <div>
        <div class="xlf-setting-label" style="color:${colors.text}">Filtre Hassasiyeti</div>
        <div class="xlf-setting-desc" style="color:${colors.textSecondary}">Canlı yayın puanlama eşiği</div>
      </div>
    `;
    const sensSelect = document.createElement('select');
    sensSelect.className = 'xlf-select';
    sensSelect.style.backgroundColor = colors.inputBg;
    sensSelect.style.color = colors.text;
    sensSelect.style.borderColor = colors.border;
    sensSelect.innerHTML = `
      <option value="low" ${currentSettings.sensitivity === 'low' ? 'selected' : ''}>Düşük (Daha esnek)</option>
      <option value="medium" ${currentSettings.sensitivity === 'medium' ? 'selected' : ''}>Orta (Önerilen)</option>
      <option value="high" ${currentSettings.sensitivity === 'high' ? 'selected' : ''}>Yüksek (Sadece kesin)</option>
    `;
    sensSelect.addEventListener('change', () => {
      currentSettings = saveSettings({ sensitivity: sensSelect.value });
      if (isOurSearchPage()) filterTimelineTweets();
    });
    sensRow.appendChild(sensSelect);

    // 2. Otomatik Yenileme
    const refreshRow = document.createElement('div');
    refreshRow.className = 'xlf-setting-row';
    refreshRow.style.borderColor = colors.border;
    refreshRow.innerHTML = `
      <div>
        <div class="xlf-setting-label" style="color:${colors.text}">Otomatik Yenileme</div>
        <div class="xlf-setting-desc" style="color:${colors.textSecondary}">Yeni yayınları otomatik tara</div>
      </div>
    `;
    const refreshSelect = document.createElement('select');
    refreshSelect.className = 'xlf-select';
    refreshSelect.style.backgroundColor = colors.inputBg;
    refreshSelect.style.color = colors.text;
    refreshSelect.style.borderColor = colors.border;
    refreshSelect.innerHTML = `
      <option value="0" ${currentSettings.autoRefresh === 0 ? 'selected' : ''}>Kapalı</option>
      <option value="30" ${currentSettings.autoRefresh === 30 ? 'selected' : ''}>30 saniyede bir</option>
      <option value="60" ${currentSettings.autoRefresh === 60 ? 'selected' : ''}>1 dakikada bir</option>
      <option value="120" ${currentSettings.autoRefresh === 120 ? 'selected' : ''}>2 dakikada bir</option>
    `;
    refreshSelect.addEventListener('change', () => {
      currentSettings = saveSettings({ autoRefresh: Number(refreshSelect.value) });
      startAutoRefreshCycle();
    });
    refreshRow.appendChild(refreshSelect);

    // 3. Masaüstü Bildirimleri
    const notifRow = document.createElement('div');
    notifRow.className = 'xlf-setting-row';
    notifRow.style.borderColor = colors.border;
    notifRow.innerHTML = `
      <div>
        <div class="xlf-setting-label" style="color:${colors.text}">Masaüstü Bildirimleri</div>
        <div class="xlf-setting-desc" style="color:${colors.textSecondary}">Yeni canlı yayın başladığında bildir</div>
      </div>
    `;
    const notifToggle = document.createElement('div');
    notifToggle.className = `xlf-toggle ${currentSettings.desktopNotifications ? 'on' : ''}`;
    notifToggle.innerHTML = '<div class="xlf-toggle-knob"></div>';
    notifToggle.addEventListener('click', async () => {
      const isCurrentlyOn = notifToggle.classList.contains('on');
      if (!isCurrentlyOn) {
        const granted = await requestNotificationPermission();
        if (granted) {
          notifToggle.classList.add('on');
          currentSettings = saveSettings({ desktopNotifications: true });
        }
      } else {
        notifToggle.classList.remove('on');
        currentSettings = saveSettings({ desktopNotifications: false });
      }
    });
    notifRow.appendChild(notifToggle);

    // 4. Sesli Uyarılar
    const soundRow = document.createElement('div');
    soundRow.className = 'xlf-setting-row';
    soundRow.style.borderColor = colors.border;
    soundRow.innerHTML = `
      <div>
        <div class="xlf-setting-label" style="color:${colors.text}">Sesli Bildirim (Chime)</div>
        <div class="xlf-setting-desc" style="color:${colors.textSecondary}">Yeni canlı yayın algılandığında ton çal</div>
      </div>
    `;
    const soundToggle = document.createElement('div');
    soundToggle.className = `xlf-toggle ${currentSettings.soundAlerts ? 'on' : ''}`;
    soundToggle.innerHTML = '<div class="xlf-toggle-knob"></div>';
    soundToggle.addEventListener('click', () => {
      const isOn = soundToggle.classList.toggle('on');
      currentSettings = saveSettings({ soundAlerts: isOn });
      if (isOn) playAlertSound();
    });
    soundRow.appendChild(soundToggle);

    // 5. Kart Vurgulama
    const cardRow = document.createElement('div');
    cardRow.className = 'xlf-setting-row';
    cardRow.style.borderColor = colors.border;
    cardRow.innerHTML = `
      <div>
        <div class="xlf-setting-label" style="color:${colors.text}">Canlı Kart Vurgusu</div>
        <div class="xlf-setting-desc" style="color:${colors.textSecondary}">Tweet kartlarına neon canlı kenarlık ekle</div>
      </div>
    `;
    const cardToggle = document.createElement('div');
    cardToggle.className = `xlf-toggle ${currentSettings.highlightCards ? 'on' : ''}`;
    cardToggle.innerHTML = '<div class="xlf-toggle-knob"></div>';
    cardToggle.addEventListener('click', () => {
      const isOn = cardToggle.classList.toggle('on');
      currentSettings = saveSettings({ highlightCards: isOn });
    });
    cardRow.appendChild(cardToggle);

    settingsView.appendChild(sensRow);
    settingsView.appendChild(refreshRow);
    settingsView.appendChild(notifRow);
    settingsView.appendChild(soundRow);
    settingsView.appendChild(cardRow);

    const switchTab = (tabName) => {
      if (tabName === 'search') {
        searchNavTab.classList.add('active');
        settingsNavTab.classList.remove('active');
        searchView.style.display = 'block';
        settingsView.style.display = 'none';
        setTimeout(() => input.focus(), 50);
      } else {
        settingsNavTab.classList.add('active');
        searchNavTab.classList.remove('active');
        searchView.style.display = 'none';
        settingsView.style.display = 'block';
      }
    };

    searchNavTab.addEventListener('click', () => switchTab('search'));
    settingsNavTab.addEventListener('click', () => switchTab('settings'));
    switchTab(initialTab);

    viewContainer.appendChild(searchView);
    viewContainer.appendChild(settingsView);

    const closePopup = () => {
      overlay.style.animation = 'xlf-fadeOut 0.15s ease-in';
      setTimeout(() => overlay.remove(), 150);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePopup(); });

    card.appendChild(header);
    card.appendChild(navTabs);
    card.appendChild(viewContainer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if (initialTab === 'search') {
      setTimeout(() => { input.focus(); input.select(); }, 100);
    }
  };

  // ─────────────────────────────────────────────
  // 11. Sol Menü Enjeksiyonu
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
      showSearchPopup('search');
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

    console.log('[X Canlı Yayın Filtresi] ✅ "Canlı Yayınlar" menüye eklendi.');
  };

  // ─────────────────────────────────────────────
  // 12. Gözlemciler & Yaşam Döngüsü
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
    const throttledFilter = throttle(filterTimelineTweets, 200);

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
        liveTweetCount = 0;
        previousLiveCount = 0;
        if (isOurSearchPage()) {
          startTimelineObserver();
          showFilterBadge();
          startAutoRefreshCycle();
        } else {
          const badge = document.querySelector('.xlf-filter-badge');
          if (badge) badge.remove();
          if (timelineObserver) timelineObserver.disconnect();
          if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        }
      }, 1000);
    };

    history.pushState = (...args) => { origPush(...args); onNav(); };
    history.replaceState = (...args) => { origReplace(...args); onNav(); };
    window.addEventListener('popstate', onNav);
  };

  const registerKeyboardShortcut = () => {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        showSearchPopup('search');
      }
    });
  };

  // ─────────────────────────────────────────────
  // 13. Başlatıcı (Entry Point)
  // ─────────────────────────────────────────────

  const init = () => {
    console.log('[X Canlı Yayın Filtresi] 🚀 v3.1.0 başlatılıyor...');

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
        showFilterBadge();
        startAutoRefreshCycle();
      }, 1200);
    }

    console.log('[X Canlı Yayın Filtresi] ✅ Hazır! Menü butonu veya Alt+L kısayolunu kullanın.');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
