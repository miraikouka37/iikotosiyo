// settings.js
document.addEventListener('DOMContentLoaded', () => {
  const currentUserStr = localStorage.getItem('mirai_currentUser');
  if (!currentUserStr) {
    window.location.href = 'index.html';
    return;
  }

  const currentUser = JSON.parse(currentUserStr);
  const isAdmin = currentUser.role === 'admin';
  let userData;

  if (isAdmin) {
    userData = JSON.parse(localStorage.getItem('mirai_admin_credentials')) || { id: 'S1', password: 'ciscoenpass', name: '管理者' };
    const emailLabel = document.getElementById('label-settings-email');
    if (emailLabel) emailLabel.innerText = "ログインID";
    // Change input type to text since ID doesn't need to be email
    const emailInput = document.getElementById('settings-email');
    if (emailInput) emailInput.type = "text";
    
    document.getElementById('settings-name').value = userData.name;
    document.getElementById('settings-email').value = userData.id;
  } else {
    const safeEmail = currentUser.email.replace(/\./g, '_');
    db.ref('mirai_users/' + safeEmail).once('value').then(snapshot => {
      userData = snapshot.val();
      if (!userData) {
        localStorage.removeItem('mirai_currentUser');
        window.location.href = 'index.html';
        return;
      }
      document.getElementById('settings-name').value = userData.name;
      document.getElementById('settings-email').value = currentUser.email;
    });
  }

  const form = document.getElementById('settings-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const previousEmail = currentUser.email;
    const newName = document.getElementById('settings-name').value;
    const newEmail = document.getElementById('settings-email').value;
    const newPassword = document.getElementById('settings-password').value;

    // 不適切な表現のバリデーション
    const forbiddenWords = [
      'セックス', 'エロ', 'ちんちん', 'まんこ', 'オナニー', 'ペニス', 'sex', 'porn', 'ヴァギナ', '淫乱', 
      '死ね', '殺す', 'カス', 'ゴミ', 
      'nigger', 'nigga', 'pussy', 'キチガイ', 'ガイジ', 'チョン', '土人'
    ];
    if (forbiddenWords.some(word => newName.toLowerCase().includes(word))) {
      alert('ユーザー名に不適切な表現が含まれているため、使用できません。');
      return;
    }

    const isAdmin = currentUser.role === 'admin';

    if (isAdmin) {
      if (!newEmail || !newName) {
        alert('ログインIDと名前を入力してください。');
        return;
      }
      const adminCreds = JSON.parse(localStorage.getItem('mirai_admin_credentials')) || { id: 'S1', password: 'ciscoenpass', name: '管理者' };
      adminCreds.id = newEmail;
      adminCreds.name = newName;
      if (newPassword.trim() !== '') {
        adminCreds.password = newPassword;
      }
      localStorage.setItem('mirai_admin_credentials', JSON.stringify(adminCreds));

      currentUser.email = newEmail;
      currentUser.name = newName;
      localStorage.setItem('mirai_currentUser', JSON.stringify(currentUser));

      alert('管理者設定が保存されました！');
      window.location.href = 'admin.html';
      return;
    }

    const safePrev = previousEmail.replace(/\./g, '_');
    const safeNew = newEmail.replace(/\./g, '_');

    db.ref('mirai_users').once('value').then(snapshot => {
      const allUsers = snapshot.val() || {};

      if (newEmail !== previousEmail && allUsers[safeNew]) {
        alert('そのメールアドレスは既に他のユーザーに使用されています。');
        return;
      }

      const updatedData = allUsers[safePrev] || {};
      updatedData.name = newName;
      if (newPassword.trim() !== '') {
        updatedData.password = newPassword;
      }
      // Ensure email property inside is updated
      updatedData.email = newEmail; 

      if (newEmail !== previousEmail) {
        db.ref('mirai_users/' + safeNew).set(updatedData).then(() => {
          db.ref('mirai_users/' + safePrev).remove();
          currentUser.email = newEmail;
          currentUser.name = newName;
          localStorage.setItem('mirai_currentUser', JSON.stringify(currentUser));
          alert('設定が保存されました！');
          window.location.reload();
        });
      } else {
        db.ref('mirai_users/' + safePrev).set(updatedData).then(() => {
          currentUser.name = newName;
          localStorage.setItem('mirai_currentUser', JSON.stringify(currentUser));
          alert('設定が保存されました！');
          window.location.reload();
        });
      }
    });
  });
});

function logout() {
  localStorage.removeItem('mirai_currentUser');
  window.location.href = 'index.html';
}

function goBack() {
  const currentUserStr = localStorage.getItem('mirai_currentUser');
  if (currentUserStr) {
    const currentUser = JSON.parse(currentUserStr);
    if (currentUser.role === 'admin') {
      window.location.href = 'admin.html';
      return;
    }
  }
  window.location.href = 'dashboard.html';
}
