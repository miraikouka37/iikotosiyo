/**
 * theme.js — FUTURE POINTS 共通テーマ管理
 * 黒を基調としたダークテーマをデフォルトとして適用します。
 */

(function () {
  'use strict';

  // FOUC防止クラスの削除とダークモードの適用
  document.documentElement.classList.remove('dark-init');

  function applyDarkTheme() {
    const body = document.body;
    if (!body) return;
    body.classList.add('dark');
    body.classList.remove('light');
  }

  function applyLightTheme() {
    const body = document.body;
    if (!body) return;
    body.classList.add('light');
    body.classList.remove('dark');
  }

  window.toggleTheme = function () {
    const body = document.body;
    if (!body) return;
    if (body.classList.contains('light')) {
      applyDarkTheme();
      localStorage.setItem('future_points_theme', 'dark');
    } else {
      applyLightTheme();
      localStorage.setItem('future_points_theme', 'light');
    }
  };

  const savedTheme = localStorage.getItem('future_points_theme');
  if (savedTheme === 'light') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyLightTheme);
    } else {
      applyLightTheme();
    }
  } else {
    applyDarkTheme();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyDarkTheme);
    }
  }
})();

