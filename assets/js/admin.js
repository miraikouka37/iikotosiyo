(function() {
  const db = firebase.database();

  let currentRankView = 'total';
  let userSearchTerm = '';
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

    db.ref('mirai_feedbacks').limitToLast(50).on('value', snapshot => {
      allFeedbacksData = [];
      snapshot.forEach(child => {
        allFeedbacksData.push({ id: child.key, ...child.val() });
      });
      renderFeedbacks();
    });

    db.ref('mirai_reports').limitToLast(50).on('value', snapshot => {
      allReportsData = [];
      snapshot.forEach(child => {
        allReportsData.push({ id: child.key, ...child.val() });
      });
      renderReports();
    });

    // Event Delegation for Table Actions
    const tbody = document.getElementById('admin-user-list');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const key = btn.getAttribute('data-key');
        if (!action || !key) return;

        if (action === 'history') viewHistory(key);
        if (action === 'edit') editPoints(key);
        if (action === 'warning') sendWarning(key);
        if (action === 'delete') deleteUser(key);
      });
    }

    // Search bar listener
    const searchInput = document.getElementById('user-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        userSearchTerm = e.target.value.toLowerCase();
        renderAdminUsers();
      });
    }

    // Tab switcher
    document.querySelectorAll('.rank-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.id.replace('tab-', '').replace('surge-', '');
            switchRankTab(type);
        });
    });
  });

  function switchRankTab(type) {
    currentRankView = type;
    const tabs = {
      'total': document.getElementById('tab-total'),
      '24h': document.getElementById('tab-surge-24h'),
      '7d': document.getElementById('tab-surge-7d'),
      '30d': document.getElementById('tab-surge-30d')
    };

    Object.keys(tabs).forEach(key => {
      const tab = tabs[key];
      if (!tab) return;
      if (key === type) {
        tab.style.borderBottomColor = '#fff';
        tab.style.fontWeight = '700';
        tab.style.color = '#fff';
      } else {
        tab.style.borderBottomColor = 'transparent';
        tab.style.fontWeight = '400';
        tab.style.color = 'var(--text-muted)';
      }
    });

    const header = document.getElementById('points-header');
    if (header) {
      if (type === 'total') header.innerText = '保有ポイント';
      else header.innerText = `増加分 (${type})`;
    }

    renderAdminUsers();
  }

  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
  }

  function renderAdminUsers() {
    const tbody = document.getElementById('admin-user-list');
    if (!tbody || !allUsersData) return;
    tbody.innerHTML = '';

    const users = allUsersData;
    const keys = Object.keys(users).filter(key => !key.startsWith('{'));

    const userList = keys.map(key => {
      const user = users[key];
      let displayValue = 0;

      if (currentRankView === 'total') {
        displayValue = user.points || 0;
      } else {
        const now = new Date();
        const cutoff = new Date();
        if (currentRankView === '24h') cutoff.setHours(now.getHours() - 24);
        else if (currentRankView === '7d') cutoff.setDate(now.getDate() - 7);
        else if (currentRankView === '30d') cutoff.setDate(now.getDate() - 30);

        const history = user.history || [];
        displayValue = history
          .filter(h => new Date(h.timestamp) > cutoff)
          .reduce((sum, h) => sum + h.amount, 0);
      }
      return { key, displayValue, name: user.name || '不明', email: user.email || key.replace(/_/g, '.') };
    });

    const filteredList = userList.filter(u => 
      u.name.toLowerCase().includes(userSearchTerm) || 
      u.email.toLowerCase().includes(userSearchTerm)
    );

    if (filteredList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem;">ユーザーが見つかりません</td></tr>';
      return;
    }

    const sortedList = filteredList.sort((a, b) => b.displayValue - a.displayValue);
    const globalSortedKeys = [...userList].sort((a, b) => b.displayValue - a.displayValue).map(u => u.key);

    sortedList.forEach((u) => {
      const overallRank = globalSortedKeys.indexOf(u.key) + 1;
      const user = users[u.key];

      const safeKey = escapeHTML(u.key);
      const safeName = escapeHTML(u.name);
      const safeEmail = escapeHTML(u.email);

      let isWarningActive = false;
      if (user.warning) {
        if (typeof user.warning === 'string') {
          isWarningActive = true;
        } else if (user.warning.message && (Date.now() - user.warning.timestamp < 24 * 60 * 60 * 1000)) {
          isWarningActive = true;
        }
      }

      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--panel-border)';
      tr.innerHTML = `
        <td style="padding: 1rem; color: var(--text-muted); font-size: 0.8125rem;">${overallRank}</td>
        <td style="padding: 1rem; font-weight: 600;">${safeName}</td>
        <td style="padding: 1rem; color: var(--text-muted); font-size: 0.875rem;">${safeEmail}</td>
        <td style="padding: 1rem; font-weight: 700;">${u.displayValue} pt</td>
        <td style="padding: 1rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; min-width: 200px;">
            <button class="btn btn-outline btn-sm" data-action="history" data-key="${safeKey}">履歴</button>
            <button class="btn btn-outline btn-sm" data-action="edit" data-key="${safeKey}">編集</button>
            <button class="btn btn-outline btn-sm" style="color: var(--danger);" data-action="warning" data-key="${safeKey}">${isWarningActive ? '警告中' : '警告'}</button>
            <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger);" data-action="delete" data-key="${safeKey}">削除</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function editPoints(key) {
    const user = allUsersData[key];
    if(!user) return;
    const currentPoints = user.points || 0;
    const newPointsStr = prompt(`${user.name} の合計ポイントを入力:`, currentPoints);
    if (newPointsStr !== null) {
      const newPoints = parseInt(newPointsStr, 10);
      if (!isNaN(newPoints)) {
        user.points = newPoints;
        user.history = user.history || [];
        user.history.push({ action: '管理者修正', amount: newPoints - currentPoints, timestamp: new Date().toISOString() });
        db.ref('mirai_users/' + key).set(user).then(() => alert('更新完了'));
      }
    }
  }

  function deleteUser(key) {
    const user = allUsersData[key];
    const name = user ? user.name : 'このユーザー';
    if (confirm(`本当に ${name} を削除しますか？`)) {
      db.ref('mirai_users/' + key).remove().then(() => alert('削除しました。'));
    }
  }

  function sendWarning(key) {
    const user = allUsersData[key];
    if (!user) return;
    
    let currentWarning = '';
    if (user.warning) {
      if (typeof user.warning === 'string') {
        currentWarning = user.warning;
      } else if (user.warning.message && (Date.now() - user.warning.timestamp < 24 * 60 * 60 * 1000)) {
        currentWarning = user.warning.message;
      }
    }

    const message = prompt(`${user.name} への警告メッセージ（空欄で解除）:`, currentWarning);
    if (message !== null) {
      if (message.trim() === '') {
        db.ref(`mirai_users/${key}/warning`).remove().then(() => alert('警告解除'));
      } else {
        db.ref(`mirai_users/${key}/warning`).set({
          message: message.trim(),
          timestamp: Date.now()
        }).then(() => alert('警告保存'));
      }
    }
  }

  function renderFeedbacks() {
    const list = document.getElementById('admin-feedback-list');
    if (!list) return;
    list.innerHTML = '';
    if (allFeedbacksData.length === 0) {
      list.innerHTML = '<li class="list-item" style="justify-content: center;">意見はありません</li>';
      return;
    }
    [...allFeedbacksData].reverse().forEach(fb => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.innerHTML = `
        <div class="item-info">
          <h4>${fb.name} (${fb.email})</h4>
          <p>${fb.message}</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="db.ref('mirai_feedbacks/${fb.id}').remove()">削除</button>
      `;
      list.appendChild(li);
    });
  }

  function renderReports() {
    const list = document.getElementById('admin-report-list');
    if (!list) return;
    list.innerHTML = '';
    if (allReportsData.length === 0) {
      list.innerHTML = '<li class="list-item" style="justify-content: center;">報告はありません</li>';
      return;
    }
    allReportsData.forEach(rp => {
      const li = document.createElement('li');
      li.className = 'list-item';
      li.style.flexDirection = 'column';
      li.style.alignItems = 'flex-start';
      li.innerHTML = `
        <div style="width: 100%; display: flex; justify-content: space-between; margin-bottom: 1rem;">
          <div>
            <h4 style="font-size: 1.1rem;">${rp.title}</h4>
            <p>${rp.name} (${rp.email})</p>
          </div>
          <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="db.ref('mirai_reports/${rp.id}').remove()">削除</button>
        </div>
        <img src="${rp.image}" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 1rem;">
      `;
      list.appendChild(li);
    });
  }

  function viewHistory(key) {
    const user = allUsersData[key];
    if (!user) return;
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('modal-history-list');
    document.getElementById('modal-user-name').innerText = `${user.name} の履歴`;
    list.innerHTML = '';
    const history = user.history || [];
    if (history.length === 0) {
      list.innerHTML = '<li class="list-item">履歴なし</li>';
    } else {
      [...history].reverse().forEach(item => {
        const li = document.createElement('li');
        li.className = 'list-item';
        li.innerHTML = `<div><h4>${item.action}</h4></div><div>${item.amount} pt</div>`;
        list.appendChild(li);
      });
    }
    modal.style.display = 'flex';
  }

  window.closeHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'none';
  };

  // Needed for inline onclick in Feedback/Reports if we don't delegate them yet
  window.db = db;

})();
