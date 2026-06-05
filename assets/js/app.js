(function () {
  const db = firebase.database();
  const storage = firebase.storage();

  let userEmail = '';
  let allUsersData = null;
  let allReportsData = null;
  let allRecommendationsData = null;
  let allLostItemsData = [];
  let currentCalendarDate = new Date();

  let hasShownDatabaseError = false;
  function handleDatabaseError(error) {
    console.error("Database Error:", error);
    if (error.message && error.message.includes("permission_denied")) {
      if (!hasShownDatabaseError) {
        hasShownDatabaseError = true;
        alert("データベースへのアクセス権限がありません。管理者にご連絡ください（Firebaseのセキュリティルールの期限が切れている可能性があります）。");
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Check if logged in
    const storedUserStr = localStorage.getItem('mirai_currentUser');
    if (!storedUserStr) {
      window.location.href = 'index.html';
      return;
    }

    const storedUser = JSON.parse(storedUserStr);
    userEmail = storedUser.email;

    // Real-time synchronization
    db.ref('mirai_users').on('value', snapshot => {
      allUsersData = snapshot.val() || {};
      
      const userKey = userEmail.replace(/\./g, '_');
      if (!allUsersData[userKey]) {
        alert('アカウントが存在しないか、管理者によって削除されました。');
        logout();
        return;
      }
      
      renderDashboard();
    }, handleDatabaseError);

    db.ref('mirai_reports').limitToLast(30).on('value', snapshot => {
      allReportsData = [];
      snapshot.forEach(child => {
        allReportsData.push({ id: child.key, ...child.val() });
      });
      renderCommunityPhotos();
    }, handleDatabaseError);

    db.ref('mirai_recommendations').on('value', snapshot => {
      allRecommendationsData = [];
      snapshot.forEach(child => {
        allRecommendationsData.push({ id: child.key, ...child.val() });
      });
      renderRecommendations();
    }, handleDatabaseError);

    db.ref('mirai_lost_items').on('value', snapshot => {
      allLostItemsData = [];
      snapshot.forEach(child => {
        allLostItemsData.push({ id: child.key, ...child.val() });
      });
      renderLostItems();
    }, handleDatabaseError);

    // Attach Event Listeners (Security hardening)
    document.body.addEventListener('click', (e) => {
      const target = e.target.closest('.btn-earn, .btn-logout, .btn-prev-month, .btn-next-month, .btn-submit-report, .btn-send-feedback, .btn-submit-recommend, .btn-recommend-trigger, .btn-send-lost-item, .btn-resolve-lost');
      if (!target) return;

      if (target.classList.contains('btn-earn')) {
        const action = target.getAttribute('data-action');
        const amount = parseInt(target.getAttribute('data-amount'));
        earnPoints(action, amount);
      }

      if (target.classList.contains('btn-logout')) {
        logout();
      }

      if (target.classList.contains('btn-prev-month')) {
        changeMonth(-1);
      }

      if (target.classList.contains('btn-next-month')) {
        changeMonth(1);
      }

      if (target.classList.contains('btn-submit-report')) {
        submitReport();
      }

      if (target.classList.contains('btn-send-feedback')) {
        sendFeedback();
      }

      if (target.classList.contains('btn-submit-recommend')) {
        submitRecommendation();
      }

      if (target.classList.contains('btn-recommend-trigger')) {
        openRecommendModal();
      }

      if (target.classList.contains('btn-send-lost-item')) {
        submitLostItem();
      }

      if (target.classList.contains('btn-resolve-lost')) {
        const id = target.getAttribute('data-id');
        resolveLostItem(id);
      }
    });

    renderDashboard();
  });

  // Helper to find the closest element matching a selector (for event delegation)
  // Re-implementing a simple version since e.path is non-standard
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (s) {
      var el = this;
      do {
        if (el.matches(s)) return el;
        el = el.parentElement || el.parentNode;
      } while (el !== null && el.nodeType === 1);
      return null;
    };
  }

  function getUserData() {
    const userKey = userEmail.replace(/\./g, '_');
    return {
      email: userEmail,
      data: allUsersData ? (allUsersData[userKey] || { name: 'ユーザー', points: 0, history: [] }) : { name: 'ユーザー', points: 0, history: [] }
    };
  }

  function saveUserData(email, data) {
    const userKey = email.replace(/\./g, '_');
    db.ref('mirai_users/' + userKey).set(data).catch(handleDatabaseError);
  }

  function renderDashboard() {
    if (!allUsersData) return;
    const { email, data } = getUserData();
    const displayName = document.getElementById('display-name');
    const totalPoints = document.getElementById('total-points');
    const historyContainer = document.getElementById('history-container');
    const alertContainer = document.getElementById('alert-container');

    if (alertContainer) {
      if (data.warning) {
        alertContainer.innerHTML = `
          <div class="glass-panel" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999; background: #dc2626; border: 3px solid #991b1b; padding: 2rem; color: #ffffff; text-align: center; width: 90%; max-width: 400px; box-shadow: 0 0 25px rgba(220, 38, 38, 0.9); text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);">
            <p style="font-weight: 900; font-size: 2rem; margin-bottom: 1rem; color: #fde047; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.6);">警告！</p>
            <p style="font-size: 1.25rem; font-weight: bold; line-height: 1.5;">${data.warning}</p>
          </div>
        `;
      } else {
        alertContainer.innerHTML = '';
      }
    }

    if (displayName) displayName.innerText = data.name;
    if (totalPoints) animatePoints(data.points || 0);

    const pointsMessage = document.getElementById('points-message');
    if (pointsMessage) {
      const userPoints = data.points || 0;
      if (userPoints >= 20000) {
        pointsMessage.innerText = "ジュース獲得チャンス！？";
        pointsMessage.style.color = "#fff";
        pointsMessage.style.fontWeight = "700";
      } else {
        pointsMessage.innerText = "KEEP IT UP!";
        pointsMessage.style.color = "var(--text-muted)";
      }
    }

    if (!historyContainer) return;
    historyContainer.innerHTML = '';

    const history = data.history || [];
    if (history.length === 0) {
      historyContainer.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">履歴がありません</li>';
    } else {
      const recentHistory = [...history].reverse().slice(0, 5);
      recentHistory.forEach(item => {
        const li = document.createElement('li');
        li.className = 'list-item';
        const dateStr = new Date(item.timestamp).toLocaleString('ja-JP', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        li.innerHTML = `
          <div class="item-info">
            <h4>${item.action}</h4>
            <p>${dateStr}</p>
          </div>
          <div class="item-points points-positive">+${item.amount} pt</div>
        `;
        historyContainer.appendChild(li);
      });
    }

    renderRanking();
    renderCommunityPhotos();
    renderCalendar();
    populateUserSelect();
    renderRecommendations();
    renderLostItems();

    if (localStorage.getItem('mirai_isNewUser') === 'true') {
      openOnboarding();
    }
  }

  function animatePoints(target) {
    const el = document.getElementById('total-points');
    if (!el) return;
    const currentText = el.innerText;
    const current = parseInt(currentText) || 0;
    if (current === target) return;

    const duration = 1000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const val = Math.floor(current + (target - current) * easeOut);
      el.innerText = val;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  function renderRanking() {
    const rankingContainer = document.getElementById('ranking-container');
    if (!rankingContainer || !allUsersData) return;

    rankingContainer.innerHTML = '';
    const userList = Object.keys(allUsersData)
      .filter(key => !key.startsWith('{'))
      .map(key => ({
        name: allUsersData[key].name,
        points: allUsersData[key].points || 0
      }));

    userList.sort((a, b) => b.points - a.points);

    userList.forEach((user, index) => {
      const li = document.createElement('li');
      li.className = 'list-item';
      let rankIcon = `${index + 1}位`;
      li.innerHTML = `
        <div class="item-info">
          <h4>${rankIcon} - ${user.name}</h4>
        </div>
        <div class="item-points">${user.points} pt</div>
      `;
      rankingContainer.appendChild(li);
    });
  }

  function earnPoints(action, amount) {
    const { email, data } = getUserData();
    const todayStr = new Date().toDateString();
    data.lastEarned = data.lastEarned || {};

    if (action === 'デイリーチェックイン') {
      const todayObj = new Date();
      const tzOffset = new Date().getTimezoneOffset() * 60000;
      const todayIso = new Date(Date.now() - tzOffset).toISOString().split('T')[0];

      if (data.lastCheckIn === todayStr) {
        alert('デイリーポイントは1日1回のみ獲得できます。また明日アクセスしてください！');
        return;
      }
      data.lastCheckIn = todayStr;
      data.checkInDates = data.checkInDates || [];
      if (!data.checkInDates.includes(todayIso)) {
        data.checkInDates.push(todayIso);
      }
    } else if (action === 'ごみを拾った') {
      // ごみ拾いは1日7回まで
      // 古い制限データが残っている場合はクリア
      if (data.lastEarned && data.lastEarned['ごみを拾った']) {
        delete data.lastEarned['ごみを拾った'];
      }
      data.earnedCount = data.earnedCount || {};
      const countData = data.earnedCount[action] || { date: '', count: 0 };
      if (countData.date !== todayStr) {
        countData.date = todayStr;
        countData.count = 0;
      }
      if (countData.count >= 7) {
        alert('「ごみを拾った」のポイント獲得は1日7回までです。また明日お願いします！');
        return;
      }
      countData.count++;
      data.earnedCount[action] = countData;
    } else {
      // 写真報告の場合は別のキーで管理（タイトルが毎回変わる可能性があるため）
      const limitKey = action.startsWith('[写真報告]') ? 'photo_report' : action;
      
      if (data.lastEarned[limitKey] === todayStr) {
        const msg = limitKey === 'photo_report' ? '写真報告' : action;
        alert(`「${msg}」のポイント獲得は1日1回までです。また明日お願いします！`);
        return;
      }
      data.lastEarned[limitKey] = todayStr;
    }

    const entry = {
      action: action,
      amount: amount,
      timestamp: new Date().toISOString()
    };
    data.points = (data.points || 0) + amount;
    data.history = data.history || [];
    data.history.push(entry);
    
    // 履歴の無限増殖を防ぐため、最新の150件のみを保持
    if (data.history.length > 150) {
      data.history = data.history.slice(data.history.length - 150);
    }
    
    saveUserData(email, data);
  }

  window.logout = function() {
    localStorage.removeItem('mirai_currentUser');
    window.location.href = 'index.html';
  }

  function changeMonth(offset) {
    const newMonth = currentCalendarDate.getMonth() + offset;
    currentCalendarDate.setMonth(newMonth);
    if (currentCalendarDate.getFullYear() > 2100) currentCalendarDate = new Date(2100, 11, 1);
    if (currentCalendarDate.getFullYear() < 2000) currentCalendarDate = new Date(2000, 0, 1);
    renderCalendar();
  }

  function renderCalendar() {
    const container = document.getElementById('calendar-grid');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!container) return;

    container.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    monthYearLabel.innerText = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) container.appendChild(document.createElement('div'));

    const { data } = getUserData();
    const checkedInDates = data.checkInDates || [];
    const currentTzOffset = new Date().getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - currentTzOffset).toISOString().split('T')[0];

    for (let i = 1; i <= daysInMonth; i++) {
      const el = document.createElement('div');
      el.style.padding = '0.5rem 0';
      el.style.position = 'relative';
      el.style.cursor = 'default';
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      el.innerText = i;

      if (dateStr === todayStr) {
        el.style.color = '#fff';
        el.style.fontWeight = '800';
        el.style.textDecoration = 'underline';
      }

      if (checkedInDates.includes(dateStr)) {
        const stamp = document.createElement('div');
        stamp.innerText = '✓';
        stamp.style.position = 'absolute';
        stamp.style.top = '50%';
        stamp.style.left = '50%';
        stamp.style.transform = 'translate(-50%, -50%)';
        stamp.style.fontSize = '1.3rem';
        stamp.style.fontWeight = '700';
        stamp.style.color = 'var(--success)';
        stamp.style.opacity = '0.6';
        stamp.style.zIndex = '0';
        el.appendChild(stamp);
        el.style.color = 'var(--text-muted)';
        el.style.zIndex = '1';
      }
      container.appendChild(el);
    }
  }

  function sendFeedback() {
    const messageInput = document.getElementById('feedback-message');
    const message = messageInput.value.trim();
    if (!message) return;
    const { email, data } = getUserData();
    const newFeedback = {
      name: data.name,
      email: email,
      message: message,
      timestamp: new Date().toISOString()
    };
    db.ref('mirai_feedbacks').push(newFeedback).then(() => {
      messageInput.value = '';
      alert('貴重なご意見ありがとうございます！管理者に送信しました。');
    }).catch(err => {
      console.error(err);
      if (err.message && err.message.includes('permission_denied')) {
        alert('データベースへのアクセス権限がないため、意見を送信できませんでした。');
      } else {
        alert('意見の送信に失敗しました。');
      }
    });
  }

  function submitReport() {
    const titleInput = document.getElementById('report-title');
    const title = titleInput.value.trim();
    const points = 70;
    const fileInputImage = document.getElementById('report-image');
    const fileInputCamera = document.getElementById('report-camera');
    const selectedFile = (fileInputImage && fileInputImage.files.length > 0) ? fileInputImage.files[0] :
      (fileInputCamera && fileInputCamera.files.length > 0) ? fileInputCamera.files[0] : null;

    if (!title || !selectedFile) {
      alert('活動内容と写真の両方を正しく入力してください。');
      return;
    }

    const { email, data } = getUserData();
    const todayStr = new Date().toDateString();
    if (data.lastEarned && data.lastEarned['photo_report'] === todayStr) {
      alert('写真報告は1日1回のみ送信可能です。また明日お願いします！');
      return;
    }

    // Firebase Storage の権限エラーを回避するため、画像を縮小してBase64形式でRealtime DBに直接保存する
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800; // 最大800pxに縮小

        if (width > height) {
          if (width > maxDim) {
            height = Math.floor(height * (maxDim / width));
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.floor(width * (maxDim / height));
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 画質70%のJPEG形式にしてデータサイズを軽量化
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        const newReport = {
          email: email,
          name: data.name,
          title: title,
          points: points,
          image: dataUrl,
          timestamp: new Date().toISOString(),
          status: 'approved'
        };

        db.ref('mirai_reports').push(newReport).then(() => {
          titleInput.value = '';
          if (fileInputImage) fileInputImage.value = '';
          if (fileInputCamera) fileInputCamera.value = '';
          const nameLabel = document.getElementById('selected-file-name');
          if (nameLabel) nameLabel.innerText = '写真が選択されていません';
          earnPoints(`[写真報告] ${title}`, points);
          alert(`「${title}」の報告が完了し、${points}pt獲得しました！`);
        }).catch(err => {
          console.error(err);
          alert('報告の送信に失敗しました。');
        });
      };
      img.onerror = function () {
        alert('画像の読み込みに失敗しました。');
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      alert('ファイルの読み込みに失敗しました。');
    };
    reader.readAsDataURL(selectedFile);
  }

  function renderCommunityPhotos() {
    const container = document.getElementById('community-photos-container');
    if (!container || !allReportsData) return;
    const reports = allReportsData.filter(r => r.status === 'approved');
    if (reports.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); width: 100%;">写真がありません</div>';
      return;
    }
    container.innerHTML = '';
    [...reports].reverse().forEach(report => {
      const card = document.createElement('div');
      card.style.minWidth = '220px';
      card.style.background = '#0d0d0d';
      card.style.border = '1px solid var(--panel-border)';
      card.style.borderRadius = '8px';
      card.style.padding = '0.75rem';
      card.style.flexShrink = '0';
      card.innerHTML = `
        <img src="${report.image}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 4px; margin-bottom: 0.75rem;" alt="活動写真">
        <h5 style="margin-bottom: 0.25rem; font-size: 0.875rem;">${report.title}</h5>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">${report.name}</span>
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--success);">+${report.points}pt</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function populateUserSelect() {
    const select = document.getElementById('recommend-user-select');
    if (!select || !allUsersData) return;
    
    const currentSelection = select.value;
    select.innerHTML = '<option value="" disabled selected>ユーザーを選択してください</option>';
    
    const userKey = userEmail.replace(/\./g, '_');
    
    Object.keys(allUsersData).forEach(key => {
      if (key.startsWith('{')) return;
      if (key === userKey) return;
      
      const user = allUsersData[key];
      if (user.role === 'admin' || key === 'S1') return;
      
      const email = user.email || key.replace(/_/g, '.');
      const option = document.createElement('option');
      option.value = email;
      option.textContent = `${user.name} (${email})`;
      select.appendChild(option);
    });
    
    if (currentSelection) {
      select.value = currentSelection;
    }
  }

  function submitRecommendation() {
    const select = document.getElementById('recommend-user-select');
    const reasonInput = document.getElementById('recommend-reason');
    if (!select || !reasonInput) return;
    
    const receiverEmail = select.value;
    const reason = reasonInput.value.trim();
    
    if (!receiverEmail || !reason) {
      alert('推薦する人と理由の両方を入力してください。');
      return;
    }
    
    const { email, data } = getUserData();
    const todayStr = new Date().toDateString();
    
    if (data.lastRecommendDate === todayStr) {
      alert('推薦は1日1回のみ送信可能です。また明日お願いします！');
      return;
    }
    
    const receiverKey = receiverEmail.replace(/\./g, '_');
    const receiverData = allUsersData[receiverKey];
    if (!receiverData) {
      alert('推薦対象のユーザーが見つかりません。');
      return;
    }
    
    const newRecommendation = {
      senderEmail: email,
      senderName: data.name,
      receiverEmail: receiverEmail,
      receiverName: receiverData.name,
      reason: reason,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    db.ref('mirai_recommendations').push(newRecommendation).then(() => {
      data.lastRecommendDate = todayStr;
      saveUserData(email, data);
      
      select.value = '';
      reasonInput.value = '';
      
      alert(`「${receiverData.name}」さんの推薦を送信しました。管理者の承認をお待ちください！`);
      closeRecommendModal();
    }).catch(err => {
      console.error(err);
      alert('推薦の送信に失敗しました。');
    });
  }

  function renderRecommendations() {
    const container = document.getElementById('recommendations-container');
    if (!container || !allRecommendationsData) return;
    
    const approvedRecs = allRecommendationsData.filter(r => r.status === 'approved');
    if (approvedRecs.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); width: 100%;">紹介された「いい人」はまだいません</div>';
      return;
    }
    
    container.innerHTML = '';
    const sortedRecs = [...approvedRecs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sortedRecs.forEach(rec => {
      const card = document.createElement('div');
      card.style.minWidth = '280px';
      card.style.background = '#0d0d0d';
      card.style.border = '1px solid var(--panel-border)';
      card.style.borderRadius = '8px';
      card.style.padding = '1rem';
      card.style.flexShrink = '0';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      
      const dateStr = new Date(rec.timestamp).toLocaleDateString('ja-JP', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      const safeReceiverName = escapeHTML(rec.receiverName);
      const safeSenderName = escapeHTML(rec.senderName);
      const safeReason = escapeHTML(rec.reason);
      
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-weight: 700; color: #fff; font-size: 0.9375rem;">${safeReceiverName} さん</span>
            <span style="font-size: 0.75rem; color: var(--success); font-weight: 700;">★ 推薦されました</span>
          </div>
          <p style="font-size: 0.8125rem; color: var(--text-main); line-height: 1.4; margin-bottom: 0.5rem; word-break: break-all; white-space: pre-wrap;">${safeReason}</p>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1a1a1a; padding-top: 0.5rem; margin-top: 0.5rem;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">推薦者: ${safeSenderName} さん</span>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${dateStr}</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderLostItems() {
    const container = document.getElementById('lost-items-container');
    if (!container || !allLostItemsData) return;
    
    if (allLostItemsData.length === 0) {
      container.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">現在、忘れ物はありません</li>';
      return;
    }
    
    container.innerHTML = '';
    const sortedItems = [...allLostItemsData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sortedItems.forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.style.flexDirection = 'column';
      li.style.alignItems = 'flex-start';
      li.style.gap = '0.5rem';
      
      const dateStr = new Date(item.timestamp).toLocaleString('ja-JP', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      
      const safeName = escapeHTML(item.itemName);
      const safeLocation = escapeHTML(item.location);
      const safeReporter = escapeHTML(item.reporterName);
      
      li.innerHTML = `
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div>
            <h4 style="margin: 0; font-size: 0.875rem; font-weight: 700; color: #fff;">${safeName}</h4>
            <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">場所: ${safeLocation}</p>
          </div>
          <button class="btn btn-outline btn-sm btn-resolve-lost" data-id="${item.id}" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.7rem; border-color: var(--success); color: var(--success); margin: 0;">解決済</button>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between; width: 100%;">
          <span>投稿者: ${safeReporter}</span>
          <span>${dateStr}</span>
        </div>
      `;
      container.appendChild(li);
    });
  }

  function submitLostItem() {
    const nameInput = document.getElementById('lost-item-name');
    const locationInput = document.getElementById('lost-item-location');
    if (!nameInput || !locationInput) return;
    
    const itemName = nameInput.value.trim();
    const location = locationInput.value.trim();
    
    if (!itemName || !location) {
      alert('忘れ物名と見つけた場所の両方を入力してください。');
      return;
    }
    
    const forbiddenWords = [
      'セックス', 'エロ', 'ちんちん', 'まんこ', 'オナニー', 'ペニス', 'sex', 'porn', 'ヴァギナ', '淫乱', 
      '死ね', '殺す', 'カス', 'ゴミ', 
      'nigger', 'nigga', 'pussy', 'キチガイ', 'ガイジ', 'チョン', '土人'
    ];
    if (forbiddenWords.some(word => itemName.toLowerCase().includes(word) || location.toLowerCase().includes(word))) {
      alert('入力内容に不適切な表現が含まれているため、投稿できません。');
      return;
    }
    
    const { email, data } = getUserData();
    const newLostItem = {
      itemName: itemName,
      location: location,
      reporterName: data.name,
      reporterEmail: email,
      timestamp: new Date().toISOString()
    };
    
    db.ref('mirai_lost_items').push(newLostItem).then(() => {
      nameInput.value = '';
      locationInput.value = '';
      alert('忘れ物のお知らせを投稿しました！');
    }).catch(err => {
      console.error(err);
      alert('投稿に失敗しました。');
    });
  }

  function resolveLostItem(id) {
    if (confirm('落とし主が見つかりましたか？（このお知らせを削除します）')) {
      db.ref('mirai_lost_items/' + id).remove().then(() => {
        alert('解決済みにしました！');
      }).catch(err => {
        console.error(err);
        alert('削除に失敗しました。');
      });
    }
  }

  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
  }

  function openRecommendModal() {
    const modal = document.getElementById('recommend-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeRecommendModal() {
    const modal = document.getElementById('recommend-modal');
    if (modal) {
      modal.style.display = 'none';
      const select = document.getElementById('recommend-user-select');
      const reasonInput = document.getElementById('recommend-reason');
      if (select) select.value = '';
      if (reasonInput) reasonInput.value = '';
    }
  }

  window.openRecommendModal = openRecommendModal;
  window.closeRecommendModal = closeRecommendModal;

  let currentOnboardingSlide = 1;
  const totalOnboardingSlides = 4;

  function openOnboarding() {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.style.display = 'flex';
      currentOnboardingSlide = 1;
      showOnboardingSlide(1);
    }
  }

  function closeOnboarding() {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.style.display = 'none';
      localStorage.removeItem('mirai_isNewUser');
    }
  }

  function showOnboardingSlide(slideNum) {
    for (let i = 1; i <= totalOnboardingSlides; i++) {
      const slide = document.getElementById('slide-' + i);
      const dot = document.getElementById('dot-' + i);
      if (slide) {
        slide.style.display = (i === slideNum) ? 'block' : 'none';
      }
      if (dot) {
        dot.style.background = (i === slideNum) ? '#fff' : 'var(--text-muted)';
      }
    }
    
    const prevBtn = document.getElementById('onboarding-prev');
    const nextBtn = document.getElementById('onboarding-next');
    
    if (prevBtn) {
      prevBtn.style.display = (slideNum === 1) ? 'none' : 'block';
    }
    if (nextBtn) {
      if (slideNum === totalOnboardingSlides) {
        nextBtn.textContent = 'ダッシュボードへ';
      } else {
        nextBtn.textContent = '次へ';
      }
    }
  }

  window.nextSlide = function() {
    if (currentOnboardingSlide < totalOnboardingSlides) {
      currentOnboardingSlide++;
      showOnboardingSlide(currentOnboardingSlide);
    } else {
      closeOnboarding();
    }
  };

  window.prevSlide = function() {
    if (currentOnboardingSlide > 1) {
      currentOnboardingSlide--;
      showOnboardingSlide(currentOnboardingSlide);
    }
  };

  window.closeOnboarding = closeOnboarding;
  window.openOnboarding = openOnboarding;

})();