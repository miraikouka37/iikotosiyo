// assets/js/firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyDBootMwUqbLerWOEWTarHk9O0V4iIqwz8",
  authDomain: "iikotosiyo-a9bbc.firebaseapp.com",
  projectId: "iikotosiyo-a9bbc",
  storageBucket: "iikotosiyo-a9bbc.firebasestorage.app",
  messagingSenderId: "1003275445258",
  appId: "1:1003275445258:web:c8f955d866de7603a86bf3",
  measurementId: "G-VWLEEK7F8K",
  databaseURL: "https://iikotosiyo-a9bbc-default-rtdb.firebaseio.com" // Realtime DatabaseのURLを追加
};

// Initialize Firebase SDK (v8 compat)
firebase.initializeApp(firebaseConfig);

// Initialize Database & Storage
const db = firebase.database();
const storage = firebase.storage();
