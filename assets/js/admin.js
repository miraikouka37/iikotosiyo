// admin.js
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

let allUsersData = null;
let allFeedbacksData = [];
let allReportsData = [];

document.addEventListener('DOMContentLoaded', () => {
  // Check if logged in and is admin
  const currentUserStr = localStorage.getItem('mirai_currentUser');
  if (!currentUserStr) {
    window.location.href = 'index.html';
    return;
  }

  const currentUser = JSON.parse(currentUserStr);
  if (currentUser.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  // Realtime Database Listeners
  db.ref('mirai_users').on('value', snapshot => {
    allUsersData = snapshot.val() || {};
    renderAdminUsers();
  });

  db.ref('mirai_feedbacks').on('value', snapshot => {
    allFeedbacksData = [];
    snapshot.forEach(child => {
      allFeedbacksData.push({ id: child.key, ...child.val() });
    });
    renderFeedbacks();
  });

  db.ref('mirai_reports').on('value', snapshot => {
    allReportsData = [];
    snapshot.forEach(child => {
      allReportsData.push({ id: child.key, ...child.val() });
    });
    renderReports();
  });
});

function renderAdminUsers() {
  const tbody = document.getElementById('admin-user-list');
  tbody.innerHTML = '';

  if (!allUsersData) return;

  const users = allUsersData;
  const keys = Object.keys(users);

  if (keys.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">ユーザーが登録されていません</td></tr>';
    return;
  }

  keys.forEach(key => {
    if (checkYearlyReset(users[key])) {
       db.ref('mirai_users/' + key).set(users[key]);
    }
  });

  keys.forEach(key => {
    const user = users[key];
    const email = user.email || key.replace(/_/g, '.');

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';

    tr.innerHTML = `
      <td style="padding: 1rem; font-weight: bold;">${user.name}</td>
      <td style="padding: 1rem; color: var(--text-muted);">${email}</td>
      <td style="padding: 1rem; font-weight: bold; color: var(--accent-primary);">${user.points || 0} pt</td>
      <td style="padding: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-outline btn-sm" onclick="viewHistory('${key}')">履歴を見る</button>
        <button class="btn btn-outline btn-sm" onclick="editPoints('${key}')">ポイント編集</button>
        <button class="btn btn-primary btn-sm" style="background:var(--danger); border:none; box-shadow:none;" onclick="deleteUser('${key}')">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editPoints(key) {
  const user = allUsersData[key];
  if(!user) return;
  const currentPoints = user.points || 0;

  const newPointsStr = prompt(`${user.name} の新しいポイント数を入力してください:`, currentPoints);

  if (newPointsStr !== null) {
    const newPoints = parseInt(newPointsStr, 10);
    if (!isNaN(newPoints)) {
      user.points = newPoints;

      user.history = user.history || [];
      user.history.push({
        action: '管理者によるポイント修正',
        amount: newPoints - currentPoints,
        timestamp: new Date().toISOString()
      });

      db.ref('mirai_users/' + key).set(user).then(() => {
        alert('ポイントを更新しました。');
      });
    } else {
      alert('有効な数値を入力してください。');
    }
  }
}

function deleteUser(key) {
  const user = allUsersData[key];
  if(!user) return;

  if (confirm(`本当に ${user.name} を削除しますか？\nこの操作は取り消せません。`)) {
    db.ref('mirai_users/' + key).remove();
  }
}

function renderFeedbacks() {
  const list = document.getElementById('admin-feedback-list');
  if (!list) return;
  list.innerHTML = '';

  const feedbacks = allFeedbacksData;
  if (feedbacks.length === 0) {
    list.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">意見はまだありません</li>';
    return;
  }

  const reversedFeedbacks = [...feedbacks].reverse();

  reversedFeedbacks.forEach((fb) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';
    li.style.gap = '0.5rem';

    const dateStr = new Date(fb.timestamp).toLocaleString('ja-JP', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    li.innerHTML = `
      <div style="display: flex; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
        <span style="font-weight: bold; color: var(--accent-primary);">${fb.name} <span style="font-size: 0.8rem; color: var(--text-muted);">(${fb.email})</span></span>
        <span style="font-size: 0.875rem; color: var(--text-muted);">${dateStr}</span>
      </div>
      <div style="font-size: 1rem; line-height: 1.5; white-space: pre-wrap; width: 100%;">${fb.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <div style="width: 100%; text-align: right; margin-top: 0.5rem;">
         <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger);" onclick="deleteFeedback('${fb.id}')">削除</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function deleteFeedback(id) {
  if (confirm('この意見を削除しますか？')) {
    db.ref('mirai_feedbacks/' + id).remove();
  }
}

function renderReports() {
  const container = document.getElementById('admin-report-list');
  if (!container) return;
  container.innerHTML = '';

  const reports = allReportsData;
  const visibleReports = reports.filter(r => r.status === 'approved');

  if (visibleReports.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">現在、履歴はありません</div>';
    return;
  }

  const reversedReports = [...visibleReports].reverse();

  reversedReports.forEach(report => {
    const dateStr = new Date(report.timestamp).toLocaleString('ja-JP');

    const card = document.createElement('div');
    card.style.background = 'rgba(0,0,0,0.2)';
    card.style.border = '1px solid var(--glass-border)';
    card.style.borderRadius = '12px';
    card.style.padding = '1.5rem';
    card.style.display = 'flex';
    card.style.gap = '1.5rem';
    card.style.flexWrap = 'wrap';

    card.innerHTML = `
      <div style="flex: 1; min-width: 250px;">
        <h4 style="margin-bottom: 0.5rem; color: var(--accent-primary);">${report.title}</h4>
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">報告者: <span style="color: #fff; font-weight:bold;">${report.name}</span> (${report.email})</p>
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">報告日時: ${dateStr}</p>
        <p style="font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem;">獲得ポイント: <span style="color: var(--success);">+${report.points} pt</span></p>
        <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger);" onclick="deleteReport('${report.id}')">写真記録を削除</button>
      </div>
      <div>
        <img src="${report.image}" style="max-height: 200px; max-width: 300px; object-fit: contain; border-radius: 8px; border: 1px solid var(--glass-border);" alt="添付写真">
      </div>
    `;
    container.appendChild(card);
  });
}

function logout() {
  localStorage.removeItem('mirai_currentUser');
  window.location.href = 'index.html';
}

function deleteReport(id) {
  const targetReport = allReportsData.find(r => r.id === id);
  if (!targetReport) return;

  if (confirm(`この記録（写真）を削除し、${targetReport.name}さんの獲得ポイントから ${targetReport.points}pt マイナスしますか？`)) {
    const safeEmail = targetReport.email.replace(/\./g, '_');
    db.ref('mirai_users/' + safeEmail).once('value').then(snapshot => {
      const user = snapshot.val();
      if (user) {
        user.points = Math.max(0, (user.points || 0) - targetReport.points);
        user.history = user.history || [];
        user.history.push({
          action: `[管理者取消] 写真報告: ${targetReport.title}`,
          amount: -targetReport.points,
          timestamp: new Date().toISOString()
        });
        db.ref('mirai_users/' + safeEmail).set(user);
      }
    });

    db.ref('mirai_reports/' + id).remove().then(() => {
      alert(`削除し、${targetReport.points}pt をマイナスしました。`);
    });
  }
}



function viewHistory(key) {
  const user = allUsersData[key];
  if (!user) return;

  const modal = document.getElementById('history-modal');
  const title = document.getElementById('history-modal-title');
  const list = document.getElementById('history-modal-list');

  title.innerText = `${user.name} さんの獲得詳細`;
  list.innerHTML = '';

  const history = user.history || [];
  if (history.length === 0) {
    list.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">履歴はありません</li>';
  } else {
    const reversed = [...history].reverse();
    reversed.forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-item';
      
      const dateStr = new Date(item.timestamp).toLocaleString('ja-JP', {
        month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
      });
      
      const isNegative = item.amount < 0;
      const amountStr = isNegative ? `${item.amount} pt` : `+${item.amount} pt`;
      const pointsColor = isNegative ? 'var(--danger)' : 'var(--success)';

      li.innerHTML = `
        <div class="item-info">
          <h4 style="font-size: 1rem;">${item.action}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</p>
        </div>
        <div style="font-weight: bold; font-size: 1.1rem; color: ${pointsColor};">${amountStr}</div>
      `;
      list.appendChild(li);
    });
  }

  modal.style.display = 'flex';
}

function closeHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) modal.style.display = 'none';
}
