(function () {
  'use strict';

  var toastIcons = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  function showToast(type, title, message) {
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }

    var iconColorMap = {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };

    var borderColorMap = {
      success: 'rgba(34,197,94,0.3)',
      error: 'rgba(239,68,68,0.3)',
      warning: 'rgba(245,158,11,0.3)',
      info: 'rgba(59,130,246,0.3)'
    };

    var toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto;min-width:320px;max-width:420px;padding:16px;background:var(--bg-card,#1a1a2e);border:1px solid ' + borderColorMap[type] + ';border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;align-items:flex-start;gap:12px;transform:translateX(120%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease;opacity:0;';

    var iconHtml = '<div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:' + borderColorMap[type] + ';color:' + iconColorMap[type] + ';">' + toastIcons[type] + '</div>';

    var contentHtml = '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;color:var(--text-primary,#fff);margin-bottom:2px;">' + escapeHtml(title) + '</div>';
    if (message) {
      contentHtml += '<div style="font-size:13px;color:var(--text-secondary,#94a3b8);line-height:1.4;word-wrap:break-word;">' + escapeHtml(message) + '</div>';
    }
    contentHtml += '</div>';

    var closeHtml = '<button style="flex-shrink:0;background:none;border:none;color:var(--text-secondary,#94a3b8);cursor:pointer;padding:4px;border-radius:4px;transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'none\'" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';

    toast.innerHTML = iconHtml + contentHtml + closeHtml;
    container.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    var dismiss = function () {
      toast.style.transform = 'translateX(120%)';
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    };

    toast.querySelector('button').addEventListener('click', dismiss);

    setTimeout(dismiss, 4000);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '00:00.00';
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 100);
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    var date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return '';
    }

    var now = new Date();
    var diffMs = now - date;
    var diffSecs = Math.floor(diffMs / 1000);
    var diffMins = Math.floor(diffSecs / 60);
    var diffHours = Math.floor(diffMins / 60);
    var diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return diffMins + (diffMins === 1 ? ' minute ago' : ' minutes ago');
    if (diffHours < 24) return diffHours + (diffHours === 1 ? ' hour ago' : ' hours ago');
    if (diffDays < 7) return diffDays + (diffDays === 1 ? ' day ago' : ' days ago');

    var options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  function throttle(fn, limit) {
    var inThrottle = false;
    var lastArgs = null;
    var lastContext = null;

    return function () {
      var context = this;
      var args = arguments;

      if (!inThrottle) {
        inThrottle = true;
        fn.apply(context, args);
        setTimeout(function () {
          inThrottle = false;
          if (lastArgs) {
            fn.apply(lastContext, lastArgs);
            lastArgs = null;
            lastContext = null;
          }
        }, limit);
      } else {
        lastArgs = args;
        lastContext = context;
      }
    };
  }

  function downloadFile(url, filename) {
    var link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      document.body.removeChild(link);
    }, 100);
  }

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('giodai-theme', theme);
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 1920;
    quality = quality || 0.85;

    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var width = img.width;
          var height = img.height;

          if (width > maxWidth) {
            var ratio = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * ratio);
          }

          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          var base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.onerror = function () {
          reject(new Error('Failed to load image for compression'));
        };
        img.src = e.target.result;
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file for compression'));
      };
      reader.readAsDataURL(file);
    });
  }

  function getAspectRatioDimensions(ratio) {
    var baseHeight = 1080;
    var dimensions = {
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 608, height: 1080 },
      '1:1': { width: 1080, height: 1080 },
      '4:5': { width: 864, height: 1080 },
      '3:2': { width: 1620, height: 1080 }
    };
    return dimensions[ratio] || dimensions['16:9'];
  }

  function getGreeting() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  window.GIODAIUtils = {
    showToast: showToast,
    openModal: openModal,
    closeModal: closeModal,
    generateId: generateId,
    formatTime: formatTime,
    formatDate: formatDate,
    debounce: debounce,
    throttle: throttle,
    downloadFile: downloadFile,
    getTheme: getTheme,
    setTheme: setTheme,
    fileToBase64: fileToBase64,
    compressImage: compressImage,
    getAspectRatioDimensions: getAspectRatioDimensions,
    getGreeting: getGreeting
  };
})();
