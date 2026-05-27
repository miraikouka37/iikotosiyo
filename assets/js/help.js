// help.js - Dynamically injects help content and keyboard shortcuts
(function() {
  // Inject CSS Styles
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Floating Help Button */
    .help-float-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 44px;
      height: 44px;
      background: rgba(10, 10, 10, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      color: #fff;
      font-size: 1.25rem;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 9998;
    }
    .help-float-btn:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(255, 255, 255, 0.3);
    }
    
    /* Help Modal Overlay */
    .help-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      padding: 1rem;
    }
    .help-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }
    
    /* Help Modal Box */
    .help-modal-box {
      background: #0a0a0a;
      border: 1px solid #1f1f1f;
      border-radius: 12px;
      padding: 2.25rem 2rem 2rem 2rem;
      width: 100%;
      max-width: 550px;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      position: relative;
      transform: translateY(20px);
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .help-modal-overlay.active .help-modal-box {
      transform: translateY(0);
    }
    
    /* Help content styling */
    .help-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin-bottom: 1.5rem;
      background: linear-gradient(45deg, #fff, #71717a);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      border-bottom: 1px solid #1f1f1f;
      padding-bottom: 0.5rem;
    }
    .help-section {
      margin-bottom: 1.5rem;
    }
    .help-section-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-left: 2px solid #fff;
      padding-left: 0.5rem;
    }
    .help-list {
      list-style: none;
      padding: 0;
      font-size: 0.8125rem;
      color: #a1a1aa;
      line-height: 1.6;
    }
    .help-list li {
      margin-bottom: 0.5rem;
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .help-badge {
      background: #1f1f1f;
      border: 1px solid #3f3f46;
      color: #fff;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-family: monospace;
      font-weight: 700;
      flex-shrink: 0;
    }
    .help-close-x {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      background: transparent;
      border: none;
      color: #71717a;
      font-size: 1.25rem;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .help-close-x:hover {
      color: #fff;
    }
    .help-desc {
      font-size: 0.8125rem;
      color: #a1a1aa;
      margin-bottom: 1rem;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(styleEl);

  // Determine Help Content based on path/elements
  const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || !document.getElementById('display-name');
  const isAdminPage = window.location.pathname.endsWith('admin.html') || !!document.getElementById('admin-user-list');
  const isSettingsPage = window.location.pathname.endsWith('settings.html');

  let title = "FUTURE POINTS ヘルプ";
  let sectionsHTML = "";

  if (isLoginPage) {
    title = "FUTURE POINTS ログインヘルプ";
    sectionsHTML = `
      <div class="help-section">
        <div class="help-section-title">ログインと新規登録</div>
        <p class="help-desc">本サービスは、日々の素晴らしい行動やコミュニティへの参加によってポイントを貯めるプラットフォームです。</p>
        <ul class="help-list">
          <li>新規登録は、画面下部の「新規登録」リンクをクリックし、お名前、メールアドレス、パスワードを入力してアカウントを作成します。</li>
          <li>登録済みの場合は、メールアドレス（またはお名前）とパスワードを入力して「ログイン」してください。</li>
        </ul>
      </div>
      <div class="help-section">
        <div class="help-section-title">管理者アクセス</div>
        <ul class="help-list">
          <li>管理者としてアクセスする場合は、管理者用のログインIDとパスワードを入力してログインを実行します。</li>
        </ul>
      </div>
    `;
  } else if (isAdminPage) {
    title = "FUTURE POINTS 管理者ヘルプ";
    sectionsHTML = `
      <div class="help-section">
        <div class="help-section-title">管理者機能について</div>
        <p class="help-desc">管理者ダッシュボードでは、ユーザーの管理や、ユーザーから送信された各種アクションの承認・管理を行えます。</p>
        <ul class="help-list">
          <li><strong>ユーザー管理 & ランキング</strong>: ユーザーの検索、保有ポイントの直接編集、警告メッセージの送信、アカウントの削除を行えます。</li>
          <li><strong>いい人推薦の承認</strong>: ユーザーが他ユーザーを推薦した「いい人紹介」を「承認」または「却下」します。承認すると被推薦者に50pt、推薦者に10ptが付与されます。</li>
          <li><strong>写真報告履歴</strong>: ゴミ拾いやボランティア等の写真付き報告を確認します。不適切な投稿である場合は「削除」ボタンから写真削除と付与された70ptの没収を行えます。</li>
          <li><strong>ユーザーの意見</strong>: 意見箱から送られたメッセージを確認し、不要になったものは「削除」できます。</li>
          <li><strong>忘れ物お知らせ管理</strong>: ユーザーが投稿した忘れ物情報を一覧確認し、管理権限で削除できます。</li>
        </ul>
      </div>
    `;
  } else if (isSettingsPage) {
    title = "FUTURE POINTS 設定ヘルプ";
    sectionsHTML = `
      <div class="help-section">
        <div class="help-section-title">プロフィール設定</div>
        <p class="help-desc">あなたのアカウントプロフィールの変更とパスワードの再設定を行えます。</p>
        <ul class="help-list">
          <li><strong>ユーザー名の変更</strong>: 新しい名前を入力して「変更を保存」します。（不適切な表現が含まれている場合は保存できません）</li>
          <li><strong>メールアドレスの変更</strong>: 新しいメールアドレスを入力して「変更を保存」します。ログインIDが切り替わります。</li>
          <li><strong>パスワード変更</strong>: パスワードを変更したい場合のみ、新しいパスワードを入力します。変更しない場合は空欄のままにしてください。</li>
        </ul>
      </div>
    `;
  } else {
    // Standard User Dashboard
    title = "FUTURE POINTS ユーザーヘルプ";
    sectionsHTML = `
      <div class="help-section">
        <div class="help-section-title">ポイントの貯め方</div>
        <p class="help-desc">さまざまなアクションを行ってポイントを獲得しましょう：</p>
        <ul class="help-list">
          <li><strong>学校来ました（デイリー）</strong>: 1日1回のログインで <strong>+10 pt</strong> 獲得できます。</li>
          <li><strong>学校に登校 / 部活・委員会参加</strong>: 到着や活動時にボタンを押して、それぞれ <strong>+50 pt / +30 pt</strong> 獲得します（1日1回まで）。</li>
          <li><strong>サンクスポイント</strong>: 感謝の気持ちを送ることで <strong>+20 pt</strong> 獲得できます（1日1回まで）。</li>
          <li><strong>写真報告</strong>: ゴミ拾いなどのボランティア写真と活動内容を送信して <strong>+70 pt</strong> 獲得します（1日1回まで）。</li>
        </ul>
      </div>
      <div class="help-section">
        <div class="help-section-title">いい人推薦（紹介機能）</div>
        <ul class="help-list">
          <li>「いい人を推薦する」ボタンから友達を選択し、その人の良い行いを記述して送信します。</li>
          <li>管理者が確認・承認すると、<strong>推薦された友達に +50 pt</strong>、推薦した<strong>あなたに +10 pt</strong>がプレゼントされます！</li>
        </ul>
      </div>
      <div class="help-section">
        <div class="help-section-title">忘れ物掲示板</div>
        <ul class="help-list">
          <li>校内で忘れ物を見つけたら、品名と見つけた場所を入力して「投稿」してください。</li>
          <li>落とし主が見つかった場合、リストの「解決済」ボタンを押すことでお知らせを削除できます。</li>
        </ul>
      </div>
    `;
  }

  // Create Help Elements
  const floatBtn = document.createElement('div');
  floatBtn.className = 'help-float-btn';
  floatBtn.innerHTML = '?';
  floatBtn.title = 'ヘルプを表示 (ショートカット: ? キー)';

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'help-modal-overlay';
  
  modalOverlay.innerHTML = `
    <div class="help-modal-box">
      <button class="help-close-x" id="help-modal-close-x" title="閉じる">✕</button>
      <div class="help-title">${title}</div>
      ${sectionsHTML}
      <div class="help-section">
        <div class="help-section-title">キーボードショートカット</div>
        <ul class="help-list">
          <li><span class="help-badge">?</span> ヘルプ画面の開閉</li>
          <li><span class="help-badge">Esc</span> ヘルプ画面を閉じる</li>
        </ul>
      </div>
      <button class="btn btn-outline btn-sm" id="help-modal-close-btn" style="margin-top: 1rem; width: 100%;">閉じる</button>
    </div>
  `;

  document.body.appendChild(floatBtn);
  document.body.appendChild(modalOverlay);

  // Toggle Functionality
  function toggleHelp() {
    modalOverlay.classList.toggle('active');
  }

  function closeHelp() {
    modalOverlay.classList.remove('active');
  }

  // Event Listeners
  floatBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHelp();
  });

  document.getElementById('help-modal-close-x').addEventListener('click', closeHelp);
  document.getElementById('help-modal-close-btn').addEventListener('click', closeHelp);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeHelp();
    }
  });

  window.addEventListener('keydown', (e) => {
    // Ignore keyboard shortcut if typing in input/textarea/contenteditable
    const activeEl = document.activeElement;
    if (activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.isContentEditable
    )) {
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      toggleHelp();
    } else if (e.key === 'Escape') {
      closeHelp();
    }
  });
})();
