/**
 * theme.js — FUTURE POINTS 共通テーマ管理
 * ダーク/ライトモードを localStorage + Firebase Realtime DB で同期します。
 * Firebase SDK (v8 compat) が読み込まれている必要があります。
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 1. DOM 初期適用（FOUC防止）                                           */
  /* ------------------------------------------------------------------ */
  const LS_KEY = 'mirai_theme';
  const savedTheme = localStorage.getItem(LS_KEY);
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark-init');
  }

  /* ------------------------------------------------------------------ */
  /* 2. テーマ適用ヘルパー                                                 */
  /* ------------------------------------------------------------------ */
  function applyTheme(mode) {
    const body = document.body;
    if (!body) return;

    if (mode === 'dark') {
      body.classList.add('dark');
      body.classList.remove('light');
    } else {
      body.classList.add('light');
      body.classList.remove('dark');
    }

    // すべてのトグルボタンのラベルを更新
    document.querySelectorAll('.theme-toggle-label').forEach(el => {
      el.textContent = mode === 'dark' ? '☀️ ライト' : '🌙 ダーク';
    });

    // ボタンのアクティブスタイルを更新
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.setAttribute('aria-label', mode === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替');
      btn.setAttribute('title', mode === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替');
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. Firebase 保存/読み込み                                             */
  /* ------------------------------------------------------------------ */
  function getUserKey() {
    try {
      const stored = localStorage.getItem('mirai_currentUser');
      if (!stored) return null;
      const user = JSON.parse(stored);
      if (!user || !user.email || user.role === 'admin') return null;
      return user.email.replace(/\./g, '_');
    } catch (e) {
      return null;
    }
  }

  function saveThemeToFirebase(mode) {
    const userKey = getUserKey();
    if (!userKey) return;
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebase.database().ref('mirai_users/' + userKey + '/theme').set(mode)
          .catch(err => console.warn('[theme.js] Firebase write error:', err));
      }
    } catch (e) {
      console.warn('[theme.js] Firebase not ready:', e);
    }
  }

  function loadThemeFromFirebase() {
    const userKey = getUserKey();
    if (!userKey) return;
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebase.database().ref('mirai_users/' + userKey + '/theme').once('value')
          .then(snapshot => {
            const fbTheme = snapshot.val();
            if (fbTheme && (fbTheme === 'dark' || fbTheme === 'light')) {
              // Firebase の値を正とし、localStorageを同期
              localStorage.setItem(LS_KEY, fbTheme);
              applyTheme(fbTheme);
            }
          })
          .catch(err => console.warn('[theme.js] Firebase read error:', err));
      }
    } catch (e) {
      console.warn('[theme.js] Firebase not ready:', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. トグル処理                                                         */
  /* ------------------------------------------------------------------ */
  window.toggleTheme = function () {
    const current = localStorage.getItem(LS_KEY);
    const isDark = current === 'dark' ||
      (!current && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';

    localStorage.setItem(LS_KEY, next);
    applyTheme(next);
    saveThemeToFirebase(next);
  };

  /* ------------------------------------------------------------------ */
  /* 5. 初期化 (DOM 読み込み後)                                            */
  /* ------------------------------------------------------------------ */
  function initTheme() {
    const stored = localStorage.getItem(LS_KEY);
    let mode;

    if (stored === 'dark' || stored === 'light') {
      mode = stored;
    } else {
      // システム設定に従う
      mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark' : 'light';
    }

    applyTheme(mode);

    // Firebase から最新を読み込んで上書き（ログインページ以外）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadThemeFromFirebase);
    } else {
      // 少し遅延させて Firebase SDK の初期化を待つ
      setTimeout(loadThemeFromFirebase, 500);
    }
  }

  initTheme();
})();
