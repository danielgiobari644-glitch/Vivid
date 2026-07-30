(function () {
  'use strict';

  /* ============================
     State Management
     ============================ */
  var state = {
    projectId: null,
    name: 'Untitled Project',
    aspectRatio: '16:9',
    images: [],
    texts: [],
    audio: null,
    settings: { bgColor: '#000000' },
    selectedElement: null,
    selectedType: null,
    undoStack: [],
    redoStack: [],
    isPlaying: false,
    currentTime: 0,
    zoom: 100,
    exportResolution: '1080p',
    exportRenderId: null,
    exportPollTimer: null
  };

  var autoSaveTimer = null;
  var playAnimFrame = null;
  var lastPlayTimestamp = null;
  var cropImageId = null;
  var cropBase64 = null;
  var audioElement = null;
  var audioObjectUrl = null;

  function generateId() {
    if (window.GIODAIUtils && window.GIODAIUtils.generateId) {
      return window.GIODAIUtils.generateId();
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

  function showToast(type, title, message) {
    if (window.GIODAIUtils && window.GIODAIUtils.showToast) {
      window.GIODAIUtils.showToast(type, title, message);
    }
  }

  function openModal(id) {
    if (window.GIODAIUtils && window.GIODAIUtils.openModal) {
      window.GIODAIUtils.openModal(id);
    }
  }

  function closeModal(id) {
    if (window.GIODAIUtils && window.GIODAIUtils.closeModal) {
      window.GIODAIUtils.closeModal(id);
    }
  }

  function getTotalDuration() {
    var total = 0;
    for (var i = 0; i < state.images.length; i++) {
      total += state.images[i].duration || 3;
    }
    if (total === 0) {
      for (var j = 0; j < state.texts.length; j++) {
        var end = state.texts[j].endTime || 3;
        total = Math.max(total, end);
      }
    }
    if (total === 0) total = 1;
    return total;
  }

  function cloneState() {
    return JSON.parse(JSON.stringify({
      name: state.name,
      aspectRatio: state.aspectRatio,
      images: state.images,
      texts: state.texts,
      audio: state.audio,
      settings: state.settings
    }));
  }

  function pushUndo() {
    state.undoStack.push(cloneState());
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function restoreState(snapshot) {
    state.name = snapshot.name;
    state.aspectRatio = snapshot.aspectRatio;
    state.images = snapshot.images;
    state.texts = snapshot.texts;
    state.audio = snapshot.audio;
    state.settings = snapshot.settings || { bgColor: '#000000' };
    state.selectedElement = null;
    state.selectedType = null;
  }

  function updateUndoRedoButtons() {
    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
  }

  /* ============================
     Utility Helpers
     ============================ */
  function $(id) { return document.getElementById(id); }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function getImageAtTime(time) {
    var elapsed = 0;
    for (var i = 0; i < state.images.length; i++) {
      var dur = state.images[i].duration || 3;
      if (time >= elapsed && time < elapsed + dur) {
        return { image: state.images[i], index: i, localTime: time - elapsed, progress: (time - elapsed) / dur };
      }
      elapsed += dur;
    }
    if (state.images.length > 0) {
      return { image: state.images[state.images.length - 1], index: state.images.length - 1, localTime: 0, progress: 1 };
    }
    return null;
  }

  /* ============================
     Init & Auth
     ============================ */
  function initEditor() {
    var auth = window.firebaseAuth;
    if (!auth) {
      window.addEventListener('firebase-ready', initEditor);
      return;
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href = 'auth/login.html';
        return;
      }
      loadProject();
    });
  }

  function loadProject() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    var nameInput = $('projectName');

    if (id) {
      state.projectId = id;
      var db = window.firebaseDb;
      db.collection('projects').doc(id).get().then(function (doc) {
        if (doc.exists) {
          var data = doc.data();
          state.name = data.name || 'Untitled Project';
          state.aspectRatio = data.aspectRatio || '16:9';
          state.images = data.images || [];
          state.texts = data.texts || [];
          state.audio = data.audio || null;
          state.settings = data.settings || { bgColor: '#000000' };
          if (nameInput) nameInput.value = state.name;
          setAspectRatio(state.aspectRatio, true);
          if ($('propBgColor')) $('propBgColor').value = state.settings.bgColor || '#000000';
          refreshAll();
          showToast('success', 'Project Loaded', '"' + state.name + '" loaded successfully.');
        } else {
          showToast('error', 'Not Found', 'Project not found. Creating a new one.');
          createNewProject();
        }
      }).catch(function (err) {
        console.error('Failed to load project:', err);
        showToast('error', 'Load Error', 'Failed to load project. Starting fresh.');
        createNewProject();
      });
    } else {
      createNewProject();
    }
  }

  function createNewProject() {
    var nameInput = $('projectName');
    if (nameInput) nameInput.value = state.name;
    refreshAll();
  }

  /* ============================
     Firestore Save
     ============================ */
  function saveToFirestore() {
    var auth = window.firebaseAuth;
    var db = window.firebaseDb;
    if (!auth || !db || !auth.currentUser) return;

    var data = {
      name: state.name,
      aspectRatio: state.aspectRatio,
      images: state.images,
      texts: state.texts,
      audio: state.audio,
      settings: state.settings,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!state.projectId) {
      state.projectId = generateId();
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.uid = auth.currentUser.uid;
    }

    db.collection('projects').doc(state.projectId).set(data, { merge: true }).then(function () {
      var url = new URL(window.location.href);
      url.searchParams.set('id', state.projectId);
      window.history.replaceState({}, '', url.toString());
      showToast('success', 'Saved', 'Project saved successfully.');
    }).catch(function (err) {
      console.error('Save failed:', err);
      showToast('error', 'Save Failed', 'Could not save project.');
    });
  }

  function debouncedSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      saveToFirestore();
    }, 30000);
  }

  /* ============================
     Refresh All UI
     ============================ */
  function refreshAll() {
    renderMediaGrid();
    renderLayers();
    renderTextLayerList();
    renderTimeline();
    renderPreview();
    renderInspector();
    updateTimeDisplay();
    renderAudioTrackList();
    updateUndoRedoButtons();
    debouncedSave();
  }

  /* ============================
     Media Panel (Images)
     ============================ */
  function initMediaPanel() {
    var uploadZone = $('mediaUploadZone');
    var fileInput = $('imageFileInput');

    if (uploadZone) {
      uploadZone.addEventListener('click', function () {
        if (fileInput) fileInput.click();
      });
      uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('drag-over');
      });
      uploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');
      });
      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        handleImageFiles(files);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        handleImageFiles(e.target.files);
        fileInput.value = '';
      });
    }
  }

  function handleImageFiles(files) {
    if (!files || files.length === 0) return;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        promises.push(readFileAsDataURL(files[i]).then(function (dataUrl) {
          return dataUrl;
        }));
      }
    }
    Promise.all(promises).then(function (dataUrls) {
      if (dataUrls.length === 0) return;
      pushUndo();
      for (var j = 0; j < dataUrls.length; j++) {
        state.images.push({
          id: generateId(),
          dataUrl: dataUrls[j],
          name: 'Image ' + (state.images.length + 1),
          duration: 3,
          order: state.images.length,
          effect: 'none',
          transition: 'none',
          rotation: 0,
          zoom: 100,
          cropX: 0,
          cropY: 0,
          cropWidth: 100,
          cropHeight: 100
        });
      }
      refreshAll();
    }).catch(function (err) {
      console.error('Error reading images:', err);
      showToast('error', 'Upload Error', 'Failed to read one or more images.');
    });
  }

  function renderMediaGrid() {
    var grid = $('mediaGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (var i = 0; i < state.images.length; i++) {
      var img = state.images[i];
      var item = document.createElement('div');
      item.className = 'media-item' + (state.selectedType === 'image' && state.selectedElement === img.id ? ' selected' : '');
      item.setAttribute('draggable', 'true');
      item.setAttribute('data-id', img.id);
      item.setAttribute('data-index', String(i));

      item.innerHTML =
        '<img src="' + img.dataUrl + '" alt="' + img.name + '" loading="lazy">' +
        '<div class="media-item-order">' + (i + 1) + '</div>' +
        '<div class="media-item-duration">' + img.duration + 's</div>' +
        '<div class="media-item-overlay">' +
          '<div class="media-item-action" data-action="delete" title="Delete">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
          '</div>' +
          '<div class="media-item-action" data-action="duplicate" title="Duplicate">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          '</div>' +
          '<div class="media-item-action" data-action="crop" title="Crop">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg>' +
          '</div>' +
          '<div class="media-item-action" data-action="moveup" title="Move Up">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>' +
          '</div>' +
          '<div class="media-item-action" data-action="movedown" title="Move Down">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</div>' +
        '</div>';

      (function (index, imageId) {
        item.addEventListener('click', function (e) {
          if (e.target.closest('.media-item-action')) return;
          selectElement('image', imageId);
        });

        item.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', String(index));
          e.dataTransfer.effectAllowed = 'move';
          item.style.opacity = '0.4';
        });

        item.addEventListener('dragend', function () {
          item.style.opacity = '1';
        });

        item.addEventListener('dragover', function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });

        item.addEventListener('drop', function (e) {
          e.preventDefault();
          var fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
          var toIndex = index;
          if (fromIndex !== toIndex && !isNaN(fromIndex)) {
            pushUndo();
            var moved = state.images.splice(fromIndex, 1)[0];
            state.images.splice(toIndex, 0, moved);
            refreshAll();
          }
        });
      })(i, img.id);

      var actions = item.querySelectorAll('.media-item-action');
      for (var a = 0; a < actions.length; a++) {
        (function (actionEl) {
          actionEl.addEventListener('click', function (e) {
            e.stopPropagation();
            var action = actionEl.getAttribute('data-action');
            var idx = parseInt(actionEl.closest('.media-item').getAttribute('data-index'), 10);
            handleMediaAction(action, idx);
          });
        })(actions[a]);
      }

      grid.appendChild(item);
    }
  }

  function handleMediaAction(action, index) {
    if (index < 0 || index >= state.images.length) return;
    pushUndo();

    switch (action) {
      case 'delete':
        state.images.splice(index, 1);
        if (state.selectedType === 'image' && state.images.length === 0) {
          state.selectedElement = null;
          state.selectedType = null;
        }
        refreshAll();
        break;

      case 'duplicate':
        var orig = state.images[index];
        var dup = JSON.parse(JSON.stringify(orig));
        dup.id = generateId();
        dup.name = orig.name + ' (copy)';
        state.images.splice(index + 1, 0, dup);
        refreshAll();
        break;

      case 'crop':
        cropImageId = state.images[index].id;
        openCropModal(state.images[index]);
        break;

      case 'moveup':
        if (index > 0) {
          var temp = state.images[index];
          state.images[index] = state.images[index - 1];
          state.images[index - 1] = temp;
          refreshAll();
        }
        break;

      case 'movedown':
        if (index < state.images.length - 1) {
          var tmp = state.images[index];
          state.images[index] = state.images[index + 1];
          state.images[index + 1] = tmp;
          refreshAll();
        }
        break;
    }
  }

  /* ============================
     Crop Modal
     ============================ */
  function openCropModal(imageObj) {
    cropBase64 = imageObj.dataUrl;
    var canvas = $('cropCanvas');
    var rotationSlider = $('cropRotation');
    var rotationVal = $('cropRotationVal');
    if (!canvas) return;

    var img = new Image();
    img.onload = function () {
      var maxW = 600, maxH = 400;
      var scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (rotationSlider) rotationSlider.value = 0;
      if (rotationVal) rotationVal.textContent = '0°';
    };
    img.src = cropBase64;
    openModal('cropModal');
  }

  function initCropModal() {
    var rotationSlider = $('cropRotation');
    var rotationVal = $('cropRotationVal');
    var applyBtn = $('applyCropBtn');

    if (rotationSlider) {
      rotationSlider.addEventListener('input', function () {
        var deg = parseInt(rotationSlider.value, 10);
        if (rotationVal) rotationVal.textContent = deg + '°';
        drawCropPreview(deg);
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        if (!cropImageId || !cropBase64) return;
        var deg = parseInt($('cropRotation').value, 10);
        for (var i = 0; i < state.images.length; i++) {
          if (state.images[i].id === cropImageId) {
            var canvas = $('cropCanvas');
            var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            pushUndo();
            state.images[i].dataUrl = dataUrl;
            state.images[i].rotation = deg;
            refreshAll();
            break;
          }
        }
        closeModal('cropModal');
        cropImageId = null;
        cropBase64 = null;
      });
    }
  }

  function drawCropPreview(degrees) {
    var canvas = $('cropCanvas');
    if (!canvas || !cropBase64) return;
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.onload = function () {
      var rad = (degrees || 0) * Math.PI / 180;
      var sin = Math.abs(Math.sin(rad));
      var cos = Math.abs(Math.cos(rad));
      var maxW = 600, maxH = 400;
      var newW = img.width * cos + img.height * sin;
      var newH = img.width * sin + img.height * cos;
      var scale = Math.min(maxW / newW, maxH / newH, 1);
      canvas.width = Math.round(newW * scale);
      canvas.height = Math.round(newH * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
      ctx.restore();
    };
    img.src = cropBase64;
  }

  /* ============================
     Layers Panel
     ============================ */
  function renderLayers() {
    var list = $('layersList');
    if (!list) return;
    list.innerHTML = '';

    var allLayers = [];
    for (var i = 0; i < state.images.length; i++) {
      allLayers.push({ id: state.images[i].id, name: state.images[i].name, type: 'image', thumb: state.images[i].dataUrl, order: i, visible: true, locked: false });
    }
    for (var j = 0; j < state.texts.length; j++) {
      allLayers.push({ id: state.texts[j].id, name: state.texts[j].content || 'Text', type: 'text', thumb: null, order: j, visible: true, locked: false });
    }

    allLayers.reverse();

    for (var k = 0; k < allLayers.length; k++) {
      var layer = allLayers[k];
      var el = document.createElement('div');
      el.className = 'layer-item' + (state.selectedElement === layer.id ? ' active' : '');
      el.setAttribute('draggable', 'true');

      var thumbHtml = layer.thumb
        ? '<div class="layer-thumb"><img src="' + layer.thumb + '" alt=""></div>'
        : '<div class="layer-thumb" style="display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--color-accent)">T</div>';

      el.innerHTML = thumbHtml +
        '<div class="layer-info"><div class="layer-name">' + layer.name + '</div><div class="layer-type">' + layer.type + '</div></div>' +
        '<div class="layer-actions">' +
          '<div class="layer-action-btn visibility-btn" data-id="' + layer.id + '" title="Toggle Visibility">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</div>' +
        '</div>';

      (function (lid, ltype) {
        el.addEventListener('click', function (e) {
          if (e.target.closest('.layer-action-btn')) return;
          selectElement(ltype, lid);
        });
        el.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', 'layer:' + lid);
          e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragover', function (e) { e.preventDefault(); });
        el.addEventListener('drop', function (e) {
          e.preventDefault();
          var fromData = e.dataTransfer.getData('text/plain');
          if (!fromData.startsWith('layer:')) return;
          var fromId = fromData.replace('layer:', '');
          if (fromId === lid) return;
          pushUndo();
          var fromIdx = findLayerArrayIndex(fromId);
          var toIdx = findLayerArrayIndex(lid);
          if (fromIdx !== null && toIdx !== null && fromIdx !== toIdx) {
            reorderLayer(fromId, toIdx);
            refreshAll();
          }
        });
      })(layer.id, layer.type);

      list.appendChild(el);
    }

    var addBtn = $('addTextLayerBtn');
    if (addBtn) {
      addBtn.onclick = function () {
        addTextLayer('title');
      };
    }
  }

  function findLayerArrayIndex(id) {
    for (var i = 0; i < state.images.length; i++) {
      if (state.images[i].id === id) return { arr: 'images', idx: i };
    }
    for (var j = 0; j < state.texts.length; j++) {
      if (state.texts[j].id === id) return { arr: 'texts', idx: j };
    }
    return null;
  }

  function reorderLayer(fromId, toId) {
    var from = findLayerArrayIndex(fromId);
    var to = findLayerArrayIndex(toId);
    if (!from || !to) return;
    if (from.arr === to.arr) {
      var arr = state[from.arr];
      var item = arr.splice(from.idx, 1)[0];
      var newIdx = to.idx > from.idx ? to.idx - 1 : to.idx;
      arr.splice(newIdx, 0, item);
    }
  }

  /* ============================
     Audio Panel
     ============================ */
  function initAudioPanel() {
    var uploadZone = $('audioUploadZone');
    var fileInput = $('audioFileInput');

    if (uploadZone) {
      uploadZone.addEventListener('click', function () { if (fileInput) fileInput.click(); });
      uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); uploadZone.classList.add('drag-over'); });
      uploadZone.addEventListener('dragleave', function (e) { e.preventDefault(); uploadZone.classList.remove('drag-over'); });
      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleAudioFile(e.dataTransfer.files[0]);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files.length > 0) handleAudioFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }

    bindSlider('audioVolume', 'audioVolumeVal', function (v) { return v + '%'; }, function (v) { if (state.audio) state.audio.volume = v / 100; });
    bindSlider('audioFadeIn', 'audioFadeInVal', function (v) { return parseFloat(v).toFixed(1) + 's'; }, function (v) { if (state.audio) state.audio.fadeIn = parseFloat(v); });
    bindSlider('audioFadeOut', 'audioFadeOutVal', function (v) { return parseFloat(v).toFixed(1) + 's'; }, function (v) { if (state.audio) state.audio.fadeOut = parseFloat(v); });
  }

  function handleAudioFile(file) {
    if (!file.type.startsWith('audio/')) {
      showToast('error', 'Invalid File', 'Please select a valid audio file.');
      return;
    }
    pushUndo();

    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(file);

    var tempAudio = new Audio();
    tempAudio.src = audioObjectUrl;
    tempAudio.addEventListener('loadedmetadata', function () {
      state.audio = {
        id: generateId(),
        name: file.name,
        objectUrl: audioObjectUrl,
        duration: tempAudio.duration,
        volume: 80,
        fadeIn: 0,
        fadeOut: 0,
        trimStart: 0,
        trimEnd: tempAudio.duration
      };

      if ($('audioVolume')) $('audioVolume').value = 80;
      if ($('audioVolumeVal')) $('audioVolumeVal').textContent = '80%';
      if ($('audioFadeIn')) $('audioFadeIn').value = 0;
      if ($('audioFadeInVal')) $('audioFadeInVal').textContent = '0.0s';
      if ($('audioFadeOut')) $('audioFadeOut').value = 0;
      if ($('audioFadeOutVal')) $('audioFadeOutVal').textContent = '0.0s';
      if ($('audioTrimStart')) $('audioTrimStart').value = '0.0s';
      if ($('audioTrimEnd')) $('audioTrimEnd').value = tempAudio.duration.toFixed(1) + 's';

      refreshAll();
      showToast('success', 'Audio Added', '"' + file.name + '" added to project.');
    });

    tempAudio.addEventListener('error', function () {
      showToast('error', 'Audio Error', 'Failed to load audio file.');
    });
  }

  function renderAudioTrackList() {
    var list = $('audioTrackList');
    var controls = $('audioControls');
    if (!list) return;

    if (state.audio) {
      list.innerHTML =
        '<div class="audio-track-item">' +
          '<div class="audio-track-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>' +
          '<div class="audio-track-info"><div class="audio-track-name">' + state.audio.name + '</div><div class="audio-track-duration">' + formatTime(state.audio.duration) + '</div></div>' +
        '</div>';
      if (controls) controls.style.display = 'block';
    } else {
      list.innerHTML = '';
      if (controls) controls.style.display = 'none';
    }
  }

  /* ============================
     Text Panel
     ============================ */
  function initTextPanel() {
    var titleBtn = $('addTitleBtn');
    var captionBtn = $('addCaptionBtn');
    var subtitleBtn = $('addSubtitleBtn');

    if (titleBtn) titleBtn.addEventListener('click', function () { addTextLayer('title'); });
    if (captionBtn) captionBtn.addEventListener('click', function () { addTextLayer('caption'); });
    if (subtitleBtn) subtitleBtn.addEventListener('click', function () { addTextLayer('subtitle'); });
  }

  function addTextLayer(type) {
    pushUndo();
    var textObj = {
      id: generateId(),
      type: type,
      content: type === 'title' ? 'Your Title' : type === 'caption' ? 'Your Caption' : 'Your Subtitle',
      fontFamily: 'Inter',
      fontSize: type === 'title' ? 48 : type === 'caption' ? 28 : 20,
      fontColor: '#ffffff',
      x: 50,
      y: type === 'title' ? 15 : type === 'caption' ? 85 : 50,
      startTime: 0,
      endTime: getTotalDuration(),
      animation: 'none',
      shadow: false,
      outline: false,
      outlineColor: '#000000',
      bold: type === 'title',
      italic: false
    };
    state.texts.push(textObj);
    selectElement('text', textObj.id);
    refreshAll();
  }

  function renderTextLayerList() {
    var list = $('textLayerList');
    if (!list) return;
    list.innerHTML = '';

    for (var i = 0; i < state.texts.length; i++) {
      var t = state.texts[i];
      var el = document.createElement('div');
      el.className = 'layer-item' + (state.selectedType === 'text' && state.selectedElement === t.id ? ' active' : '');
      el.innerHTML =
        '<div class="layer-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--color-accent);background:rgba(var(--color-accent-rgb),0.1)">T</div>' +
        '<div class="layer-info"><div class="layer-name">' + (t.content || 'Text') + '</div><div class="layer-type">' + t.type + ' — ' + t.fontSize + 'px</div></div>';

      (function (tid) {
        el.addEventListener('click', function () { selectElement('text', tid); });
      })(t.id);

      list.appendChild(el);
    }
  }

  /* ============================
     Selection
     ============================ */
  function selectElement(type, id) {
    state.selectedElement = id;
    state.selectedType = type;
    renderMediaGrid();
    renderLayers();
    renderTextLayerList();
    renderTimeline();
    renderInspector();
    renderPreview();
  }

  function deselectAll() {
    state.selectedElement = null;
    state.selectedType = null;
    renderInspector();
    renderMediaGrid();
    renderLayers();
    renderTimeline();
    renderPreview();
  }

  function getSelectedImage() {
    if (state.selectedType !== 'image') return null;
    for (var i = 0; i < state.images.length; i++) {
      if (state.images[i].id === state.selectedElement) return state.images[i];
    }
    return null;
  }

  function getSelectedText() {
    if (state.selectedType !== 'text') return null;
    for (var i = 0; i < state.texts.length; i++) {
      if (state.texts[i].id === state.selectedElement) return state.texts[i];
    }
    return null;
  }

  /* ============================
     Inspector Panel
     ============================ */
  function renderInspector() {
    var noSel = $('noSelectionHint');
    var imgProps = $('imageProperties');
    var txtProps = $('textProperties');

    if (noSel) noSel.style.display = 'none';
    if (imgProps) imgProps.style.display = 'none';
    if (txtProps) txtProps.style.display = 'none';

    if (state.selectedType === 'image') {
      if (imgProps) imgProps.style.display = 'block';
      populateImageInspector();
    } else if (state.selectedType === 'text') {
      if (txtProps) txtProps.style.display = 'block';
      populateTextInspector();
    } else {
      if (noSel) noSel.style.display = 'block';
    }
  }

  function populateImageInspector() {
    var img = getSelectedImage();
    if (!img) return;

    var duration = $('propDuration');
    var rotation = $('propRotation');
    var rotationVal = $('propRotationVal');
    var zoom = $('propZoom');
    var zoomVal = $('propZoomVal');

    if (duration) duration.value = img.duration + 's';
    if (rotation) rotation.value = img.rotation || 0;
    if (rotationVal) rotationVal.textContent = (img.rotation || 0) + '°';
    if (zoom) zoom.value = img.zoom || 100;
    if (zoomVal) zoomVal.textContent = (img.zoom || 100) + '%';

    updateGridActive('effectGrid', 'data-effect', img.effect || 'none');
    updateGridActive('transitionGrid', 'data-transition', img.transition || 'none');
  }

  function populateTextInspector() {
    var txt = getSelectedText();
    if (!txt) return;

    var content = $('propTextContent');
    var fontFamily = $('propFontFamily');
    var fontSize = $('propFontSize');
    var fontSizeVal = $('propFontSizeVal');
    var fontColor = $('propFontColor');
    var bold = $('propFontBold');
    var italic = $('propFontItalic');
    var shadow = $('propTextShadow');
    var outline = $('propTextOutline');
    var outlineRow = $('outlineColorRow');
    var outlineColor = $('propOutlineColor');
    var textX = $('propTextX');
    var textY = $('propTextY');
    var textStart = $('propTextStart');
    var textEnd = $('propTextEnd');

    if (content) content.value = txt.content || '';
    if (fontFamily) fontFamily.value = txt.fontFamily || 'Inter';
    if (fontSize) fontSize.value = txt.fontSize || 32;
    if (fontSizeVal) fontSizeVal.textContent = (txt.fontSize || 32) + 'px';
    if (fontColor) fontColor.value = txt.fontColor || '#ffffff';
    if (bold) bold.checked = !!txt.bold;
    if (italic) italic.checked = !!txt.italic;
    if (shadow) shadow.checked = !!txt.shadow;
    if (outline) outline.checked = !!txt.outline;
    if (outlineRow) outlineRow.style.display = txt.outline ? 'flex' : 'none';
    if (outlineColor) outlineColor.value = txt.outlineColor || '#000000';
    if (textX) textX.value = txt.x || 50;
    if (textY) textY.value = txt.y || 50;
    if (textStart) textStart.value = (txt.startTime || 0).toFixed(1) + 's';
    if (textEnd) textEnd.value = (txt.endTime || 3).toFixed(1) + 's';

    updateGridActive('textAnimGrid', 'data-anim', txt.animation || 'none');
  }

  function updateGridActive(gridId, attrName, activeVal) {
    var grid = $(gridId);
    if (!grid) return;
    var items = grid.querySelectorAll('.animation-option');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute(attrName) === activeVal) {
        items[i].classList.add('active');
      } else {
        items[i].classList.remove('active');
      }
    }
  }

  function initInspector() {
    bindImageInspectorInputs();
    bindTextInspectorInputs();
    bindAspectRatio();
    bindBgColor();
  }

  function bindImageInspectorInputs() {
    var duration = $('propDuration');
    if (duration) {
      duration.addEventListener('change', function () {
        var img = getSelectedImage();
        if (!img) return;
        var val = parseFloat(duration.value);
        if (isNaN(val) || val < 0.1) val = 0.1;
        pushUndo();
        img.duration = Math.round(val * 10) / 10;
        duration.value = img.duration + 's';
        refreshAll();
      });
    }

    bindSlider('propRotation', 'propRotationVal', function (v) { return v + '°'; }, function (v) {
      var img = getSelectedImage();
      if (img) { pushUndo(); img.rotation = parseInt(v, 10); renderPreview(); }
    });

    bindSlider('propZoom', 'propZoomVal', function (v) { return v + '%'; }, function (v) {
      var img = getSelectedImage();
      if (img) { pushUndo(); img.zoom = parseInt(v, 10); renderPreview(); }
    });

    bindGrid('effectGrid', 'data-effect', function (val) {
      var img = getSelectedImage();
      if (img) { pushUndo(); img.effect = val; renderPreview(); }
    });

    bindGrid('transitionGrid', 'data-transition', function (val) {
      var img = getSelectedImage();
      if (img) { pushUndo(); img.transition = val; renderPreview(); }
    });
  }

  function bindTextInspectorInputs() {
    var content = $('propTextContent');
    if (content) {
      content.addEventListener('input', function () {
        var txt = getSelectedText();
        if (txt) { txt.content = content.value; renderPreview(); renderTextLayerList(); }
      });
      content.addEventListener('change', function () {
        pushUndo();
      });
    }

    var fontFamily = $('propFontFamily');
    if (fontFamily) {
      fontFamily.addEventListener('change', function () {
        var txt = getSelectedText();
        if (txt) { pushUndo(); txt.fontFamily = fontFamily.value; renderPreview(); }
      });
    }

    bindSlider('propFontSize', 'propFontSizeVal', function (v) { return v + 'px'; }, function (v) {
      var txt = getSelectedText();
      if (txt) { txt.fontSize = parseInt(v, 10); renderPreview(); }
      pushUndo();
    });

    var fontColor = $('propFontColor');
    if (fontColor) {
      fontColor.addEventListener('input', function () {
        var txt = getSelectedText();
        if (txt) { txt.fontColor = fontColor.value; renderPreview(); }
      });
      fontColor.addEventListener('change', function () { pushUndo(); });
    }

    bindToggle('propFontBold', function (checked) {
      var txt = getSelectedText(); if (txt) { pushUndo(); txt.bold = checked; renderPreview(); }
    });
    bindToggle('propFontItalic', function (checked) {
      var txt = getSelectedText(); if (txt) { pushUndo(); txt.italic = checked; renderPreview(); }
    });
    bindToggle('propTextShadow', function (checked) {
      var txt = getSelectedText(); if (txt) { pushUndo(); txt.shadow = checked; renderPreview(); }
    });
    bindToggle('propTextOutline', function (checked) {
      var txt = getSelectedText();
      if (txt) {
        pushUndo();
        txt.outline = checked;
        var outlineRow = $('outlineColorRow');
        if (outlineRow) outlineRow.style.display = checked ? 'flex' : 'none';
        renderPreview();
      }
    });

    var outlineColor = $('propOutlineColor');
    if (outlineColor) {
      outlineColor.addEventListener('input', function () {
        var txt = getSelectedText();
        if (txt) { txt.outlineColor = outlineColor.value; renderPreview(); }
      });
      outlineColor.addEventListener('change', function () { pushUndo(); });
    }

    bindTextInput('propTextX', function (val) {
      var txt = getSelectedText(); if (txt) { txt.x = parseFloat(val) || 50; renderPreview(); }
    }, function () { pushUndo(); });

    bindTextInput('propTextY', function (val) {
      var txt = getSelectedText(); if (txt) { txt.y = parseFloat(val) || 50; renderPreview(); }
    }, function () { pushUndo(); });

    bindTextInput('propTextStart', function (val) {
      var txt = getSelectedText(); if (txt) { txt.startTime = parseFloat(val) || 0; renderTimeline(); renderPreview(); }
    }, function () { pushUndo(); });

    bindTextInput('propTextEnd', function (val) {
      var txt = getSelectedText(); if (txt) { txt.endTime = parseFloat(val) || 3; renderTimeline(); renderPreview(); }
    }, function () { pushUndo(); });

    bindGrid('textAnimGrid', 'data-anim', function (val) {
      var txt = getSelectedText();
      if (txt) { pushUndo(); txt.animation = val; renderPreview(); }
    });
  }

  function bindSlider(sliderId, valId, formatFn, callback) {
    var slider = $(sliderId);
    var valEl = $(valId);
    if (!slider) return;
    slider.addEventListener('input', function () {
      if (valEl) valEl.textContent = formatFn(slider.value);
      callback(slider.value);
    });
  }

  function bindToggle(checkboxId, callback) {
    var cb = $(checkboxId);
    if (!cb) return;
    cb.addEventListener('change', function () { callback(cb.checked); });
  }

  function bindTextInput(inputId, onInput, onChange) {
    var el = $(inputId);
    if (!el) return;
    el.addEventListener('input', function () { onInput(el.value); });
    el.addEventListener('change', function () { onChange(); });
  }

  function bindGrid(gridId, attrName, callback) {
    var grid = $(gridId);
    if (!grid) return;
    var items = grid.querySelectorAll('.animation-option');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('click', function () {
          var val = item.getAttribute(attrName);
          updateGridActive(gridId, attrName, val);
          callback(val);
        });
      })(items[i]);
    }
  }

  /* ============================
     Aspect Ratio & Background
     ============================ */
  function bindAspectRatio() {
    var selector = $('aspectRatioSelector');
    if (!selector) return;
    var btns = selector.querySelectorAll('.aspect-ratio-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var ratio = btn.getAttribute('data-ratio');
          pushUndo();
          setAspectRatio(ratio);
          refreshAll();
        });
      })(btns[i]);
    }
  }

  function setAspectRatio(ratio, skipState) {
    state.aspectRatio = ratio;
    var wrapper = $('previewWrapper');
    if (wrapper) {
      wrapper.className = 'editor-preview-wrapper aspect-' + ratio.replace(':', '-');
    }
    var selector = $('aspectRatioSelector');
    if (selector) {
      var btns = selector.querySelectorAll('.aspect-ratio-btn');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-ratio') === ratio) {
          btns[i].classList.add('active');
        } else {
          btns[i].classList.remove('active');
        }
      }
    }
  }

  function bindBgColor() {
    var bgColor = $('propBgColor');
    if (!bgColor) return;
    bgColor.addEventListener('input', function () {
      state.settings.bgColor = bgColor.value;
      var canvas = $('previewCanvas');
      if (canvas) canvas.style.backgroundColor = bgColor.value;
    });
    bgColor.addEventListener('change', function () {
      pushUndo();
      debouncedSave();
    });
  }

  /* ============================
     Preview Canvas
     ============================ */
  function renderPreview() {
    var canvas = $('previewCanvas');
    var emptyState = $('previewEmpty');
    if (!canvas) return;

    canvas.style.backgroundColor = state.settings.bgColor || '#000000';

    var existingImages = canvas.querySelectorAll('img.preview-img');
    for (var ei = 0; ei < existingImages.length; ei++) existingImages[ei].remove();
    var existingTexts = canvas.querySelectorAll('.editor-text-overlay');
    for (var et = 0; et < existingTexts.length; et++) existingTexts[et].remove();

    if (emptyState) {
      emptyState.style.display = state.images.length === 0 ? 'flex' : 'none';
    }

    var info = getImageAtTime(state.currentTime);
    if (info && info.image) {
      var imgEl = document.createElement('img');
      imgEl.className = 'preview-img';
      imgEl.src = info.image.dataUrl;
      imgEl.alt = info.image.name;
      imgEl.draggable = false;

      var transforms = getEffectTransform(info.image, info.progress);
      if (transforms) {
        imgEl.style.transform = transforms;
      }

      imgEl.addEventListener('click', function (e) {
        e.stopPropagation();
        selectElement('image', info.image.id);
      });

      canvas.appendChild(imgEl);
    }

    for (var t = 0; t < state.texts.length; t++) {
      var txt = state.texts[t];
      var elapsed = 0;
      var showText = false;
      for (var ti = 0; ti < state.images.length; ti++) {
        if (state.currentTime >= txt.startTime && state.currentTime <= txt.endTime) {
          showText = true;
          break;
        }
      }
      if (state.currentTime >= txt.startTime && state.currentTime <= txt.endTime) {
        showText = true;
      }

      if (!showText) continue;

      var textEl = document.createElement('div');
      textEl.className = 'editor-text-overlay' + (state.selectedType === 'text' && state.selectedElement === txt.id ? ' selected' : '');
      textEl.textContent = txt.content;
      textEl.style.left = txt.x + '%';
      textEl.style.top = txt.y + '%';
      textEl.style.transform = 'translate(-50%, -50%)';
      textEl.style.fontFamily = '"' + txt.fontFamily + '", sans-serif';
      textEl.style.fontSize = txt.fontSize + 'px';
      textEl.style.color = txt.fontColor;
      textEl.style.fontWeight = txt.bold ? '700' : '400';
      textEl.style.fontStyle = txt.italic ? 'italic' : 'normal';
      textEl.style.textAlign = 'center';
      textEl.style.whiteSpace = 'nowrap';

      if (txt.shadow) {
        textEl.style.textShadow = '2px 2px 8px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.5)';
      }

      if (txt.outline) {
        textEl.style.webkitTextStroke = '1px ' + (txt.outlineColor || '#000000');
        textEl.style.paintOrder = 'stroke fill';
      }

      var animOpacity = getTextAnimOpacity(txt, state.currentTime);
      textEl.style.opacity = animOpacity;

      (function (tid) {
        textEl.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          selectElement('text', tid);
        });
      })(txt.id);

      canvas.appendChild(textEl);
    }
  }

  function getEffectTransform(image, progress) {
    var effect = image.effect || 'none';
    var zoomLevel = (image.zoom || 100) / 100;
    var rotation = image.rotation || 0;

    switch (effect) {
      case 'ken_burns':
        var kb = 1 + progress * 0.3;
        var tx = (0.5 - progress * 0.3) * 10;
        var ty = (0.5 - progress * 0.2) * 10;
        return 'scale(' + (kb * zoomLevel) + ') translate(' + tx + '%, ' + ty + '%) rotate(' + rotation + 'deg)';
      case 'smooth_zoom':
        var sz = 1 + progress * 0.2;
        return 'scale(' + (sz * zoomLevel) + ') rotate(' + rotation + 'deg)';
      case 'pan_left':
        var plx = (1 - progress * 0.1) * 5;
        return 'translateX(-' + plx + '%) scale(' + zoomLevel + ') rotate(' + rotation + 'deg)';
      case 'pan_right':
        var prx = (1 - progress * 0.1) * 5;
        return 'translateX(' + prx + '%) scale(' + zoomLevel + ') rotate(' + rotation + 'deg)';
      case 'pan_up':
        var puy = (1 - progress * 0.1) * 5;
        return 'translateY(-' + puy + '%) scale(' + zoomLevel + ') rotate(' + rotation + 'deg)';
      case 'pan_down':
        var pdy = (1 - progress * 0.1) * 5;
        return 'translateY(' + pdy + '%) scale(' + zoomLevel + ') rotate(' + rotation + 'deg)';
      case 'zoom_in':
        var zi = 1 + progress * 0.4;
        return 'scale(' + (zi * zoomLevel) + ') rotate(' + rotation + 'deg)';
      case 'zoom_out':
        var zo = 1.4 - progress * 0.4;
        return 'scale(' + (zo * zoomLevel) + ') rotate(' + rotation + 'deg)';
      default:
        if (zoomLevel !== 1 || rotation !== 0) {
          return 'scale(' + zoomLevel + ') rotate(' + rotation + 'deg)';
        }
        return '';
    }
  }

  function getTextAnimOpacity(txt, time) {
    var anim = txt.animation || 'none';
    var duration = txt.endTime - txt.startTime;
    if (duration <= 0) return 1;
    var progress = (time - txt.startTime) / duration;

    switch (anim) {
      case 'fade_in':
        return Math.min(1, progress * 5);
      case 'fade_out':
        return Math.max(0, 1 - Math.max(0, progress - 0.7) / 0.3);
      case 'typewriter':
        return 1;
      case 'slide_up':
        return Math.min(1, progress * 4);
      case 'scale_in':
        return Math.min(1, progress * 5);
      default:
        return 1;
    }
  }

  /* ============================
     Timeline
     ============================ */
  function renderTimeline() {
    renderTimelineRuler();
    renderVideoTrack();
    renderTextTrack();
    renderAudioTrack();
    updatePlayheadPosition();
  }

  var PIXELS_PER_SECOND = 80;

  function renderTimelineRuler() {
    var ruler = $('timelineRuler');
    if (!ruler) return;
    ruler.innerHTML = '';
    var total = getTotalDuration();
    var width = Math.max(total * PIXELS_PER_SECOND, ruler.parentElement ? ruler.parentElement.offsetWidth : 800);

    for (var s = 0; s <= total; s++) {
      var mark = document.createElement('div');
      mark.className = 'timeline-ruler-mark';
      mark.style.left = (s * PIXELS_PER_SECOND) + 'px';
      mark.innerHTML = '<span>' + formatTime(s) + '</span>';
      ruler.appendChild(mark);
    }
  }

  function renderVideoTrack() {
    var track = $('videoTrack');
    if (!track) return;
    track.innerHTML = '';
    var offset = 0;

    for (var i = 0; i < state.images.length; i++) {
      var img = state.images[i];
      var clip = document.createElement('div');
      clip.className = 'timeline-clip' + (state.selectedType === 'image' && state.selectedElement === img.id ? ' active' : '');
      clip.style.left = (offset * PIXELS_PER_SECOND) + 'px';
      clip.style.width = Math.max(img.duration * PIXELS_PER_SECOND, 40) + 'px';

      clip.innerHTML =
        '<div class="timeline-clip-thumb"><img src="' + img.dataUrl + '" alt=""></div>' +
        '<span>' + img.name + '</span>';

      (function (imageId) {
        clip.addEventListener('click', function () {
          selectElement('image', imageId);
        });
      })(img.id);

      track.appendChild(clip);
      offset += img.duration;
    }
  }

  function renderTextTrack() {
    var track = $('textTrack');
    if (!track) return;
    track.innerHTML = '';

    for (var i = 0; i < state.texts.length; i++) {
      var txt = state.texts[i];
      var startPx = txt.startTime * PIXELS_PER_SECOND;
      var endPx = txt.endTime * PIXELS_PER_SECOND;
      var width = Math.max(endPx - startPx, 40);

      var clip = document.createElement('div');
      clip.className = 'timeline-clip text' + (state.selectedType === 'text' && state.selectedElement === txt.id ? ' active' : '');
      clip.style.left = startPx + 'px';
      clip.style.width = width + 'px';

      clip.innerHTML = '<span>' + (txt.content || 'Text').substring(0, 20) + '</span>';

      (function (textId) {
        clip.addEventListener('click', function () {
          selectElement('text', textId);
        });
      })(txt.id);

      track.appendChild(clip);
    }
  }

  function renderAudioTrack() {
    var track = $('audioTrack');
    if (!track) return;
    track.innerHTML = '';

    if (state.audio) {
      var clip = document.createElement('div');
      clip.className = 'timeline-clip audio';
      clip.style.left = '0px';
      var dur = state.audio.trimEnd ? Math.min(state.audio.duration, state.audio.trimEnd) : state.audio.duration;
      clip.style.width = Math.max(dur * PIXELS_PER_SECOND, 40) + 'px';
      clip.innerHTML = '<span>' + state.audio.name + '</span>';
      track.appendChild(clip);
    }
  }

  function updatePlayheadPosition() {
    var playhead = $('timelinePlayhead');
    if (!playhead) return;
    var left = state.currentTime * PIXELS_PER_SECOND;
    playhead.style.left = left + 'px';
  }

  function initTimeline() {
    var tracks = $('timelineTracks');
    if (tracks) {
      tracks.addEventListener('click', function (e) {
        if (e.target.closest('.timeline-clip') || e.target.closest('.timeline-playhead')) return;
        var rect = tracks.getBoundingClientRect();
        var x = e.clientX - rect.left + tracks.scrollLeft;
        var time = x / PIXELS_PER_SECOND;
        seekTo(Math.max(0, time));
      });
    }

    initPlayheadDrag();
  }

  function initPlayheadDrag() {
    var playhead = $('timelinePlayhead');
    var tracks = $('timelineTracks');
    if (!playhead || !tracks) return;

    var dragging = false;

    playhead.style.pointerEvents = 'auto';
    playhead.style.cursor = 'col-resize';

    playhead.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var rect = tracks.getBoundingClientRect();
      var x = e.clientX - rect.left + tracks.scrollLeft;
      var time = Math.max(0, x / PIXELS_PER_SECOND);
      seekTo(time);
    });

    document.addEventListener('mouseup', function () {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  function seekTo(time) {
    state.currentTime = Math.max(0, Math.min(time, getTotalDuration()));
    updatePlayheadPosition();
    updateTimeDisplay();
    renderPreview();
  }

  function updateTimeDisplay() {
    var currentEl = $('currentTime');
    var totalEl = $('totalTime');
    if (currentEl) currentEl.textContent = formatTime(state.currentTime);
    if (totalEl) totalEl.textContent = formatTime(getTotalDuration());
  }

  /* ============================
     Playback
     ============================ */
  function initPlayback() {
    var playBtn = $('playBtn');
    var stopBtn = $('stopBtn');

    if (playBtn) {
      playBtn.addEventListener('click', togglePlay);
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', stopPlayback);
    }
  }

  function togglePlay() {
    if (state.isPlaying) {
      pausePlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    var total = getTotalDuration();
    if (state.currentTime >= total) {
      state.currentTime = 0;
    }
    state.isPlaying = true;
    lastPlayTimestamp = null;
    updatePlayButton();
    playAnimFrame = requestAnimationFrame(playFrame);
  }

  function pausePlayback() {
    state.isPlaying = false;
    if (playAnimFrame) cancelAnimationFrame(playAnimFrame);
    playAnimFrame = null;
    lastPlayTimestamp = null;
    updatePlayButton();
  }

  function stopPlayback() {
    pausePlayback();
    state.currentTime = 0;
    updatePlayheadPosition();
    updateTimeDisplay();
    renderPreview();
  }

  function playFrame(timestamp) {
    if (!state.isPlaying) return;

    if (lastPlayTimestamp === null) {
      lastPlayTimestamp = timestamp;
      playAnimFrame = requestAnimationFrame(playFrame);
      return;
    }

    var delta = (timestamp - lastPlayTimestamp) / 1000;
    lastPlayTimestamp = timestamp;

    state.currentTime += delta;
    var total = getTotalDuration();
    if (state.currentTime >= total) {
      state.currentTime = total;
      pausePlayback();
    }

    updatePlayheadPosition();
    updateTimeDisplay();
    renderPreview();

    if (state.isPlaying) {
      playAnimFrame = requestAnimationFrame(playFrame);
    }
  }

  function updatePlayButton() {
    var playBtn = $('playBtn');
    if (!playBtn) return;
    if (state.isPlaying) {
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      playBtn.classList.add('active');
    } else {
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      playBtn.classList.remove('active');
    }
  }

  /* ============================
     Panel Tabs
     ============================ */
  function initPanelTabs() {
    var tabs = document.querySelectorAll('.editor-panel-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          var panel = tab.getAttribute('data-panel');
          switchPanel(panel);
        });
      })(tabs[i]);
    }
  }

  function switchPanel(panel) {
    var tabs = document.querySelectorAll('.editor-panel-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-panel') === panel) {
        tabs[i].classList.add('active');
      } else {
        tabs[i].classList.remove('active');
      }
    }

    var panels = ['mediaPanel', 'layersPanel', 'audioPanel', 'textPanel'];
    for (var j = 0; j < panels.length; j++) {
      var el = $(panels[j]);
      if (el) el.style.display = 'none';
    }

    var target = panel + 'Panel';
    var targetEl = $(target);
    if (targetEl) targetEl.style.display = 'block';
  }

  /* ============================
     Zoom
     ============================ */
  function initZoom() {
    var zoomIn = $('zoomInBtn');
    var zoomOut = $('zoomOutBtn');
    var zoomLevel = $('zoomLevel');

    if (zoomIn) {
      zoomIn.addEventListener('click', function () {
        state.zoom = Math.min(200, state.zoom + 10);
        applyZoom();
      });
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', function () {
        state.zoom = Math.max(25, state.zoom - 10);
        applyZoom();
      });
    }

    applyZoom();
  }

  function applyZoom() {
    var wrapper = $('previewWrapper');
    var zoomLevel = $('zoomLevel');
    if (wrapper) {
      wrapper.style.transform = 'scale(' + (state.zoom / 100) + ')';
    }
    if (zoomLevel) {
      zoomLevel.textContent = state.zoom + '%';
    }
  }

  /* ============================
     Toolbar Buttons
     ============================ */
  function initToolbar() {
    var undoBtn = $('undoBtn');
    var redoBtn = $('redoBtn');
    var saveBtn = $('saveBtn');
    var previewBtn = $('previewBtn');
    var nameInput = $('projectName');

    if (undoBtn) {
      undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', redo);
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveToFirestore();
      });
    }
    if (previewBtn) {
      previewBtn.addEventListener('click', function () {
        togglePlay();
      });
    }
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        state.name = nameInput.value;
      });
      nameInput.addEventListener('change', function () {
        pushUndo();
        debouncedSave();
      });
    }
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(cloneState());
    var snapshot = state.undoStack.pop();
    restoreState(snapshot);
    updateUIState();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(cloneState());
    var snapshot = state.redoStack.pop();
    restoreState(snapshot);
    updateUIState();
  }

  function updateUIState() {
    var nameInput = $('projectName');
    if (nameInput) nameInput.value = state.name;
    setAspectRatio(state.aspectRatio, true);
    if ($('propBgColor')) $('propBgColor').value = state.settings.bgColor || '#000000';
    refreshAll();
  }

  /* ============================
     Export
     ============================ */
  function initExport() {
    var exportBtn = $('exportBtn');
    var exportModalClose = $('exportModalClose');
    var startExportBtn = $('startExportBtn');
    var downloadBtn = $('downloadBtn');

    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        resetExportModal();
        openModal('exportModal');
      });
    }

    if (exportModalClose) {
      exportModalClose.addEventListener('click', function () {
        closeModal('exportModal');
        resetExportModal();
      });
    }

    if (startExportBtn) {
      startExportBtn.addEventListener('click', startExport);
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (state.exportRenderId) {
          var backendUrl = window.getBackendUrl ? window.getBackendUrl() : 'http://localhost:8000';
          var url = backendUrl + '/api/video/download/' + state.exportRenderId;
          var auth = window.firebaseAuth;
          if (auth && auth.currentUser) {
            auth.currentUser.getIdToken().then(function (token) {
              window.GIODAIUtils.downloadFile(url + '?token=' + token, 'giodai_video.mp4');
            });
          }
        }
      });
    }

    var resOptions = document.querySelectorAll('.export-resolution-option');
    for (var i = 0; i < resOptions.length; i++) {
      (function (opt) {
        opt.addEventListener('click', function () {
          state.exportResolution = opt.getAttribute('data-res');
          for (var j = 0; j < resOptions.length; j++) {
            resOptions[j].classList.remove('active');
          }
          opt.classList.add('active');
        });
      })(resOptions[i]);
    }
  }

  function resetExportModal() {
    var exportOptions = $('exportOptions');
    var exportProgress = $('exportProgress');
    var exportComplete = $('exportComplete');
    var exportPercentage = $('exportPercentage');
    var exportProgressBar = $('exportProgressBar');
    var exportStatus = $('exportStatus');

    if (exportOptions) exportOptions.style.display = 'flex';
    if (exportProgress) exportProgress.style.display = 'none';
    if (exportComplete) exportComplete.style.display = 'none';
    if (exportPercentage) exportPercentage.textContent = '0%';
    if (exportProgressBar) exportProgressBar.style.width = '0%';
    if (exportStatus) exportStatus.textContent = 'Preparing...';

    if (state.exportPollTimer) {
      clearInterval(state.exportPollTimer);
      state.exportPollTimer = null;
    }
  }

  function startExport() {
    if (state.images.length === 0) {
      showToast('error', 'No Images', 'Add at least one image to export.');
      return;
    }

    var exportOptions = $('exportOptions');
    var exportProgress = $('exportProgress');
    if (exportOptions) exportOptions.style.display = 'none';
    if (exportProgress) exportProgress.style.display = 'block';

    var auth = window.firebaseAuth;
    var body = {
      images: [],
      texts: state.texts,
      audio: state.audio ? { name: state.audio.name, volume: state.audio.volume, fadeIn: state.audio.fadeIn, fadeOut: state.audio.fadeOut, trimStart: state.audio.trimStart, trimEnd: state.audio.trimEnd } : null,
      resolution: state.exportResolution,
      aspect_ratio: state.aspectRatio,
      background_color: state.settings.bgColor || '#000000'
    };

    for (var i = 0; i < state.images.length; i++) {
      var img = state.images[i];
      body.images.push({
        data_url: img.dataUrl,
        name: img.name,
        duration: img.duration,
        effect: img.effect,
        transition: img.transition,
        rotation: img.rotation,
        zoom: img.zoom,
        crop_x: img.cropX,
        crop_y: img.cropY,
        crop_width: img.cropWidth,
        crop_height: img.cropHeight
      });
    }

    var backendUrl = window.getBackendUrl ? window.getBackendUrl() : 'http://localhost:8000';

    var doExport = function (token) {
      fetch(backendUrl + '/api/video/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.detail || 'Render failed'); });
        return res.json();
      }).then(function (data) {
        state.exportRenderId = data.render_id;
        pollExportStatus(token);
      }).catch(function (err) {
        console.error('Export error:', err);
        showToast('error', 'Export Failed', err.message || 'Failed to start render.');
        resetExportModal();
      });
    };

    if (auth && auth.currentUser) {
      auth.currentUser.getIdToken().then(doExport).catch(function (err) {
        showToast('error', 'Auth Error', 'Failed to get auth token.');
      });
    } else {
      doExport('');
    }
  }

  function pollExportStatus(token) {
    var backendUrl = window.getBackendUrl ? window.getBackendUrl() : 'http://localhost:8000';
    var exportPercentage = $('exportPercentage');
    var exportProgressBar = $('exportProgressBar');
    var exportStatus = $('exportStatus');

    state.exportPollTimer = setInterval(function () {
      fetch(backendUrl + '/api/video/status/' + state.exportRenderId + '?token=' + token)
        .then(function (res) {
          if (!res.ok) throw new Error('Status check failed');
          return res.json();
        })
        .then(function (data) {
          var pct = Math.round(data.progress || 0);
          if (exportPercentage) exportPercentage.textContent = pct + '%';
          if (exportProgressBar) exportProgressBar.style.width = pct + '%';

          if (data.estimated_time_remaining) {
            if (exportStatus) exportStatus.textContent = 'Rendering... ~' + data.estimated_time_remaining + 's remaining';
          }

          if (data.status === 'completed') {
            clearInterval(state.exportPollTimer);
            state.exportPollTimer = null;
            showExportComplete(data.download_url);
          } else if (data.status === 'failed') {
            clearInterval(state.exportPollTimer);
            state.exportPollTimer = null;
            showToast('error', 'Render Failed', data.error || 'Render failed.');
            resetExportModal();
          }
        })
        .catch(function (err) {
          console.error('Poll error:', err);
        });
    }, 2000);
  }

  function showExportComplete(downloadUrl) {
    var exportProgress = $('exportProgress');
    var exportComplete = $('exportComplete');
    if (exportProgress) exportProgress.style.display = 'none';
    if (exportComplete) exportComplete.style.display = 'block';
  }

  /* ============================
     Keyboard Shortcuts
     ============================ */
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      var tag = e.target.tagName.toLowerCase();
      var isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z'))) {
        e.preventDefault();
        redo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToFirestore();
        return;
      }

      if (!isInput) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteSelected();
          return;
        }

        if (e.key === ' ') {
          e.preventDefault();
          togglePlay();
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          deselectAll();
          return;
        }
      }
    });
  }

  function deleteSelected() {
    if (!state.selectedElement) return;

    if (state.selectedType === 'image') {
      pushUndo();
      for (var i = 0; i < state.images.length; i++) {
        if (state.images[i].id === state.selectedElement) {
          state.images.splice(i, 1);
          break;
        }
      }
      deselectAll();
      refreshAll();
    } else if (state.selectedType === 'text') {
      pushUndo();
      for (var j = 0; j < state.texts.length; j++) {
        if (state.texts[j].id === state.selectedElement) {
          state.texts.splice(j, 1);
          break;
        }
      }
      deselectAll();
      refreshAll();
    }
  }

  /* ============================
     Save & Exit
     ============================ */
  window.saveAndExit = function () {
    saveToFirestore();
    setTimeout(function () {
      window.location.href = 'dashboard.html';
    }, 500);
  };

  /* ============================
     Global functions for crop modal
     ============================ */
  window.closeModal = function (id) {
    closeModal(id);
  };

  /* ============================
     Initialization
     ============================ */
  function init() {
    initEditor();
    initMediaPanel();
    initCropModal();
    initAudioPanel();
    initTextPanel();
    initInspector();
    initTimeline();
    initPlayback();
    initPanelTabs();
    initZoom();
    initToolbar();
    initExport();
    initKeyboardShortcuts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
