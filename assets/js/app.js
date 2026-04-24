(function() {
  const db = firebase.database();
  const storage = firebase.storage();

  let userEmail = '';
  let allUsersData = null;
  let allReportsData = null;
  let currentCalendarDate = new Date();

  document.addEventListener('DOMContentLoaded', () => {
    // Check if logged in
    const storedUser = localStorage.getItem('mirai_currentUser');
    if (!storedUser) {
      window.location.href = 'index.html';
      return;
    }

    userEmail = storedUser;

    // Real-time synchronization
    db.ref('mirai_users').on('value', snapshot => {
      allUsersData = snapshot.val() || {};
      renderDashboard();
    });

    db.ref('mirai_reports').on('value', snapshot => {
      allReportsData = [];
      snapshot.forEach(child => {
        allReportsData.push({ id: child.key, ...child.val() });
      });
      renderCommunityPhotos();
    });

    // Attach Event Listeners (Security hardening)
    document.body.addEventListener('click', (e) => {
      const target = e.target.closest('.btn-earn, .btn-logout, .btn-prev-month, .btn-next-month, .btn-submit-report, .btn-send-feedback');
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
    });

    renderDashboard();
  });

  // Helper to find the closest element matching a selector (for event delegation)
  // Re-implementing a simple version since e.path is non-standard
  if (!Element.prototype.closest) {
      Element.prototype.closest = function(s) {
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
    db.ref('mirai_users/' + userKey).set(data);
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
          <div class="glass-panel" style="background: rgba(220, 38, 38, 0.1); border-color: rgba(220, 38, 38, 0.4); margin-bottom: 1.5rem; padding: 1rem; color: #ef4444;">
            <p style="font-weight: 800; font-size: 1rem; margin-bottom: 0.25rem;">警告！</p>
            <p style="font-size: 0.875rem;">${data.warning}</p>
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
          month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
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
    const userList = Object.keys(allUsersData).map(key => ({
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
    if (action === 'デイリーチェックイン') {
      const todayObj = new Date();
      const todayStr = todayObj.toDateString();
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
    }

    const entry = {
      action: action,
      amount: amount,
      timestamp: new Date().toISOString()
    };
    data.points = (data.points || 0) + amount;
    data.history = data.history || [];
    data.history.push(entry);
    saveUserData(email, data);
  }

  function logout() {
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

    const file = selectedFile;
    if(file.size > 6 * 1024 * 1024) { 
      alert('画像サイズは6MB以下にしてください。');
      return;
    }

    const { email, data } = getUserData();
    const storageRef = storage.ref('reports/' + Date.now() + "_" + file.name);
    storageRef.put(file).then(snapshot => {
      return snapshot.ref.getDownloadURL();
    }).then(url => {
      const newReport = {
        email: email,
        name: data.name,
        title: title,
        points: points,
        image: url,
        timestamp: new Date().toISOString(),
        status: 'approved'
      };
      return db.ref('mirai_reports').push(newReport);
    }).then(() => {
      titleInput.value = '';
      if (fileInputImage) fileInputImage.value = '';
      if (fileInputCamera) fileInputCamera.value = '';
      const nameLabel = document.getElementById('selected-file-name');
      if (nameLabel) nameLabel.innerText = '写真が選択されていません';
      earnPoints(`[写真報告] ${title}`, points);
      alert(`「${title}」の報告が完了し、${points}pt獲得しました！`);
    }).catch(error => {
      console.error(error);
      alert('写真のアップロードに失敗しました。');
    });
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

})();
