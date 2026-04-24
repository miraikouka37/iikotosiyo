// app.js
let currentCalendarDate = new Date();

let currentUserData = null;
let allUsersData = null;
let allReportsData = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check if logged in
  const currentUserStr = localStorage.getItem('mirai_currentUser');
  if (!currentUserStr) {
    window.location.href = 'index.html';
    return;
  }

  const currentUser = JSON.parse(currentUserStr);
  document.getElementById('display-name').innerText = currentUser.name;

  const safeEmail = currentUser.email.replace(/\./g, '_');

  // Firebase Realtime DB Listeners
  db.ref('mirai_users/' + safeEmail).on('value', snapshot => {
    currentUserData = snapshot.val() || {};
    // Ensure email is set
    if (!currentUserData.email) currentUserData.email = currentUser.email; 
    renderDashboard();
  });

  db.ref('mirai_users').on('value', snapshot => {
    allUsersData = snapshot.val() || {};
    renderRanking();
  });

  db.ref('mirai_reports').on('value', snapshot => {
    allReportsData = [];
    snapshot.forEach(child => {
      allReportsData.push(child.val());
    });
    renderCommunityPhotos();
  });
});

function getUserData() {
  const currentUser = JSON.parse(localStorage.getItem('mirai_currentUser'));
  return { 
    email: currentUser.email, 
    data: currentUserData 
  };
}

function saveUserData(email, data) {
  const safeEmail = email.replace(/\./g, '_');
  db.ref('mirai_users/' + safeEmail).set(data);
}

function checkYearlyReset(data) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed, 3 = April
  
  const schoolYear = (currentMonth >= 3) ? currentYear : currentYear - 1;

  if (!data.lastResetSchoolYear) {
    data.lastResetSchoolYear = schoolYear;
    return false;
  }

  if (schoolYear > data.lastResetSchoolYear) {
    const oldPoints = data.points || 0;
    data.history = data.history || [];
    data.history.push({
      action: `[年度更新] ${data.lastResetSchoolYear}年度分(${oldPoints}pt)がリセットされました`,
      amount: -oldPoints,
      timestamp: now.toISOString()
    });
    
    data.points = 0;
    data.checkInDates = [];
    data.lastResetSchoolYear = schoolYear;
    return true;
  }
  return false;
}

function renderDashboard() {
  const { email, data } = getUserData();
  
  if (checkYearlyReset(data)) {
    saveUserData(email, data);
    alert('🌸 新年度（4月）になりました！これまでのポイントが更新され新しくスタートしました。今年度も頑張りましょう！');
  }

  const userPoints = data.points || 0;
  
  // Update points display with counter animation
  const pointsDisplay = document.getElementById('total-points');
  animateValue(pointsDisplay, parseInt(pointsDisplay.innerText) || 0, userPoints, 500);

  const pointsMessage = document.getElementById('points-message');
  if (pointsMessage) {
    if (userPoints >= 20000) {
      pointsMessage.innerText = "ジュース獲得チャンス！？";
      pointsMessage.style.color = "#fff";
      pointsMessage.style.fontWeight = "700";
    } else {
      pointsMessage.innerText = "✨ KEEP IT UP!";
      pointsMessage.style.color = "var(--text-muted)";
      pointsMessage.style.fontWeight = "400";
    }
  }

  // Render history
  const historyContainer = document.getElementById('history-container');
  historyContainer.innerHTML = '';

  const history = data.history || [];
  
  if (history.length === 0) {
    historyContainer.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">履歴がありません</li>';
  } else {
    // Display top 5 recent items, reversed (newest first)
    const recentHistory = [...history].reverse().slice(0, 5);

    recentHistory.forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-item';
      
      // Format date
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

function renderCommunityPhotos() {
  const container = document.getElementById('community-photos-container');
  if (!container) return;

  if (!allReportsData) return;

  const reports = allReportsData.filter(r => r.status === 'approved');
  if (reports.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); width: 100%;">写真がありません</div>';
    return;
  }

  container.innerHTML = '';
  // Show newest first
  const reversedReports = [...reports].reverse();

  reversedReports.forEach(report => {
    const card = document.createElement('div');
    card.style.minWidth = '220px';
    card.style.background = '#0a0a0a';
    card.style.border = '1px solid var(--panel-border)';
    card.style.borderRadius = '8px';
    card.style.padding = '0.75rem';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.flexShrink = '0';

    card.innerHTML = `
      <img src="${report.image}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 4px; margin-bottom: 0.75rem;" alt="写真">
      <div style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.25rem; color: #fff;">${report.title}</div>
      <div style="font-size: 0.75rem; color: var(--text-muted);">by ${report.name}</div>
    `;
    container.appendChild(card);
  });
}

function renderRanking() {
  if (!allUsersData) return;
  const users = allUsersData;
  const rankingContainer = document.getElementById('ranking-container');
  if (!rankingContainer) return;

  rankingContainer.innerHTML = '';

  const userList = Object.keys(users).map(key => ({
    name: users[key].name,
    points: users[key].points || 0
  }));

  userList.sort((a, b) => b.points - a.points);

  userList.forEach((user, index) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    let rankIcon = `${index + 1}位`;
    if (index === 0) rankIcon = '1位';
    if (index === 1) rankIcon = '2位';
    if (index === 2) rankIcon = '3位';

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
  
  // デイリーポイントの1日1回制限
  if (action === 'デイリーチェックイン') {
    const todayObj = new Date();
    const todayStr = todayObj.toDateString();
    
    // adjust timezone offset to get local YYYY-MM-DD
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

  // Create history entry
  const entry = {
    action: action,
    amount: amount,
    timestamp: new Date().toISOString()
  };

  // Add points and history
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

  // Constraint: between 2000 and 2100
  if (currentCalendarDate.getFullYear() > 2100) {
    currentCalendarDate = new Date(2100, 11, 1);
  }
  if (currentCalendarDate.getFullYear() < 2000) {
    currentCalendarDate = new Date(2000, 0, 1);
  }

  renderCalendar();
}

function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  const monthYearLabel = document.getElementById('calendar-month-year');
  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  monthYearLabel.innerText = `${year}年 ${month + 1}月`;
  container.innerHTML = '';
  
  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
  daysOfWeek.forEach((d, i) => {
    const el = document.createElement('div');
    el.innerText = d;
    el.style.color = i === 0 ? 'var(--danger)' : 'var(--text-muted)';
    el.style.fontWeight = '600';
    el.style.fontSize = '0.75rem';
    el.style.paddingBottom = '0.75rem';
    container.appendChild(el);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    container.appendChild(document.createElement('div'));
  }

  const { data } = getUserData();
  const checkedInDates = data.checkInDates || [];
  
  if (data.lastCheckIn) {
      const d = new Date(data.lastCheckIn);
      if (!isNaN(d.getTime())) {
          const tzOffset = d.getTimezoneOffset() * 60000;
          const iso = new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
          if (!checkedInDates.includes(iso)) checkedInDates.push(iso);
      }
  }

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


// Helper for smooth number animation
function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function sendFeedback() {
  const messageInput = document.getElementById('feedback-message');
  const message = messageInput.value.trim();
  if (!message) {
    alert('意見を入力してください。');
    return;
  }

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
  const title = document.getElementById('report-title').value.trim();
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

  // Upload file to Firebase Storage
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
    document.getElementById('report-title').value = '';
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
