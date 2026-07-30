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

  /**
   * Make an authenticated API call to the GIODAI backend.
   *
   * Automatically attaches the current Firebase user's ID token as a
   * Bearer Authorization header.  If the token is expired it will be
   * refreshed first.  Unauthenticated users trigger an error.
   *
   * @param {string}  path   - API path relative to the backend root (e.g. '/api/generate').
   * @param {object}  [opts] - Optional fetch options (method, headers, body, …).
   * @returns {Promise<object>} Parsed JSON response body.
   *
   * @example
   *   // GET request
   *   const data = await window.apiCall('/api/models');
   *
   *   // POST request with JSON body
   *   const result = await window.apiCall('/api/generate', {
   *     method: 'POST',
 *     body: JSON.stringify({ prompt: 'Hello world' }),
   *   });
   */
  window.apiCall = async function (path, opts) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase Auth is not initialised yet.');
    }

    var user = firebase.auth().currentUser;
    if (!user) {
      throw new Error('User is not authenticated. Please sign in first.');
    }

    // Get a fresh ID token (refreshes automatically if expired)
    var idToken = await user.getIdToken(/* forceRefresh */ false);

    var baseUrl = window.getBackendUrl().replace(/\/+$/, '');
    var url = baseUrl + path;

    var fetchOpts = Object.assign(
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + idToken
        }
      },
      opts || {}
    );

    // Merge caller-provided headers so they can override defaults
    if (opts && opts.headers) {
      fetchOpts.headers = Object.assign(
        { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        opts.headers
      );
    }

    var response = await fetch(url, fetchOpts);

    if (response.status === 401 || response.status === 403) {
      // Token may have been revoked — force refresh and retry once
      idToken = await user.getIdToken(/* forceRefresh */ true);
      fetchOpts.headers['Authorization'] = 'Bearer ' + idToken;
      response = await fetch(url, fetchOpts);
    }

    if (!response.ok) {
      var errorBody;
      try {
        errorBody = await response.json();
      } catch (_) {
        errorBody = await response.text().catch(function () { return '(empty body)'; });
      }
      var error = new Error(
        'API request failed (' + response.status + '): ' +
        (errorBody.detail || errorBody.message || JSON.stringify(errorBody))
      );
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    // Handle responses that may not have a body (e.g. 204 No Content)
    var text = await response.text();
    return text.length ? JSON.parse(text) : null;
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
