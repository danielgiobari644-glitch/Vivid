(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyCsYhrSKrCRfxGnsx7NHNESalMc4fEUiTU",
    authDomain: "giodai.firebaseapp.com",
    projectId: "giodai",
    storageBucket: "giodai.firebasestorage.app",
    messagingSenderId: "479061806124",
    appId: "1:479061806124:web:ce8dbcf3f7b7a104ba5589",
    measurementId: "G-FX7SECG3ZB"
  };

  var scripts = [
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Failed to load script: ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function initTheme() {
    var savedTheme = localStorage.getItem('giodai-theme');
    var theme = savedTheme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  window.getBackendUrl = function () {
    var saved = localStorage.getItem('giodai-backend-url');
    if (saved) {
      return saved;
    }
    return 'http://localhost:8000';
  };

  async function initFirebase() {
    initTheme();

    for (var i = 0; i < scripts.length; i++) {
      try {
        await loadScript(scripts[i]);
      } catch (err) {
        console.error('Firebase SDK loading failed:', err);
        return;
      }
    }

    if (typeof firebase === 'undefined') {
      console.error('Firebase is not defined after loading scripts.');
      return;
    }

    var app = firebase.initializeApp(firebaseConfig);
    var auth = firebase.auth();
    var db = firebase.firestore();

    window.firebaseApp = app;
    window.firebaseAuth = auth;
    window.firebaseDb = db;

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (err) {
      console.error('Failed to set auth persistence:', err);
    }

    window.dispatchEvent(new CustomEvent('firebase-ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }
})();
