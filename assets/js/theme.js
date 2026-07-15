/**
 * theme.js — FUTURE POINTS 共通テーマ管理（無効化版）
 * テーマ切り替え機能を無効化し、ライトモードに固定します。
 */

(function () {
  'use strict';

  // FOUC防止クラスの削除とライトモードの強制適用
  document.documentElement.classList.remove('dark-init');

  function applyLightTheme() {
    const body = document.body;
    if (!body) return;
    body.classList.add('light');
    body.classList.remove('dark');
  }

  // グローバル関数は定義しておくが、何もしない
  window.toggleTheme = function () {
    // テーマ切り替え機能は無効化されています
  };

  // 即時適用
  applyLightTheme();

  // DOMContentLoaded時にも実行して確実にライトモードを適用
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLightTheme);
  } else {
    applyLightTheme();
  }
})();
