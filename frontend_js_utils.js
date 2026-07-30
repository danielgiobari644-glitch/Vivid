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

  // =========================================================================
  // Video File Handling
  // =========================================================================

  var SUPPORTED_VIDEO_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/x-flv'
  ];

  var VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'avi', 'mkv', 'flv', 'm4v', '3gp'];

  var SUPPORTED_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff'
  ];

  function getFileExtension(file) {
    if (!file || !file.name) return '';
    var parts = file.name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function isVideoFile(file) {
    if (!file) return false;
    if (SUPPORTED_VIDEO_MIME_TYPES.indexOf(file.type) !== -1) return true;
    var ext = getFileExtension(file);
    return VIDEO_EXTENSIONS.indexOf(ext) !== -1;
  }

  function isImageFile(file) {
    if (!file) return false;
    if (SUPPORTED_IMAGE_MIME_TYPES.indexOf(file.type) !== -1) return true;
    var ext = getFileExtension(file);
    var imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif'];
    return imageExtensions.indexOf(ext) !== -1;
  }

  function getMediaType(file) {
    if (!file) return 'unknown';
    if (isVideoFile(file)) return 'video';
    if (isImageFile(file)) return 'image';
    if (file.type && file.type.indexOf('audio/') === 0) return 'audio';
    return 'other';
  }

  function isSupportedMedia(file) {
    var type = getMediaType(file);
    return type === 'image' || type === 'video';
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var index = 0;
    var size = bytes;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }
    var decimals = index === 0 ? 0 : (size < 10 ? 2 : 1);
    return size.toFixed(decimals) + ' ' + units[index];
  }

  function getVideoMetadata(file) {
    return new Promise(function (resolve, reject) {
      if (!isVideoFile(file)) {
        reject(new Error('File is not a recognized video format'));
        return;
      }

      var video = document.createElement('video');
      video.preload = 'metadata';

      var url = URL.createObjectURL(file);
      video.src = url;

      var cleanedUp = false;
      function cleanup() {
        if (!cleanedUp) {
          cleanedUp = true;
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        }
      }

      video.onloadedmetadata = function () {
        var metadata = {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: video.videoWidth && video.videoHeight
            ? (video.videoWidth / video.videoHeight).toFixed(2)
            : null,
          name: file.name,
          size: file.size,
          type: file.type || 'video/' + getFileExtension(file)
        };
        cleanup();
        resolve(metadata);
      };

      video.onerror = function () {
        cleanup();
        reject(new Error('Failed to load video metadata for: ' + file.name));
      };
    });
  }

  function validateVideoFile(file, options) {
    options = options || {};
    var maxFileSize = options.maxFileSize || (500 * 1024 * 1024);
    var maxDuration = options.maxDuration || 600;
    var minWidth = options.minWidth || 0;
    var minHeight = options.minHeight || 0;
    var maxWidth = options.maxWidth || 7680;
    var maxHeight = options.maxHeight || 4320;
    var allowedFormats = options.allowedFormats || SUPPORTED_VIDEO_MIME_TYPES;

    var errors = [];

    if (file.size > maxFileSize) {
      errors.push('File size (' + formatFileSize(file.size) + ') exceeds maximum (' + formatFileSize(maxFileSize) + ')');
    }

    if (allowedFormats.indexOf(file.type) === -1 && !isVideoFile(file)) {
      errors.push('Unsupported video format: ' + (file.type || 'unknown'));
    }

    if (errors.length > 0) {
      return Promise.resolve({ valid: false, errors: errors });
    }

    return getVideoMetadata(file).then(function (meta) {
      if (meta.duration > maxDuration) {
        errors.push('Video duration (' + formatDuration(meta.duration) + ') exceeds maximum (' + formatDuration(maxDuration) + ')');
      }
      if (meta.duration <= 0) {
        errors.push('Video appears to have zero or invalid duration');
      }
      if (meta.width < minWidth) {
        errors.push('Video width (' + meta.width + 'px) is below minimum (' + minWidth + 'px)');
      }
      if (meta.height < minHeight) {
        errors.push('Video height (' + meta.height + 'px) is below minimum (' + minHeight + 'px)');
      }
      if (meta.width > maxWidth) {
        errors.push('Video width (' + meta.width + 'px) exceeds maximum (' + maxWidth + 'px)');
      }
      if (meta.height > maxHeight) {
        errors.push('Video height (' + meta.height + 'px) exceeds maximum (' + maxHeight + 'px)');
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        metadata: meta
      };
    }).catch(function (err) {
      errors.push('Could not read video metadata: ' + err.message);
      return { valid: false, errors: errors };
    });
  }

  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0:00';
    var hrs = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }
    return mins + ':' + String(secs).padStart(2, '0');
  }

  // =========================================================================
  // Video Thumbnail Extraction
  // =========================================================================

  function extractVideoThumbnail(file, options) {
    options = options || {};
    var seekTime = typeof options.seekTime === 'number' ? options.seekTime : 1;
    var thumbWidth = options.width || 320;
    var thumbHeight = options.height || 0;
    var quality = options.quality || 0.85;
    var format = options.format || 'image/jpeg';

    return new Promise(function (resolve, reject) {
      if (!isVideoFile(file)) {
        reject(new Error('File is not a recognized video format'));
        return;
      }

      var video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;

      var url = URL.createObjectURL(file);
      video.src = url;

      var cleanedUp = false;
      function cleanup() {
        if (!cleanedUp) {
          cleanedUp = true;
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        }
      }

      video.onloadeddata = function () {
        if (seekTime >= video.duration) {
          seekTime = Math.max(0, video.duration * 0.1);
        }
        video.currentTime = seekTime;
      };

      video.onseeked = function () {
        try {
          var vw = video.videoWidth;
          var vh = video.videoHeight;

          var drawWidth = thumbWidth;
          var drawHeight = thumbHeight;

          if (!drawHeight || drawHeight === 0) {
            drawHeight = Math.round((vh / vw) * drawWidth);
          }

          var canvas = document.createElement('canvas');
          canvas.width = drawWidth;
          canvas.height = drawHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, drawWidth, drawHeight);

          var dataUrl = canvas.toDataURL(format, quality);

          var result = {
            dataUrl: dataUrl,
            width: drawWidth,
            height: drawHeight,
            seekTime: seekTime,
            videoDuration: video.duration,
            videoWidth: vw,
            videoHeight: vh
          };

          cleanup();
          resolve(result);
        } catch (err) {
          cleanup();
          reject(new Error('Failed to capture video frame: ' + err.message));
        }
      };

      video.onerror = function () {
        cleanup();
        reject(new Error('Failed to load video for thumbnail extraction: ' + file.name));
      };
    });
  }

  function extractVideoThumbnails(file, options) {
    options = options || {};
    var count = options.count || 4;
    var width = options.width || 240;
    var quality = options.quality || 0.8;
    var format = options.format || 'image/jpeg';

    return new Promise(function (resolve, reject) {
      if (!isVideoFile(file)) {
        reject(new Error('File is not a recognized video format'));
        return;
      }

      var video = document.createElement('video');
      video.preload = 'metadata';

      var url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = function () {
        var duration = video.duration;
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();

        if (!duration || duration <= 0) {
          reject(new Error('Video has zero or invalid duration'));
          return;
        }

        var interval = duration / (count + 1);
        var seekTimes = [];
        for (var i = 1; i <= count; i++) {
          seekTimes.push(Math.min(interval * i, duration - 0.5));
        }

        var thumbnails = [];
        var index = 0;

        function extractNext() {
          if (index >= seekTimes.length) {
            resolve(thumbnails);
            return;
          }

          var time = seekTimes[index];
          extractVideoThumbnail(file, {
            seekTime: time,
            width: width,
            quality: quality,
            format: format
          }).then(function (thumb) {
            thumb.index = index;
            thumbnails.push(thumb);
            index++;
            extractNext();
          }).catch(function (err) {
            thumbnails.push({ error: err.message, seekTime: time, index: index });
            index++;
            extractNext();
          });
        }

        extractNext();
      };

      video.onerror = function () {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        reject(new Error('Failed to read video metadata for thumbnail extraction'));
      };
    });
  }

  // =========================================================================
  // Enhanced File Processing
  // =========================================================================

  function extractImageDimensions(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        reject(new Error('Failed to load image for dimension extraction'));
      };
      img.src = dataUrl;
    });
  }

  function processMediaFile(file, options) {
    options = options || {};
    var mediaType = getMediaType(file);

    var result = {
      id: generateId(),
      file: file,
      mediaType: mediaType,
      name: file.name,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
      type: file.type,
      extension: getFileExtension(file)
    };

    if (mediaType === 'image') {
      return compressImage(file, options.maxImageWidth || 1920, options.imageQuality || 0.85)
        .then(function (dataUrl) {
          result.dataUrl = dataUrl;
          return extractImageDimensions(dataUrl);
        })
        .then(function (dims) {
          result.width = dims.width;
          result.height = dims.height;
          result.aspectRatio = (dims.width / dims.height).toFixed(2);
          return result;
        });
    }

    if (mediaType === 'video') {
      return getVideoMetadata(file).then(function (meta) {
        result.duration = meta.duration;
        result.durationFormatted = formatDuration(meta.duration);
        result.width = meta.width;
        result.height = meta.height;
        result.aspectRatio = meta.aspectRatio;

        if (options.extractThumbnail !== false) {
          return extractVideoThumbnail(file, {
            seekTime: options.thumbnailSeekTime || 1,
            width: options.thumbnailWidth || 320,
            quality: options.thumbnailQuality || 0.85
          });
        }
        return null;
      }).then(function (thumbnail) {
        if (thumbnail) {
          result.thumbnail = thumbnail.dataUrl;
          result.thumbnailWidth = thumbnail.width;
          result.thumbnailHeight = thumbnail.height;
        }
        return result;
      });
    }

    return Promise.resolve(result);
  }

  function processMediaFiles(files, options) {
    if (!Array.isArray(files)) files = [files];
    options = options || {};

    var promises = files.map(function (file) {
      return processMediaFile(file, options);
    });

    return Promise.all(promises);
  }

  function createVideoElement(file, options) {
    options = options || {};
    var video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = options.controls !== undefined ? options.controls : true;
    video.muted = options.muted !== undefined ? options.muted : false;
    video.loop = options.loop || false;
    video.autoplay = options.autoplay || false;
    video.playsInline = true;
    video.preload = options.preload || 'metadata';

    if (options.className) video.className = options.className;
    if (options.width) video.width = options.width;
    if (options.height) video.height = options.height;
    if (options.poster) video.poster = options.poster;

    return video;
  }

  function getVideoSnapshotBlob(file, options) {
    options = options || {};
    return extractVideoThumbnail(file, options).then(function (thumb) {
      var byteString = atob(thumb.dataUrl.split(',')[1]);
      var mimeType = thumb.dataUrl.split(',')[0].split(':')[1].split(';')[0];
      var ab = new ArrayBuffer(byteString.length);
      var ia = new Uint8Array(ab);
      for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      var blob = new Blob([ab], { type: mimeType });
      return {
        blob: blob,
        width: thumb.width,
        height: thumb.height,
        seekTime: thumb.seekTime,
        mimeType: mimeType
      };
    });
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
    getGreeting: getGreeting,
    getFileExtension: getFileExtension,
    isVideoFile: isVideoFile,
    isImageFile: isImageFile,
    getMediaType: getMediaType,
    isSupportedMedia: isSupportedMedia,
    formatFileSize: formatFileSize,
    getVideoMetadata: getVideoMetadata,
    validateVideoFile: validateVideoFile,
    formatDuration: formatDuration,
    extractVideoThumbnail: extractVideoThumbnail,
    extractVideoThumbnails: extractVideoThumbnails,
    extractImageDimensions: extractImageDimensions,
    processMediaFile: processMediaFile,
    processMediaFiles: processMediaFiles,
    createVideoElement: createVideoElement,
    getVideoSnapshotBlob: getVideoSnapshotBlob,
    SUPPORTED_VIDEO_MIME_TYPES: SUPPORTED_VIDEO_MIME_TYPES,
    VIDEO_EXTENSIONS: VIDEO_EXTENSIONS,
    SUPPORTED_IMAGE_MIME_TYPES: SUPPORTED_IMAGE_MIME_TYPES
  };
})();
