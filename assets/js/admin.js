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

  renderAdminUsers();
  renderFeedbacks();
  renderReports();
});

function renderAdminUsers() {
  const usersStr = localStorage.getItem('mirai_users');
  const tbody = document.getElementById('admin-user-list');
  tbody.innerHTML = '';

  if (!usersStr) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">ユーザーが登録されていません</td></tr>';
    return;
  }

  const users = JSON.parse(usersStr);
  let usersChanged = false;

  const emails = Object.keys(users);

  if (emails.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">ユーザーが登録されていません</td></tr>';
    return;
  }

  emails.forEach(email => {
    if (checkYearlyReset(users[email])) {
        usersChanged = true;
    }
  });

  if (usersChanged) {
      localStorage.setItem('mirai_users', JSON.stringify(users));
  }

  emails.forEach(email => {
    const user = users[email];

    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';

    tr.innerHTML = `
      <td style="padding: 1rem; font-weight: bold;">${user.name}</td>
      <td style="padding: 1rem; color: var(--text-muted);">${email}</td>
      <td style="padding: 1rem; font-weight: bold; color: var(--accent-primary);">${user.points || 0} pt</td>
      <td style="padding: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-outline btn-sm" onclick="viewHistory('${email}')">履歴を見る</button>
        <button class="btn btn-outline btn-sm" onclick="editPoints('${email}')">ポイント編集</button>
        <button class="btn btn-primary btn-sm" style="background:var(--danger); border:none; box-shadow:none;" onclick="deleteUser('${email}')">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editPoints(email) {
  const users = JSON.parse(localStorage.getItem('mirai_users'));
  const currentPoints = users[email].points || 0;

  const newPointsStr = prompt(`${users[email].name} の新しいポイント数を入力してください:`, currentPoints);

  if (newPointsStr !== null) {
    const newPoints = parseInt(newPointsStr, 10);
    if (!isNaN(newPoints)) {
      users[email].points = newPoints;

      // Points history (admin adjustment)
      users[email].history = users[email].history || [];
      users[email].history.push({
        action: '管理者によるポイント修正',
        amount: newPoints - currentPoints,
        timestamp: new Date().toISOString()
      });

      localStorage.setItem('mirai_users', JSON.stringify(users));
      renderAdminUsers();
      alert('ポイントを更新しました。');
    } else {
      alert('有効な数値を入力してください。');
    }
  }
}

function deleteUser(email) {
  const users = JSON.parse(localStorage.getItem('mirai_users'));
  const userName = users[email].name;

  if (confirm(`本当に ${userName} (${email}) を削除しますか？\nこの操作は取り消せません。`)) {
    delete users[email];
    localStorage.setItem('mirai_users', JSON.stringify(users));
    renderAdminUsers();
  }
}

function renderFeedbacks() {
  const feedbacksStr = localStorage.getItem('mirai_feedbacks');
  const list = document.getElementById('admin-feedback-list');
  if (!list) return;
  list.innerHTML = '';

  if (!feedbacksStr) {
    list.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">意見はまだありません</li>';
    return;
  }

  const feedbacks = JSON.parse(feedbacksStr);
  if (feedbacks.length === 0) {
    list.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">意見はまだありません</li>';
    return;
  }

  const reversedFeedbacks = [...feedbacks].reverse();

  reversedFeedbacks.forEach((fb, index) => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';
    li.style.gap = '0.5rem';

    const dateStr = new Date(fb.timestamp).toLocaleString('ja-JP', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // original index in the feedbacks array before reversing
    const originalIndex = feedbacks.length - 1 - index;

    li.innerHTML = `
      <div style="display: flex; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
        <span style="font-weight: bold; color: var(--accent-primary);">${fb.name} <span style="font-size: 0.8rem; color: var(--text-muted);">(${fb.email})</span></span>
        <span style="font-size: 0.875rem; color: var(--text-muted);">${dateStr}</span>
      </div>
      <div style="font-size: 1rem; line-height: 1.5; white-space: pre-wrap; width: 100%;">${fb.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <div style="width: 100%; text-align: right; margin-top: 0.5rem;">
         <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger);" onclick="deleteFeedback(${originalIndex})">削除</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function deleteFeedback(originalIndex) {
  const feedbacks = JSON.parse(localStorage.getItem('mirai_feedbacks')) || [];
  if (confirm('この意見を削除しますか？')) {
    feedbacks.splice(originalIndex, 1);
    localStorage.setItem('mirai_feedbacks', JSON.stringify(feedbacks));
    renderFeedbacks();
  }
}

function renderReports() {
  const reportsStr = localStorage.getItem('mirai_reports');
  const container = document.getElementById('admin-report-list');
  if (!container) return;
  container.innerHTML = '';

  if (!reportsStr) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">現在、履歴はありません</div>';
    return;
  }

  const reports = JSON.parse(reportsStr);
  const visibleReports = reports.filter(r => r.status === 'approved');

  if (visibleReports.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">現在、履歴はありません</div>';
    return;
  }

  const reversedReports = [...visibleReports].reverse();

  reversedReports.forEach(report => {
    const originalIndex = reports.indexOf(report);
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
        <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger);" onclick="deleteReport(${originalIndex})">写真記録を削除</button>
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

function deleteReport(index) {
  const reports = JSON.parse(localStorage.getItem('mirai_reports')) || [];
  const targetReport = reports[index];
  
  if (!targetReport) return;

  if (confirm(`この記録（写真）を削除し、${targetReport.name}さんの獲得ポイントから ${targetReport.points}pt マイナスしますか？`)) {
    // ユーザーのポイントを減らす処理
    const usersStr = localStorage.getItem('mirai_users');
    if (usersStr) {
      const users = JSON.parse(usersStr);
      if (users[targetReport.email]) {
        users[targetReport.email].points = Math.max(0, (users[targetReport.email].points || 0) - targetReport.points);
        
        // ポイント履歴にも取り消しとして記録を残す
        users[targetReport.email].history = users[targetReport.email].history || [];
        users[targetReport.email].history.push({
          action: `[管理者取消] 写真報告: ${targetReport.title}`,
          amount: -targetReport.points,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('mirai_users', JSON.stringify(users));
        
        // 管理者画面のユーザーリストを再描画してポイントを更新
        renderAdminUsers();
      }
    }

    // 記録の削除
    reports.splice(index, 1);
    localStorage.setItem('mirai_reports', JSON.stringify(reports));
    renderReports();
    
    alert(`削除し、${targetReport.points}pt をマイナスしました。`);
  }
}



function viewHistory(email) {
  const usersStr = localStorage.getItem('mirai_users');
  if (!usersStr) return;
  const users = JSON.parse(usersStr);
  const user = users[email];
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
