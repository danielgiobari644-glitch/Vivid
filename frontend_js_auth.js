(function () {
  'use strict';

  function isAuthPage() {
    var path = window.location.pathname;
    return path.indexOf('/auth/') !== -1;
  }

  function isProtectedPage() {
    var path = window.location.pathname;
    return path.indexOf('dashboard') !== -1 || path.indexOf('editor') !== -1;
  }

  function getPasswordStrength(password) {
    var score = 0;
    var checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };
    if (checks.length) score++;
    if (checks.uppercase) score++;
    if (checks.lowercase) score++;
    if (checks.number) score++;
    if (checks.special) score++;
    return { score: score, checks: checks };
  }

  function updateStrengthBars(score) {
    var bars = document.querySelectorAll('.strength-bar');
    var labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    var colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

    for (var i = 0; i < bars.length; i++) {
      if (i < score) {
        bars[i].style.backgroundColor = colors[Math.min(score - 1, 4)];
      } else {
        bars[i].style.backgroundColor = '';
      }
    }

    var label = document.getElementById('strengthLabel');
    if (label) {
      if (score === 0) {
        label.textContent = '';
        label.style.color = '';
      } else {
        label.textContent = labels[Math.min(score - 1, 4)];
        label.style.color = colors[Math.min(score - 1, 4)];
      }
    }
  }

  async function saveUserToFirestore(user, additionalData) {
    var db = window.firebaseDb;
    if (!db) return;

    var userRef = db.collection('users').doc(user.uid);
    var userDoc = await userRef.get();

    var userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      emailVerified: user.emailVerified,
      provider: user.providerData && user.providerData[0] ? user.providerData[0].providerId : 'email',
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (additionalData) {
      for (var key in additionalData) {
        if (additionalData.hasOwnProperty(key)) {
          userData[key] = additionalData[key];
        }
      }
    }

    if (!userDoc.exists) {
      userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      userData.plan = 'free';
      userData.projectsCount = 0;
      userData.videosCreated = 0;
      await userRef.set(userData);
    } else {
      await userRef.update(userData);
    }
  }

  async function handleLogin(email, password) {
    var auth = window.firebaseAuth;
    if (!auth) {
      showToast('error', 'Error', 'Firebase is not initialized yet. Please try again.');
      return;
    }

    try {
      var credential = await auth.signInWithEmailAndPassword(email, password);
      await saveUserToFirestore(credential.user);
      showToast('success', 'Welcome back!', 'You have been logged in successfully.');
      setTimeout(function () {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      var message = 'Login failed. Please try again.';
      switch (err.code) {
        case 'auth/user-not-found':
          message = 'No account found with this email address.';
          break;
        case 'auth/wrong-password':
          message = 'Incorrect password. Please try again.';
          break;
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/user-disabled':
          message = 'This account has been disabled. Please contact support.';
          break;
        case 'auth/invalid-credential':
          message = 'Invalid email or password. Please check your credentials.';
          break;
      }
      showToast('error', 'Login Failed', message);
    }
  }

  async function handleRegister(email, password, displayName) {
    var auth = window.firebaseAuth;
    if (!auth) {
      showToast('error', 'Error', 'Firebase is not initialized yet. Please try again.');
      return;
    }

    try {
      var credential = await auth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({
        displayName: displayName || ''
      });
      await saveUserToFirestore(credential.user, {
        displayName: displayName || ''
      });
      showToast('success', 'Account Created!', 'Welcome to GIODAI! Your account has been created.');
      setTimeout(function () {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      var message = 'Registration failed. Please try again.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          message = 'An account with this email already exists. Please sign in instead.';
          break;
        case 'auth/weak-password':
          message = 'Password is too weak. Please use a stronger password.';
          break;
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/operation-not-allowed':
          message = 'Email/password registration is not enabled. Please contact support.';
          break;
      }
      showToast('error', 'Registration Failed', message);
    }
  }

  async function handleGoogleSignIn() {
    var auth = window.firebaseAuth;
    if (!auth) {
      showToast('error', 'Error', 'Firebase is not initialized yet. Please try again.');
      return;
    }

    var provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    try {
      var result = await auth.signInWithPopup(provider);
      await saveUserToFirestore(result.user);
      showToast('success', 'Welcome!', 'You have been signed in with Google.');
      setTimeout(function () {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }
      if (err.code === 'auth/cancelled-popup-request') {
        return;
      }
      var message = 'Google sign-in failed. Please try again.';
      if (err.code === 'auth/account-exists-with-different-credential') {
        message = 'An account already exists with the same email but different sign-in method.';
      }
      if (err.code === 'auth/invalid-credential') {
        message = 'The credential returned by Google is invalid.';
      }
      showToast('error', 'Google Sign-In Failed', message);
    }
  }

  async function handleForgotPassword(email) {
    var auth = window.firebaseAuth;
    if (!auth) {
      showToast('error', 'Error', 'Firebase is not initialized yet. Please try again.');
      return;
    }

    try {
      await auth.sendPasswordResetEmail(email);
      showToast('success', 'Email Sent', 'A password reset link has been sent to ' + email + '. Please check your inbox.');
      setTimeout(function () {
        window.location.href = 'login.html';
      }, 2000);
    } catch (err) {
      var message = 'Failed to send reset email.';
      switch (err.code) {
        case 'auth/user-not-found':
          message = 'No account found with this email address.';
          break;
        case 'auth/invalid-email':
          message = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many requests. Please try again later.';
          break;
      }
      showToast('error', 'Reset Failed', message);
    }
  }

  async function handleLogout() {
    var auth = window.firebaseAuth;
    if (!auth) {
      window.location.href = 'index.html';
      return;
    }

    try {
      await auth.signOut();
      showToast('info', 'Signed Out', 'You have been logged out successfully.');
      setTimeout(function () {
        window.location.href = 'index.html';
      }, 500);
    } catch (err) {
      showToast('error', 'Sign Out Failed', 'An error occurred while signing out. Please try again.');
    }
  }

  async function handleProfileUpdate(data) {
    var auth = window.firebaseAuth;
    var db = window.firebaseDb;
    if (!auth || !db || !auth.currentUser) {
      showToast('error', 'Error', 'You must be logged in to update your profile.');
      return;
    }

    try {
      var updates = {};
      if (data.displayName !== undefined) {
        updates.displayName = data.displayName;
      }
      if (data.photoURL !== undefined) {
        updates.photoURL = data.photoURL;
      }

      await auth.currentUser.updateProfile(updates);
      await db.collection('users').doc(auth.currentUser.uid).update({
        displayName: data.displayName || auth.currentUser.displayName || '',
        photoURL: data.photoURL || auth.currentUser.photoURL || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      updateUI(auth.currentUser);
      showToast('success', 'Profile Updated', 'Your profile has been updated successfully.');
    } catch (err) {
      showToast('error', 'Update Failed', 'Failed to update profile. Please try again.');
    }
  }

  function updateUI(user) {
    var nameEl = document.getElementById('sidebarUserName');
    var emailEl = document.getElementById('sidebarUserEmail');
    var avatarEl = document.getElementById('sidebarUserAvatar');
    var logoutBtn = document.getElementById('logoutBtn');
    var greetingEl = document.getElementById('userGreeting');

    if (user) {
      var name = user.displayName || user.email || 'User';
      var initials = name.split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);

      if (nameEl) nameEl.textContent = name;
      if (emailEl) emailEl.textContent = user.email || '';
      if (avatarEl) {
        if (user.photoURL) {
          avatarEl.innerHTML = '<img src="' + user.photoURL + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
        } else {
          avatarEl.textContent = initials;
        }
      }

      if (greetingEl) {
        var greeting = '';
        var hour = new Date().getHours();
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';
        else greeting = 'Good evening';
        greetingEl.textContent = greeting + ', ' + (user.displayName || 'there');
      }
    } else {
      if (nameEl) nameEl.textContent = '';
      if (emailEl) emailEl.textContent = '';
      if (avatarEl) avatarEl.textContent = '';
      if (greetingEl) greetingEl.textContent = '';
    }

    if (logoutBtn && !logoutBtn._listenerAttached) {
      logoutBtn._listenerAttached = true;
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleLogout();
      });
    }
  }

  function attachPasswordToggle(toggleId, inputId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    if (!toggle || !input) return;

    toggle.addEventListener('click', function () {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      var svgPath = toggle.querySelector('path');
      if (svgPath) {
        if (isPassword) {
          svgPath.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24');
          svgPath.setAttribute('stroke-linecap', 'round');
          svgPath.setAttribute('stroke-linejoin', 'round');
        } else {
          svgPath.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
          svgPath.setAttribute('stroke-linecap', 'round');
          svgPath.setAttribute('stroke-linejoin', 'round');
        }
      }
      var secondPath = toggle.querySelectorAll('path')[1];
      if (secondPath) {
        secondPath.style.display = isPassword ? 'block' : 'none';
      }
    });
  }

  function showToast(type, title, message) {
    if (window.GIODAIUtils && typeof window.GIODAIUtils.showToast === 'function') {
      window.GIODAIUtils.showToast(type, title, message);
      return;
    }

    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;min-width:300px;max-width:400px;padding:14px 16px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;align-items:flex-start;gap:10px;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease;opacity:0;color:#fff;font-family:system-ui,sans-serif;';
    toast.innerHTML = '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;margin-bottom:2px;">' + title + '</div>' + (message ? '<div style="font-size:13px;color:#94a3b8;line-height:1.4;">' + message + '</div>' : '') + '</div><button style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:2px;font-size:18px;line-height:1;" aria-label="Close">&times;</button>';
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    var dismiss = function () {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    toast.querySelector('button').addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
  }

  function initAuth() {
    var auth = window.firebaseAuth;
    if (!auth) {
      window.addEventListener('firebase-ready', initAuth);
      return;
    }

    auth.onAuthStateChanged(function (user) {
      updateUI(user);

      if (user && isAuthPage()) {
        window.location.href = '../dashboard.html';
        return;
      }

      if (!user && isProtectedPage()) {
        window.location.href = 'auth/login.html';
        return;
      }
    });

    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = document.getElementById('loginEmail');
        var passwordInput = document.getElementById('loginPassword');
        var submitBtn = loginForm.querySelector('button[type="submit"]');

        var email = emailInput ? emailInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';

        if (!email) {
          showToast('warning', 'Missing Email', 'Please enter your email address.');
          return;
        }
        if (!password) {
          showToast('warning', 'Missing Password', 'Please enter your password.');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';
        }

        handleLogin(email, password).finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
          }
        });
      });
    }

    var registerForm = document.getElementById('registerForm');
    if (registerForm) {
      var regPasswordInput = document.getElementById('regPassword');
      if (regPasswordInput) {
        regPasswordInput.addEventListener('input', function () {
          var strength = getPasswordStrength(regPasswordInput.value);
          updateStrengthBars(strength.score);
        });
      }

      registerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var nameInput = document.getElementById('regDisplayName');
        var emailInput = document.getElementById('regEmail');
        var passwordInput = document.getElementById('regPassword');
        var confirmPasswordInput = document.getElementById('regConfirmPassword');
        var submitBtn = registerForm.querySelector('button[type="submit"]');

        var displayName = nameInput ? nameInput.value.trim() : '';
        var email = emailInput ? emailInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';
        var confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

        if (!displayName) {
          showToast('warning', 'Missing Name', 'Please enter your display name.');
          return;
        }
        if (!email) {
          showToast('warning', 'Missing Email', 'Please enter your email address.');
          return;
        }
        if (!password) {
          showToast('warning', 'Missing Password', 'Please enter a password.');
          return;
        }
        if (password.length < 6) {
          showToast('warning', 'Weak Password', 'Password must be at least 6 characters long.');
          return;
        }
        if (password !== confirmPassword) {
          showToast('warning', 'Passwords Do Not Match', 'Please make sure both passwords are the same.');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating account...';
        }

        handleRegister(email, password, displayName).finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
          }
        });
      });
    }

    var forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
      forgotForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = document.getElementById('forgotEmail');
        var submitBtn = forgotForm.querySelector('button[type="submit"]');

        var email = emailInput ? emailInput.value.trim() : '';

        if (!email) {
          showToast('warning', 'Missing Email', 'Please enter your email address.');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }

        handleForgotPassword(email).finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Reset Link';
          }
        });
      });
    }

    var googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleGoogleSignIn();
      });
    }

    var googleSignUpBtn = document.getElementById('googleSignUpBtn');
    if (googleSignUpBtn) {
      googleSignUpBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleGoogleSignIn();
      });
    }

    attachPasswordToggle('togglePassword', 'loginPassword');
    attachPasswordToggle('toggleRegPassword', 'regPassword');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  window.GIODAIAuth = {
    handleLogin: handleLogin,
    handleRegister: handleRegister,
    handleGoogleSignIn: handleGoogleSignIn,
    handleForgotPassword: handleForgotPassword,
    handleLogout: handleLogout,
    handleProfileUpdate: handleProfileUpdate,
    updateUI: updateUI,
    getPasswordStrength: getPasswordStrength,
    updateStrengthBars: updateStrengthBars,
    saveUserToFirestore: saveUserToFirestore
  };
})();
