(function() {
  const db = firebase.database();

  let currentRankView = 'total';
  let userSearchTerm = '';
  let allUsersData = null;
  let allFeedbacksData = [];
  let allReportsData = [];
  let allRecommendationsData = [];
  let allLostItemsData = [];

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
    }, handleDatabaseError);

    db.ref('mirai_feedbacks').limitToLast(50).on('value', snapshot => {
      allFeedbacksData = [];
      snapshot.forEach(child => {
        allFeedbacksData.push({ id: child.key, ...child.val() });
      });
      renderFeedbacks();
    }, handleDatabaseError);

    db.ref('mirai_reports').limitToLast(50).on('value', snapshot => {
      allReportsData = [];
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      snapshot.forEach(child => {
        const data = child.val();
        const reportTime = new Date(data.timestamp).getTime();
        
        if (now - reportTime > sevenDays) {
          db.ref('mirai_reports/' + child.key).remove().catch(e => console.error(e));
        } else {
          allReportsData.push({ id: child.key, ...data });
        }
      });
      renderReports();
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
        if (action === 'edit-rank') editRank(key);
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

  window.switchRankTab = function(type) {
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
        tab.style.borderBottomColor = 'var(--accent)';
        tab.style.fontWeight = '700';
        tab.style.color = 'var(--accent)';
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
      const rp = user.rankPoints || 0;
      const totalRP = user.totalRankPoints || 0;
      const rankBadge = `<span class="rank-badge rank-${user.rank || 'E'}" onclick="window.showRankProgressAlert('${user.rank || 'E'}',${rp},${totalRP})" style="cursor:pointer;">${user.rank || 'E'}</span>`;
      tr.innerHTML = `
        <td style="padding: 1rem; color: var(--text-muted); font-size: 0.8125rem;">${overallRank}</td>
        <td style="padding: 1rem; font-weight: 600;">${rankBadge}${safeName}</td>
        <td style="padding: 1rem; color: var(--text-muted); font-size: 0.875rem;">${safeEmail}</td>
        <td style="padding: 1rem; font-weight: 700;">${u.displayValue} pt</td>
        <td style="padding: 1rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; min-width: 200px;">
            <button class="btn btn-outline btn-sm" data-action="history" data-key="${safeKey}">履歴</button>
            <button class="btn btn-outline btn-sm" data-action="edit" data-key="${safeKey}">編集</button>
            <button class="btn btn-outline btn-sm" style="color: var(--accent);" data-action="edit-rank" data-key="${safeKey}">ランク編集</button>
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
    if (!user) return;
    const currentPoints = user.points || 0;
    const newPointsStr = prompt(`${user.name} の合計ポイントを入力:`, currentPoints);
    if (newPointsStr !== null) {
      const newPoints = parseInt(newPointsStr, 10);
      if (!isNaN(newPoints)) {
        user.points = newPoints;
        user.history = user.history || [];
        user.history.push({ action: '管理者修正', amount: newPoints - currentPoints, timestamp: new Date().toISOString() });
        db.ref('mirai_users/' + key).set(user).then(() => alert('更新完了')).catch(handleDatabaseError);
      }
    }
  }

  function editRank(key) {
    const user = allUsersData[key];
    if (!user) return;

    const rankOrder = ['E', 'D', 'C', 'B', 'A', 'S'];
    const rankRequirements = { 'E': 1, 'D': 1, 'C': 3, 'B': 3, 'A': 5, 'S': '∞' };

    const currentRank = user.rank || 'E';
    const currentRP = user.rankPoints || 0;
    const currentTotalRP = user.totalRankPoints || 0;

    const rankChoices = rankOrder.map(r => `${r}（次まで${rankRequirements[r]}RP）`).join('\n');
    const newRankStr = prompt(
      `【${user.name}】のランクを変更\n\n現在: ${currentRank}ランク (RP: ${currentRP} / 累計: ${currentTotalRP})\n\n変更後のランクを入力 (E / D / C / B / A / S):\n\n${rankChoices}`,
      currentRank
    );
    if (newRankStr === null) return;
    const newRank = newRankStr.trim().toUpperCase();
    if (!rankOrder.includes(newRank)) {
      alert('無効なランクです。E / D / C / B / A / S のいずれかを入力してください。');
      return;
    }

    const newRPStr = prompt(
      `【${user.name}】の現在のランクポイント（RP）を入力:\n（${newRank}ランク内での現在のRP）`,
      newRank === currentRank ? currentRP : 0
    );
    if (newRPStr === null) return;
    const newRP = parseInt(newRPStr, 10);
    if (isNaN(newRP) || newRP < 0) {
      alert('無効な値です。0以上の整数を入力してください。');
      return;
    }

    const newTotalRPStr = prompt(
      `【${user.name}】の累計ランクポイントを入力:\n（変更しない場合はそのままOKを押してください）`,
      currentTotalRP
    );
    if (newTotalRPStr === null) return;
    const newTotalRP = parseInt(newTotalRPStr, 10);
    if (isNaN(newTotalRP) || newTotalRP < 0) {
      alert('無効な値です。0以上の整数を入力してください。');
      return;
    }

    user.rank = newRank;
    user.rankPoints = newRP;
    user.totalRankPoints = newTotalRP;
    user.history = user.history || [];
    user.history.push({
      action: `【管理者】ランク修正: ${currentRank}→${newRank} (RP: ${currentRP}→${newRP})`,
      amount: 0,
      timestamp: new Date().toISOString()
    });
    if (user.history.length > 150) {
      user.history = user.history.slice(user.history.length - 150);
    }

    db.ref('mirai_users/' + key).set(user)
      .then(() => alert(`${user.name} のランクを ${newRank} (RP: ${newRP}) に更新しました！`))
      .catch(handleDatabaseError);
  }

  function deleteUser(key) {
    const user = allUsersData[key];
    const name = user ? user.name : 'このユーザー';
    if (confirm(`本当に ${name} を削除しますか？`)) {
      db.ref('mirai_users/' + key).remove().then(() => alert('削除しました。')).catch(handleDatabaseError);
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
        db.ref(`mirai_users/${key}/warning`).remove().then(() => alert('警告解除')).catch(handleDatabaseError);
      } else {
        db.ref(`mirai_users/${key}/warning`).set({
          message: message.trim(),
          timestamp: Date.now()
        }).then(() => alert('警告保存')).catch(handleDatabaseError);
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

  function renderLostItems() {
    const list = document.getElementById('admin-lost-items-list');
    if (!list) return;
    list.innerHTML = '';
    if (allLostItemsData.length === 0) {
      list.innerHTML = '<li class="list-item" style="justify-content: center;">忘れ物のお知らせはありません</li>';
      return;
    }
    [...allLostItemsData].reverse().forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-item';
      const dateStr = new Date(item.timestamp).toLocaleString('ja-JP', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const safeName = escapeHTML(item.itemName);
      const safeLocation = escapeHTML(item.location);
      const safeReporter = escapeHTML(item.reporterName);
      const safeEmail = escapeHTML(item.reporterEmail);
      
      li.innerHTML = `
        <div class="item-info">
          <h4>${safeName} (場所: ${safeLocation})</h4>
          <p>投稿者: ${safeReporter} (${safeEmail}) | 投稿日時: ${dateStr}</p>
        </div>
        <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger); width: auto;" onclick="deleteLostItem('${escapeHTML(item.id)}')">削除</button>
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
            <h4 style="font-size: 1.1rem;">${escapeHTML(rp.title)}</h4>
            <p>${escapeHTML(rp.name)} (${escapeHTML(rp.email)})</p>
          </div>
          <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="deleteReport('${escapeHTML(rp.id)}', '${escapeHTML(rp.email)}', ${rp.points}, '${escapeHTML(rp.title)}')">削除</button>
        </div>
        <img src="${rp.image}" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 1rem; cursor: pointer;" onclick="openImageModal('${rp.image}')">
      `;
      list.appendChild(li);
    });
  }

  function viewHistory(key) {
    const user = allUsersData[key];
    if (!user) return;
    const modal = document.getElementById('history-modal');
    const list = document.getElementById('history-modal-list');
    const title = document.getElementById('history-modal-title');
    if (title) title.innerText = `${user.name} の履歴`;
    if (list) {
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
    }
    modal.style.display = 'flex';
  }

  window.closeHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'none';
  };

  window.deleteReport = function(id, email, points, title) {
    if (confirm(`「${title}」の報告を削除し、獲得した ${points}pt をユーザーから没収しますか？`)) {
      db.ref('mirai_reports/' + id).remove().then(() => {
        const userKey = email.replace(/\./g, '_');
        const user = allUsersData[userKey];
        if (user) {
          user.points = (user.points || 0) - points;
          user.history = user.history || [];
          user.history.push({
            action: `[取消] ${title}`,
            amount: -points,
            timestamp: new Date().toISOString()
          });
          if (user.history.length > 150) {
            user.history = user.history.slice(user.history.length - 150);
          }
          db.ref('mirai_users/' + userKey).set(user);
        }
        alert('写真の削除とポイントの没収が完了しました。');
      }).catch(err => {
        console.error(err);
        alert('削除に失敗しました。');
      });
    }
  };

  function renderRecommendations() {
    const list = document.getElementById('admin-recommendation-list');
    if (list) {
      list.innerHTML = '';
      const pendingRecs = allRecommendationsData.filter(r => r.status === 'pending');
      
      if (pendingRecs.length === 0) {
        list.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">保留中の推薦はありません</li>';
      } else {
        pendingRecs.forEach(rec => {
          const li = document.createElement('li');
          li.className = 'list-item';
          li.style.flexDirection = 'column';
          li.style.alignItems = 'flex-start';
          
          const dateStr = new Date(rec.timestamp).toLocaleString('ja-JP', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          
          const safeId = escapeHTML(rec.id);
          const safeSenderName = escapeHTML(rec.senderName);
          const safeSenderEmail = escapeHTML(rec.senderEmail);
          const safeReceiverName = escapeHTML(rec.receiverName);
          const safeReceiverEmail = escapeHTML(rec.receiverEmail);
          const safeReason = escapeHTML(rec.reason);
          
          li.innerHTML = `
            <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <h4 style="font-size: 0.95rem; margin-bottom: 0.25rem;">
                  <span style="color: var(--success); font-weight: 700;">${safeReceiverName}</span> (${safeReceiverEmail})
                </h4>
                <p style="font-size: 0.75rem; color: var(--text-muted);">推薦者: ${safeSenderName} (${safeSenderEmail}) | ${dateStr}</p>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-primary btn-sm" style="background: var(--success); color: #fff; width: auto;" onclick="approveRecommendation('${safeId}')">承認</button>
                <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger); width: auto;" onclick="rejectRecommendation('${safeId}')">却下</button>
              </div>
            </div>
            <p style="font-size: 0.875rem; color: var(--text-main); margin-top: 0.25rem; white-space: pre-wrap; word-break: break-all; width: 100%;">${safeReason}</p>
          `;
          list.appendChild(li);
        });
      }
    }

    const approvedList = document.getElementById('admin-approved-recommendation-list');
    if (approvedList) {
      approvedList.innerHTML = '';
      const approvedRecs = allRecommendationsData.filter(r => r.status === 'approved');
      if (approvedRecs.length === 0) {
        approvedList.innerHTML = '<li class="list-item" style="justify-content: center; color: var(--text-muted);">承認済みの推薦はありません</li>';
      } else {
        const sortedApproved = [...approvedRecs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        sortedApproved.forEach(rec => {
          const li = document.createElement('li');
          li.className = 'list-item';
          li.style.flexDirection = 'column';
          li.style.alignItems = 'flex-start';
          
          const dateStr = new Date(rec.timestamp).toLocaleString('ja-JP', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          
          const safeId = escapeHTML(rec.id);
          const safeSenderName = escapeHTML(rec.senderName);
          const safeSenderEmail = escapeHTML(rec.senderEmail);
          const safeReceiverName = escapeHTML(rec.receiverName);
          const safeReceiverEmail = escapeHTML(rec.receiverEmail);
          const safeReason = escapeHTML(rec.reason);
          
          li.innerHTML = `
            <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div>
                <h4 style="font-size: 0.95rem; margin-bottom: 0.25rem;">
                  <span style="color: var(--success); font-weight: 700;">${safeReceiverName}</span> (${safeReceiverEmail})
                </h4>
                <p style="font-size: 0.75rem; color: var(--text-muted);">推薦者: ${safeSenderName} (${safeSenderEmail}) | ${dateStr}</p>
              </div>
              <div>
                <button class="btn btn-outline btn-sm" style="color: var(--danger); border-color: var(--danger); width: auto;" onclick="deleteApprovedRecommendation('${safeId}')">削除</button>
              </div>
            </div>
            <p style="font-size: 0.875rem; color: var(--text-main); margin-top: 0.25rem; white-space: pre-wrap; word-break: break-all; width: 100%;">${safeReason}</p>
          `;
          approvedList.appendChild(li);
        });
      }
    }
  }

  window.approveRecommendation = function(id) {
    const rec = allRecommendationsData.find(r => r.id === id);
    if (!rec) return;
    
    if (confirm(`「${rec.receiverName}」さんへの推薦を承認し、ポイントを付与しますか？\n（推薦された人に50pt、推薦した人に10pt）`)) {
      db.ref('mirai_recommendations/' + id + '/status').set('approved').then(() => {
        const receiverKey = rec.receiverEmail.replace(/\./g, '_');
        db.ref('mirai_users/' + receiverKey).once('value').then(snap => {
          const user = snap.val();
          if (user) {
            user.points = (user.points || 0) + 50;
            user.history = user.history || [];
            user.history.push({
              action: `[推薦承認] ${rec.senderName}さんから: ${rec.reason}`,
              amount: 50,
              timestamp: new Date().toISOString()
            });
            if (user.history.length > 150) {
              user.history = user.history.slice(user.history.length - 150);
            }
            db.ref('mirai_users/' + receiverKey).set(user).catch(handleDatabaseError);
          }
        }).catch(handleDatabaseError);
        
        const senderKey = rec.senderEmail.replace(/\./g, '_');
        db.ref('mirai_users/' + senderKey).once('value').then(snap => {
          const user = snap.val();
          if (user) {
            user.points = (user.points || 0) + 10;
            user.history = user.history || [];
            user.history.push({
              action: `[推薦送信] ${rec.receiverName}さんの推薦承認`,
              amount: 10,
              timestamp: new Date().toISOString()
            });
            if (user.history.length > 150) {
              user.history = user.history.slice(user.history.length - 150);
            }
            db.ref('mirai_users/' + senderKey).set(user).catch(handleDatabaseError);
          }
        }).catch(handleDatabaseError);
        
        alert('推薦を承認しました！');
      }).catch(err => {
        console.error(err);
        if (err.message && err.message.includes('permission_denied')) {
          alert('データベースへのアクセス権限がないため、承認できませんでした。');
        } else {
          alert('承認に失敗しました。');
        }
      });
    }
  };

  window.rejectRecommendation = function(id) {
    if (confirm('この推薦を却下（削除）しますか？')) {
      db.ref('mirai_recommendations/' + id).remove().then(() => {
        alert('推薦を却下しました。');
      }).catch(err => {
        console.error(err);
        alert('削除に失敗しました。');
      });
    }
  };

  window.deleteApprovedRecommendation = function(id) {
    if (confirm('この推薦（承認済み）を完全に削除しますか？\n※付与されたポイントは没収されません。')) {
      db.ref('mirai_recommendations/' + id).remove().then(() => {
        alert('推薦を削除しました。');
      }).catch(err => {
        console.error(err);
        alert('削除に失敗しました。');
      });
    }
  };

  window.deleteLostItem = function(id) {
    if (confirm('この忘れ物のお知らせを削除しますか？')) {
      db.ref('mirai_lost_items/' + id).remove().then(() => {
        alert('削除しました。');
      }).catch(err => {
        console.error(err);
        alert('削除に失敗しました。');
      });
    }
  };

  window.logout = function() {
    localStorage.removeItem('mirai_currentUser');
    window.location.href = 'index.html';
  };

  window.openImageModal = function(src) {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('image-modal-content');
    if (modal && img) {
      img.src = src;
      modal.style.display = 'flex';
    }
  };

  window.closeImageModal = function() {
    const modal = document.getElementById('image-modal');
    if (modal) modal.style.display = 'none';
  };

  window.showRankProgressAlert = function(currentRank, currentRP, totalRP) {
    const totalDisplay = (totalRP !== undefined && totalRP !== null) ? `\n累計ランクポイント: ${totalRP} RP` : '';
    if (currentRank === 'S') {
      alert(`現在のランク: S（最高ランク）\n最高ランク到達済みです！おめでとうございます！\n現在の超過RP: ${currentRP} RP${totalDisplay}`);
      return;
    }

    const rankRequirements = { 'E': 1, 'D': 1, 'C': 3, 'B': 3, 'A': 5 };
    const required = rankRequirements[currentRank];
    if (required !== undefined) {
      const remaining = required - currentRP;
      const nextRanks = { 'E': 'D', 'D': 'C', 'C': 'B', 'B': 'A', 'A': 'S' };
      const nextRank = nextRanks[currentRank];
      alert(`現在のランク: ${currentRank} (${currentRP} / ${required} RP)\n次の「${nextRank}」ランクまで、あと ${remaining} ランクポイント必要です！${totalDisplay}`);
    }
  };

  // Needed for inline onclick in Feedback/Reports if we don't delegate them yet
  window.db = db;

  window.executeWeeklyRanking = function() {
    if (!confirm('過去7日間のポイント獲得数に基づいて週間ランク集計を実行しますか？\n（週に1回のみ実行推奨です）\n\n・上位4%: +3RP\n・上位20%: +2RP\n・上位60%: +1RP\n・7日間活動なし: -1RP')) return;

    const users = allUsersData;
    if (!users) {
      alert('ユーザーデータが読み込めていません。');
      return;
    }

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 7);

    const rankRequirements = { 'E': 1, 'D': 1, 'C': 3, 'B': 3, 'A': 5 };
    const rankOrder = ['E', 'D', 'C', 'B', 'A', 'S'];

    // Build user list with weekly activity info
    const allUsers = Object.keys(users)
      .filter(k => !k.startsWith('{') && users[k].role !== 'admin' && k !== 'S1')
      .map(key => {
        const history = users[key].history || [];
        const weeklyEarnings = history.filter(h => {
          const t = new Date(h.timestamp);
          return t > cutoff && h.amount > 0;
        });
        const weeklyPoints = weeklyEarnings.reduce((sum, h) => sum + h.amount, 0);
        const hasActivity = weeklyEarnings.length > 0;
        return { key, weeklyPoints, hasActivity, user: users[key] };
      });

    if (allUsers.length === 0) {
      alert('対象ユーザーがいません。');
      return;
    }

    // Sort by weekly points descending for ranking
    allUsers.sort((a, b) => b.weeklyPoints - a.weeklyPoints);

    // Calculate thresholds
    const totalUsersCount = allUsers.length;
    const top4Count = Math.max(1, Math.floor(totalUsersCount * 0.04));
    const top20Count = Math.max(1, Math.floor(totalUsersCount * 0.20));
    const top60Count = Math.max(1, Math.floor(totalUsersCount * 0.60));

    let updates = {};

    allUsers.forEach((u, index) => {
      let rankPointsAwarded = 0;
      if (index < top4Count) {
        rankPointsAwarded = 3;
      } else if (index < top20Count) {
        rankPointsAwarded = 2;
      } else if (index < top60Count) {
        rankPointsAwarded = 1;
      }

      // Penalty for 1 week of inactivity
      if (!u.hasActivity) {
        rankPointsAwarded -= 1;
      }

      if (rankPointsAwarded === 0) return; // no change

      let currentRank = u.user.rank || 'E';
      let currentRP = u.user.rankPoints || 0;
      let totalRP = u.user.totalRankPoints || 0;

      const updatedUser = { ...u.user };
      let promoted = false;
      let demoted = false;

      // Add totalRankPoints (cumulative, always increases for gains; decreases for penalties)
      totalRP = Math.max(0, totalRP + rankPointsAwarded);

      if (rankPointsAwarded > 0) {
        // S-rank: just accumulate, no cap
        if (currentRank === 'S') {
          currentRP += rankPointsAwarded;
          // Rank up while loop not needed for S
        } else {
          currentRP += rankPointsAwarded;
          // Rank up logic
          while (currentRank !== 'S' && currentRP >= rankRequirements[currentRank]) {
            currentRP -= rankRequirements[currentRank];
            currentRank = rankOrder[rankOrder.indexOf(currentRank) + 1];
            promoted = true;
          }
        }
      } else if (rankPointsAwarded < 0) {
        // Penalty / deduction
        currentRP += rankPointsAwarded; // e.g. -1
        // Rank DOWN if RP goes below 0 and rank > E
        while (currentRP < 0 && currentRank !== 'E') {
          const prevRank = rankOrder[rankOrder.indexOf(currentRank) - 1];
          currentRank = prevRank;
          currentRP = Math.max(0, (rankRequirements[currentRank] || 1) + currentRP);
          demoted = true;
        }
        if (currentRP < 0) currentRP = 0; // floor at E/0
      }

      updatedUser.rank = currentRank;
      updatedUser.rankPoints = currentRP;
      updatedUser.totalRankPoints = totalRP;

      if (promoted) {
        updatedUser.history = updatedUser.history || [];
        updatedUser.history.push({
          action: `【昇格】${currentRank}ランク到達！`,
          amount: 0,
          timestamp: new Date().toISOString()
        });
        if (updatedUser.history.length > 150) {
          updatedUser.history = updatedUser.history.slice(updatedUser.history.length - 150);
        }
      }

      if (demoted) {
        updatedUser.history = updatedUser.history || [];
        updatedUser.history.push({
          action: `【降格】活動なしにより${currentRank}ランクに降格`,
          amount: 0,
          timestamp: new Date().toISOString()
        });
        if (updatedUser.history.length > 150) {
          updatedUser.history = updatedUser.history.slice(updatedUser.history.length - 150);
        }
      }

      if (!u.hasActivity && rankPointsAwarded === -1 && !demoted) {
        updatedUser.history = updatedUser.history || [];
        updatedUser.history.push({
          action: `【ペナルティ】1週間活動なしのため -1RP`,
          amount: 0,
          timestamp: new Date().toISOString()
        });
        if (updatedUser.history.length > 150) {
          updatedUser.history = updatedUser.history.slice(updatedUser.history.length - 150);
        }
      }

      updates['mirai_users/' + u.key] = updatedUser;
    });

    if (Object.keys(updates).length > 0) {
      db.ref().update(updates)
        .then(() => {
          alert('週間ランク集計が完了しました！');
        })
        .catch(err => {
          console.error(err);
          alert('集計処理中にエラーが発生しました。');
        });
    } else {
      alert('今週は変動したユーザーはいませんでした。');
    }
  };

})();
