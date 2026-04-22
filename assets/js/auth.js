// auth.js
document.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in
  const currentUserStr = localStorage.getItem('mirai_currentUser');
  if (currentUserStr) {
    const user = JSON.parse(currentUserStr);
    if(user.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  }

  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const identifier = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const adminCredsStr = localStorage.getItem('mirai_admin_credentials');
      const adminCreds = adminCredsStr ? JSON.parse(adminCredsStr) : { id: 'S1', password: 'ciscoenpass', name: '管理者' };

      if (identifier === adminCreds.id && password === adminCreds.password) {
        localStorage.setItem('mirai_currentUser', JSON.stringify({ email: adminCreds.id, name: adminCreds.name, role: 'admin' }));
        window.location.href = 'admin.html';
        return;
      }
      
      const users = JSON.parse(localStorage.getItem('mirai_users')) || {};
      
      let targetEmail = null;
      if (users[identifier]) {
        targetEmail = identifier;
      } else {
        const found = Object.keys(users).find(key => users[key].name === identifier);
        if (found) {
          targetEmail = found;
        }
      }
      
      if (targetEmail && users[targetEmail].password === password) {
        localStorage.setItem('mirai_currentUser', JSON.stringify({ email: targetEmail, name: users[targetEmail].name }));
        window.location.href = 'dashboard.html';
      } else {
        alert('ユーザー名/メールアドレス または パスワードが間違っています。');
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;

      // 不適切な表現のバリデーション
      const forbiddenWords = [
        'セックス', 'エロ', 'ちんちん', 'まんこ', 'オナニー', 'ペニス', 'sex', 'porn', 'ヴァギナ', '淫乱', 
        '死ね', '殺す', 'カス', 'ゴミ', 
        'nigger', 'nigga', 'pussy', 'キチガイ', 'ガイジ', 'チョン', '土人'
      ];
      if (forbiddenWords.some(word => name.toLowerCase().includes(word))) {
        alert('ユーザー名に不適切な表現が含まれているため、使用できません。');
        return;
      }

      const users = JSON.parse(localStorage.getItem('mirai_users')) || {};

      if (users[email]) {
        alert('このメールアドレスは既に登録されています。');
        return;
      }

      users[email] = { name, password, points: 0, history: [] };
      localStorage.setItem('mirai_users', JSON.stringify(users));
      
      // Auto login
      localStorage.setItem('mirai_currentUser', JSON.stringify({ email, name }));
      window.location.href = 'dashboard.html';
    });
  }
});

// Toggle between Login and Signup mode
let isLoginMode = true;
function toggleAuthMode() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const subtitle = document.getElementById('auth-subtitle');

  if (isLoginMode) {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    subtitle.innerText = '新しいアカウントを作成しよう';
  } else {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    subtitle.innerText = 'ログインしてポイントを獲得しよう';
  }
  isLoginMode = !isLoginMode;
}
