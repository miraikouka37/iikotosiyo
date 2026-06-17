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
      
      db.ref('mirai_users').once('value').then(snapshot => {
        const users = snapshot.val() || {};
        let targetUser = null;
        
        for (const key in users) {
          const user = users[key];
          const userEmail = user.email || key.replace(/_/g, '.'); 
          if (userEmail === identifier || user.name === identifier) {
            targetUser = user;
            targetUser.email = userEmail;
            break;
          }
        }
        
        if (targetUser && targetUser.password === password) {
          localStorage.setItem('mirai_currentUser', JSON.stringify({ email: targetUser.email, name: targetUser.name }));
          window.location.href = 'dashboard.html';
        } else {
          alert('ユーザー名/メールアドレス または パスワードが間違っています。');
        }
      }).catch(error => {
        console.error(error);
        if (error.message && error.message.includes('permission_denied')) {
          alert('データベースへのアクセス権限がありません。管理者にご連絡ください（Firebaseのセキュリティルールの期限が切れている可能性があります）。');
        } else {
          alert('ログインエラーが発生しました。通信環境を確認してください。');
        }
      });
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const gradeEl = document.getElementById('signup-grade');
      const grade = gradeEl ? gradeEl.value : '';

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

      if (name === password) {
        alert('ユーザーネームとパスワードを同じにすることはできません。セキュリティのため別のパスワードを設定してください。');
        return;
      }

      if (email === password) {
        alert('メールアドレスとパスワードを同じにすることはできません。セキュリティのため別のパスワードを設定してください。');
        return;
      }

      const safeEmail = email.replace(/\./g, '_');
      
      db.ref('mirai_users').once('value').then(snapshot => {
        const users = snapshot.val() || {};
        
        // 重複チェック (名前とメールアドレスがかぶらないようにする)
        for (const key in users) {
          const userEmail = users[key].email || key.replace(/_/g, '.');
          const userName = users[key].name;
          
          if (userName === name || userEmail === name) {
            alert('入力されたユーザーネームは既に他の用途（名前またはメールアドレス）で使用されています。別の名前を入力してください。');
            return;
          }
          if (userName === email || userEmail === email) {
            alert('入力されたメールアドレスは既に他の用途（名前またはメールアドレス）で使用されています。別のメールアドレスを入力してください。');
            return;
          }
        }
        
        const newUser = {
          email: email,
          name: name,
          password: password,
          points: 0,
          history: [],
          grade: grade ? parseInt(grade) : null
        };
        
        db.ref('mirai_users/' + safeEmail).set(newUser).then(() => {
          // Auto login
          localStorage.setItem('mirai_currentUser', JSON.stringify({ email, name }));
          localStorage.setItem('mirai_isNewUser', 'true');
          window.location.href = 'dashboard.html';
        }).catch(err => {
          console.error(err);
          alert('アカウントの作成に失敗しました。');
        });
      }).catch(err => {
        console.error(err);
        if (err.message && err.message.includes('permission_denied')) {
          alert('データベースへのアクセス権限がありません。管理者にご連絡ください（Firebaseのセキュリティルールの期限が切れている可能性があります）。');
        } else {
          alert('アカウントの作成検証中にエラーが発生しました。');
        }
      });
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

// パスワードの表示・非表示を切り替える関数
window.togglePasswordVisibility = function(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    iconEl.textContent = '🙈'; // 閉じた目
    iconEl.title = 'パスワードを隠す';
  } else {
    input.type = 'password';
    iconEl.textContent = '👁️'; // 開いた目
    iconEl.title = 'パスワードを表示';
  }
};
