(function () {
  'use strict';

  var db = window.firebaseDb;
  var auth = window.firebaseAuth;
  var Utils = window.GIODAIUtils;
  var Auth = window.GIODAIAuth;
  var currentPage = 'home';
  var createImages = [];
  var createSettings = { aspectRatio: '9:16', duration: 3, effect: 'none', transition: 'fade' };
  var draggedImgIdx = null;
  var aiGenState = {
    activeTab: 'upload',
    prompt: '',
    negativePrompt: '',
    style: 'none',
    model: 'standard',
    aspectRatio: '9:16',
    batchCount: 1,
    quality: 'high',
    seed: null,
    referenceImageDataUrl: null,
    referenceStrength: 0.5,
    isGenerating: false,
    currentGenerationId: null,
    pollInterval: null,
    generatedImages: [],
    progress: 0
  };

  var AI_GEN_STYLES = [
    { id: 'none', name: 'Default', color: '#A29BFE' },
    { id: 'realistic', name: 'Realistic', color: '#00CEC9' },
    { id: 'anime', name: 'Anime', color: '#FD79A8' },
    { id: 'digital_art', name: 'Digital Art', color: '#6C5CE7' },
    { id: 'oil_painting', name: 'Oil Painting', color: '#E17055' },
    { id: 'watercolor', name: 'Watercolor', color: '#74B9FF' },
    { id: 'sketch', name: 'Sketch', color: '#636E72' },
    { id: 'cyberpunk', name: 'Cyberpunk', color: '#E84393' },
    { id: 'minimalist', name: 'Minimalist', color: '#DFE6E9' },
    { id: 'cinematic', name: 'Cinematic', color: '#FDCB6E' }
  ];

  var AI_GEN_MODELS = [
    { id: 'standard', name: 'Standard', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' },
    { id: 'high', name: 'High Quality', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
    { id: 'ultra', name: 'Ultra HD', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
    { id: 'draft', name: 'Draft', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg>' }
  ];

  var AI_GEN_RATIOS = [
    { id: '1:1', label: '1:1', w: 28, h: 28 },
    { id: '16:9', label: '16:9', w: 40, h: 22 },
    { id: '9:16', label: '9:16', w: 22, h: 40 },
    { id: '4:5', label: '4:5', w: 28, h: 35 }
  ];

  var AI_GEN_HINTS = [
    'Sunrise over mountains', 'Worship stage with lights', 'Open Bible on wooden table',
    'Church interior stained glass', 'Peaceful garden pathway', 'Candlelight prayer scene',
    'Cross on a hill at sunset', 'Dove flying over water', 'Community gathering hands together'
  ];

  var AI_STYLES = [
    { id: 'none', name: 'Default', color: '#6C5CE7' },
    { id: 'realistic', name: 'Realistic', color: '#00CEC9' },
    { id: 'anime', name: 'Anime', color: '#E84393' },
    { id: 'digital_art', name: 'Digital Art', color: '#0984E3' },
    { id: 'oil_painting', name: 'Oil Painting', color: '#FDCB6E' },
    { id: 'watercolor', name: 'Watercolor', color: '#55EFC4' },
    { id: 'sketch', name: 'Sketch', color: '#B2BEC3' },
    { id: 'cyberpunk', name: 'Cyberpunk', color: '#A29BFE' },
    { id: 'minimalist', name: 'Minimalist', color: '#636E72' },
    { id: 'cinematic', name: 'Cinematic', color: '#E17055' }
  ];

  var AI_QUALITY_OPTIONS = [
    { id: 'draft', name: 'Draft', desc: 'Fast, lower quality' },
    { id: 'standard', name: 'Standard', desc: 'Balanced' },
    { id: 'high', name: 'High', desc: 'Best quality' },
    { id: 'ultra', name: 'Ultra', desc: 'Maximum detail' }
  ];

  var AI_ASPECT_RATIOS = [
    { id: '9:16', label: '9:16', w: 36, h: 64 },
    { id: '16:9', label: '16:9', w: 64, h: 36 },
    { id: '1:1', label: '1:1', w: 48, h: 48 },
    { id: '4:5', label: '4:5', w: 40, h: 50 }
  ];

  var AI_PROMPT_HINTS = [
    'Worship background with golden light rays',
    'Serene nature landscape at sunset',
    'Modern church interior with stained glass',
    'Abstract gradient with bokeh particles',
    'Cinematic mountain scene with clouds',
    'Elegant floral arrangement on dark background',
    'Neon city street at night',
    'Peaceful ocean waves at sunrise',
    'Vintage parchment with calligraphy',
    'Soft pastel sky with floating clouds'
  ];

  var notifications = [
    { id: 1, text: 'Welcome to GIODAI! Start by uploading images.', time: Date.now(), read: false, icon: 'sparkle' },
    { id: 2, text: 'New templates have been added. Check them out!', time: Date.now() - 3600000, read: false, icon: 'template' },
    { id: 3, text: 'Your video "Sunday Service" is ready.', time: Date.now() - 86400000, read: true, icon: 'video' }
  ];

  var TEMPLATE_DATA = [
    { name: 'Sunday Praise', category: 'Worship', gradient: 'linear-gradient(135deg, #6C5CE7, #A29BFE, #FD79A8)', aspectRatio: '9:16', effect: 'zoom', transition: 'crossfade', duration: 4 },
    { name: 'Verse of the Day', category: 'Bible Verse', gradient: 'linear-gradient(135deg, #00CEC9, #81ECEC, #55EFC4)', aspectRatio: '9:16', effect: 'pan', transition: 'fade', duration: 5 },
    { name: 'Testimony Highlight', category: 'Testimony', gradient: 'linear-gradient(135deg, #FD79A8, #FDCB6E, #E17055)', aspectRatio: '9:16', effect: 'kenburns', transition: 'dissolve', duration: 5 },
    { name: 'Church Event Promo', category: 'Events', gradient: 'linear-gradient(135deg, #0984E3, #74B9FF, #00CEC9)', aspectRatio: '16:9', effect: 'zoom', transition: 'slide', duration: 3 },
    { name: 'Inspirational Quote', category: 'Quote', gradient: 'linear-gradient(135deg, #2D1B69, #6C5CE7, #A29BFE)', aspectRatio: '9:16', effect: 'pan', transition: 'fade', duration: 4 },
    { name: 'TikTok Reel', category: 'TikTok', gradient: 'linear-gradient(135deg, #E84393, #FD79A8, #FDCB6E)', aspectRatio: '9:16', effect: 'zoom', transition: 'crossfade', duration: 3 },
    { name: 'YouTube Short', category: 'YouTube Shorts', gradient: 'linear-gradient(135deg, #FF0000, #FF6B6B, #FDCB6E)', aspectRatio: '9:16', effect: 'kenburns', transition: 'slide', duration: 4 },
    { name: 'Instagram Story', category: 'Instagram Reels', gradient: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)', aspectRatio: '9:16', effect: 'zoom', transition: 'fade', duration: 3 },
    { name: 'Facebook Promo', category: 'Facebook Videos', gradient: 'linear-gradient(135deg, #1877F2, #42A5F5, #74B9FF)', aspectRatio: '16:9', effect: 'pan', transition: 'dissolve', duration: 5 },
    { name: 'Worship Night', category: 'Worship', gradient: 'linear-gradient(135deg, #1A1A2E, #6C5CE7, #00CEC9)', aspectRatio: '9:16', effect: 'kenburns', transition: 'crossfade', duration: 4 },
    { name: 'Scripture Reading', category: 'Bible Verse', gradient: 'linear-gradient(135deg, #0F0F1A, #A29BFE, #FD79A8)', aspectRatio: '9:16', effect: 'pan', transition: 'fade', duration: 6 },
    { name: 'Youth Camp Ad', category: 'Events', gradient: 'linear-gradient(135deg, #00B894, #55EFC4, #81ECEC)', aspectRatio: '1:1', effect: 'zoom', transition: 'slide', duration: 3 },
    { name: 'Faith Journey', category: 'Testimony', gradient: 'linear-gradient(135deg, #6C5CE7, #FD79A8, #FDCB6E)', aspectRatio: '9:16', effect: 'kenburns', transition: 'dissolve', duration: 5 },
    { name: 'Daily Motivation', category: 'Quote', gradient: 'linear-gradient(135deg, #FDCB6E, #E17055, #D63031)', aspectRatio: '9:16', effect: 'pan', transition: 'crossfade', duration: 4 },
    { name: 'Quick Reel', category: 'TikTok', gradient: 'linear-gradient(135deg, #6C5CE7, #00CEC9, #55EFC4)', aspectRatio: '9:16', effect: 'zoom', transition: 'fade', duration: 2 }
  ];

  var GRADIENT_THUMBS = [
    'linear-gradient(135deg, #6C5CE7, #A29BFE)',
    'linear-gradient(135deg, #00CEC9, #81ECEC)',
    'linear-gradient(135deg, #FD79A8, #FDCB6E)',
    'linear-gradient(135deg, #E17055, #6C5CE7)',
    'linear-gradient(135deg, #2D1B69, #00CEC9)',
    'linear-gradient(135deg, #0984E3, #FD79A8)',
    'linear-gradient(135deg, #00B894, #6C5CE7)'
  ];

  function getUser() {
    return auth ? auth.currentUser : null;
  }

  function showToast(type, title, message) {
    if (Utils && Utils.showToast) Utils.showToast(type, title, message);
  }

  function openModal(title, bodyHtml, footerHtml) {
    var overlay = document.getElementById('modalOverlay');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalFooter').innerHTML = footerHtml || '';
    overlay.classList.add('active');
  }

  function closeModal() {
    var overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('active');
  }

  function skeletonCards(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="skeleton skeleton-card" style="height:220px"></div>';
    }
    return '<div class="projects-grid">' + html + '</div>';
  }

  function skeletonStats() {
    return '<div class="stats-grid">' + Array(4).fill('<div class="skeleton skeleton-card" style="height:120px"></div>').join('') + '</div>';
  }

  function getGreeting() {
    if (Utils && Utils.getGreeting) return Utils.getGreeting();
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function formatDate(ts) {
    if (Utils && Utils.formatDate) return Utils.formatDate(ts);
    if (!ts) return '';
    var d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function generateId() {
    if (Utils && Utils.generateId) return Utils.generateId();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /* ===== SIDEBAR NAVIGATION ===== */
  function navigateTo(page) {
    currentPage = page;
    var items = document.querySelectorAll('.sidebar-nav-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('active');
      if (items[i].getAttribute('data-page') === page) items[i].classList.add('active');
    }
    renderPage(page);
    closeMobileSidebar();
  }

  function closeMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
  }

  function initSidebar() {
    var navItems = document.querySelectorAll('.sidebar-nav-item');
    for (var i = 0; i < navItems.length; i++) {
      navItems[i].addEventListener('click', function () {
        navigateTo(this.getAttribute('data-page'));
      });
    }

    var toggle = document.getElementById('sidebarToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768) {
          sidebar.classList.toggle('mobile-open');
          document.getElementById('sidebarOverlay').classList.toggle('active');
        } else {
          sidebar.classList.toggle('collapsed');
        }
      });
    }

    var mobileBtn = document.getElementById('mobileMenuBtn');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', function () {
        document.getElementById('sidebar').classList.add('mobile-open');
        document.getElementById('sidebarOverlay').classList.add('active');
      });
    }

    var overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.addEventListener('click', closeMobileSidebar);
    }
  }

  /* ===== THEME TOGGLE ===== */
  function initThemeToggle() {
    var btn = document.getElementById('themeToggle');
    var icon = document.getElementById('themeIcon');
    function updateIcon() {
      var theme = Utils ? Utils.getTheme() : (document.documentElement.getAttribute('data-theme') || 'dark');
      if (icon) {
        if (theme === 'dark') {
          icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
        } else {
          icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
      }
    }
    updateIcon();
    if (btn) {
      btn.addEventListener('click', function () {
        var current = Utils ? Utils.getTheme() : 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        if (Utils) Utils.setTheme(next);
        updateIcon();
        showToast('info', 'Theme Changed', 'Switched to ' + next + ' mode.');
      });
    }
  }

  /* ===== NOTIFICATIONS ===== */
  function initNotifications() {
    var btn = document.getElementById('notifBtn');
    var dropdown = document.getElementById('notifDropdownMenu');
    var dot = document.getElementById('notifDot');
    var markAllBtn = document.getElementById('markAllRead');

    function renderNotifList() {
      var list = document.getElementById('notificationList');
      if (!list) return;
      var unread = 0;
      var html = '';
      for (var i = 0; i < notifications.length; i++) {
        var n = notifications[i];
        if (!n.read) unread++;
        var iconBg = n.icon === 'video' ? 'rgba(0,206,201,0.12)' : n.icon === 'template' ? 'rgba(253,121,168,0.12)' : 'rgba(108,92,231,0.12)';
        var iconColor = n.icon === 'video' ? 'var(--color-secondary)' : n.icon === 'template' ? 'var(--color-accent)' : 'var(--color-primary)';
        var iconSvg = n.icon === 'video' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : n.icon === 'template' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
        html += '<div class="notification-item ' + (n.read ? '' : 'unread') + '">' +
          '<div class="notification-item-icon" style="background:' + iconBg + ';color:' + iconColor + '">' + iconSvg + '</div>' +
          '<div class="notification-item-content"><div class="notification-item-text">' + escapeHtml(n.text) + '</div>' +
          '<div class="notification-item-time">' + formatDate(n.time) + '</div></div></div>';
      }
      if (!notifications.length) {
        html = '<div class="empty-state" style="padding:var(--space-6)"><p style="color:var(--text-tertiary);font-size:var(--font-size-sm)">No notifications yet</p></div>';
      }
      list.innerHTML = html;
      if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
    }

    renderNotifList();

    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (dropdown) dropdown.classList.toggle('active');
      });
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', function () {
        for (var i = 0; i < notifications.length; i++) notifications[i].read = true;
        renderNotifList();
        showToast('info', 'Notifications', 'All marked as read.');
      });
    }

    document.addEventListener('click', function (e) {
      if (dropdown && !document.getElementById('notifDropdown').contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  /* ===== SEARCH ===== */
  function initSearch() {
    var input = document.querySelector('.header-search-input');
    if (input) {
      input.addEventListener('input', function () {
        var query = this.value.toLowerCase().trim();
        var cards = document.querySelectorAll('#pageContent .project-card, #pageContent .template-card, #pageContent .video-card, #pageContent .activity-item');
        for (var i = 0; i < cards.length; i++) {
          var text = cards[i].textContent.toLowerCase();
          cards[i].style.display = (!query || text.indexOf(query) !== -1) ? '' : 'none';
        }
      });
    }
  }

  /* ===== MODAL CLOSE ===== */
  function initModal() {
    var closeBtn = document.getElementById('modalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var overlay = document.getElementById('modalOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }
  }

  /* ===== RENDER ROUTER ===== */
  function renderPage(page) {
    var el = document.getElementById('pageContent');
    if (!el) return;
    switch (page) {
      case 'home': renderHome(el); break;
      case 'projects': renderProjects(el); break;
      case 'create': renderCreate(el); break;
      case 'templates': renderTemplates(el); break;
      case 'recent': renderRecent(el); break;
      case 'account': renderAccount(el); break;
      case 'settings': renderSettings(el); break;
      default: renderHome(el);
    }
  }

  /* ===== PAGE: HOME ===== */
  function renderHome(el) {
    var user = getUser();
    var name = (user && user.displayName) || 'there';
    el.innerHTML = '<div class="page-header"><h1>' + getGreeting() + ', ' + escapeHtml(name) + '!</h1>' +
      '<p>Here\'s an overview of your creative studio.</p></div>' +
      '<div id="homeStats">' + skeletonStats() + '</div>' +
      '<div class="quick-actions" id="homeQuickActions"></div>' +
      '<div class="glass-card" style="padding:var(--space-6)"><h3 style="font-size:var(--font-size-lg);margin-bottom:var(--space-4)">Recent Activity</h3><div id="homeActivity">' + skeletonCards(3) + '</div></div>';
    renderQuickActions();
    fetchHomeData();
  }

  function renderQuickActions() {
    var qa = document.getElementById('homeQuickActions');
    if (!qa) return;
    var actions = [
      { label: 'New Video', desc: 'Create from images', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>', color: 'var(--color-primary)', bg: 'rgba(108,92,231,0.1)', page: 'create' },
      { label: 'Browse Templates', desc: 'Start with a template', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>', color: 'var(--color-accent)', bg: 'rgba(253,121,168,0.1)', page: 'templates' },
      { label: 'Recent Videos', desc: 'View rendered videos', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', color: 'var(--color-secondary)', bg: 'rgba(0,206,201,0.1)', page: 'recent' },
      { label: 'My Projects', desc: 'Manage projects', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>', color: 'var(--color-warning)', bg: 'rgba(253,203,110,0.15)', page: 'projects' }
    ];
    var html = '';
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      html += '<div class="quick-action-card" data-nav="' + a.page + '"><div class="quick-action-icon" style="background:' + a.bg + ';color:' + a.color + '">' + a.icon + '</div><div><h4>' + a.label + '</h4><p>' + a.desc + '</p></div></div>';
    }
    qa.innerHTML = html;
    var cards = qa.querySelectorAll('.quick-action-card');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', function () {
        navigateTo(this.getAttribute('data-nav'));
      });
    }
  }

  function fetchHomeData() {
    var user = getUser();
    if (!user || !db) {
      document.getElementById('homeStats').innerHTML = buildStatsHtml(0, 0, 0, '0 MB');
      document.getElementById('homeActivity').innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h3>No activity yet</h3><p>Start creating videos to see your activity here.</p><button class="btn btn-primary" data-nav="create">Create Your First Video</button></div>';
      var cta = document.querySelector('#homeActivity [data-nav]');
      if (cta) cta.addEventListener('click', function () { navigateTo(this.getAttribute('data-nav')); });
      return;
    }

    db.collection('users').doc(user.uid).get().then(function (doc) {
      var data = doc.exists ? doc.data() : {};
      var totalProjects = data.projectsCount || 0;
      var videosCreated = data.videosCreated || 0;
      var templatesUsed = data.templatesUsed || 0;
      var storageUsed = data.storageUsed || '0 MB';
      document.getElementById('homeStats').innerHTML = buildStatsHtml(totalProjects, videosCreated, templatesUsed, storageUsed);
      if (totalProjects === 0) {
        document.getElementById('homeActivity').innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><h3>No projects yet</h3><p>Get started by creating your first video project from images.</p><button class="btn btn-primary" data-nav="create">Create Your First Video</button></div>';
        var cta2 = document.querySelector('#homeActivity [data-nav]');
        if (cta2) cta2.addEventListener('click', function () { navigateTo(this.getAttribute('data-nav')); });
      }
    }).catch(function () {
      document.getElementById('homeStats').innerHTML = buildStatsHtml(0, 0, 0, '0 MB');
    });

    db.collection('history').where('userId', '==', user.uid).orderBy('createdAt', 'desc').limit(5).get().then(function (snap) {
      if (snap.empty) return;
      var html = '';
      snap.forEach(function (doc) {
        var d = doc.data();
        var iconSvg = d.type === 'render' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        html += '<div class="activity-item"><div class="activity-icon">' + iconSvg + '</div><div class="activity-info"><div class="activity-title">' + escapeHtml(d.description || d.type || 'Activity') + '</div><div class="activity-time">' + formatDate(d.createdAt) + '</div></div></div>';
      });
      var actEl = document.getElementById('homeActivity');
      if (actEl && html) actEl.innerHTML = '<div class="activity-list">' + html + '</div>';
    }).catch(function () {});
  }

  function buildStatsHtml(projects, videos, templates, storage) {
    return '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-icon primary"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><div class="stat-info"><h3>' + projects + '</h3><p>Total Projects</p></div></div>' +
      '<div class="stat-card"><div class="stat-icon secondary"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><div class="stat-info"><h3>' + videos + '</h3><p>Videos Created</p></div></div>' +
      '<div class="stat-card"><div class="stat-icon accent"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg></div><div class="stat-info"><h3>' + templates + '</h3><p>Templates Used</p></div></div>' +
      '<div class="stat-card"><div class="stat-icon warning"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div class="stat-info"><h3>' + escapeHtml(storage) + '</h3><p>Storage Used</p></div></div>' +
      '</div>';
  }

  /* ===== PAGE: PROJECTS ===== */
  function renderProjects(el) {
    el.innerHTML = '<div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3)"><div><h1>My Projects</h1><p>Manage all your video projects.</p></div><button class="btn btn-primary" id="newProjectBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Project</button></div><div id="projectsGrid">' + skeletonCards(6) + '</div>';
    document.getElementById('newProjectBtn').addEventListener('click', function () { navigateTo('create'); });
    fetchProjects();
  }

  function fetchProjects() {
    var user = getUser();
    var grid = document.getElementById('projectsGrid');
    if (!user || !db) { grid.innerHTML = emptyState('No Projects', 'Create your first project to get started.', 'create'); bindEmptyCTA(grid); return; }

    db.collection('projects').where('userId', '==', user.uid).orderBy('updatedAt', 'desc').get().then(function (snap) {
      if (snap.empty) { grid.innerHTML = emptyState('No Projects', 'Create your first project to get started.', 'create'); bindEmptyCTA(grid); return; }
      var html = '<div class="projects-grid">';
      snap.forEach(function (doc) {
        var p = doc.data();
        var thumb = p.thumbnail || GRADIENT_THUMBS[Math.abs(doc.id.length) % GRADIENT_THUMBS.length];
        var thumbHtml = thumb.indexOf('linear-gradient') !== -1 ? '<div style="width:100%;height:100%;background:' + thumb + '"></div>' : '<img src="' + thumb + '" alt="' + escapeHtml(p.name) + '">';
        var dur = p.totalDuration || 0;
        var durStr = dur >= 60 ? Math.floor(dur / 60) + ':' + String(Math.floor(dur % 60)).padStart(2, '0') : dur + 's';
        html += '<div class="project-card" data-project-id="' + doc.id + '"><div class="project-card-thumb">' + thumbHtml +
          (p.aspectRatio ? '<div class="project-card-resolution badge badge-primary">' + escapeHtml(p.aspectRatio) + '</div>' : '') +
          (dur > 0 ? '<div class="project-card-duration">' + durStr + '</div>' : '') +
          '<div class="project-card-hover-actions" style="opacity:0;position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity 0.15s ease">' +
          '<button class="project-card-action" style="background:rgba(255,255,255,0.15);border-radius:8px;color:#fff;width:36px;height:36px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-action="edit" data-id="' + doc.id + '" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
          '<button class="project-card-action" style="background:rgba(255,255,255,0.15);border-radius:8px;color:#fff;width:36px;height:36px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-action="duplicate" data-id="' + doc.id + '" title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
          '<button class="project-card-action" style="background:rgba(225,112,85,0.4);border-radius:8px;color:#FF7675;width:36px;height:36px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-action="delete" data-id="' + doc.id + '" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
          '</div></div><div class="project-card-body"><div class="project-card-title">' + escapeHtml(p.name || 'Untitled') + '</div><div class="project-card-meta"><span>' + formatDate(p.updatedAt || p.createdAt) + '</span><span>' + (p.imageCount || 0) + ' images</span></div></div></div>';
      });
      html += '</div>';
      grid.innerHTML = html;
      bindProjectCardEvents(grid);
    }).catch(function () {
      grid.innerHTML = emptyState('Error Loading Projects', 'Could not fetch projects. Please try again.', 'projects');
    });
  }

  function bindProjectCardEvents(container) {
    container.addEventListener('mouseover', function (e) {
      var card = e.target.closest('.project-card');
      if (card) { var actions = card.querySelector('.project-card-hover-actions'); if (actions) actions.style.opacity = '1'; }
    });
    container.addEventListener('mouseout', function (e) {
      var card = e.target.closest('.project-card');
      if (card) { var actions = card.querySelector('.project-card-hover-actions'); if (actions) actions.style.opacity = '0'; }
    });
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'edit') window.location.href = 'editor.html?id=' + id;
      if (action === 'duplicate') duplicateProject(id);
      if (action === 'delete') confirmDeleteProject(id);
    });
  }

  function duplicateProject(id) {
    if (!db) return;
    db.collection('projects').doc(id).get().then(function (doc) {
      if (!doc.exists) return;
      var data = doc.data();
      data.name = (data.name || 'Untitled') + ' (Copy)';
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection('projects').add(data);
    }).then(function () {
      showToast('success', 'Duplicated', 'Project has been duplicated.');
      fetchProjects();
    }).catch(function () {
      showToast('error', 'Error', 'Failed to duplicate project.');
    });
  }

  function confirmDeleteProject(id) {
    openModal('Delete Project', '<p style="color:var(--text-secondary)">Are you sure you want to delete this project? This action cannot be undone.</p>',
      '<button class="btn btn-ghost" id="cancelDeleteBtn">Cancel</button><button class="btn btn-danger" id="confirmDeleteBtn">Delete</button>');
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', function () {
      closeModal();
      db.collection('projects').doc(id).delete().then(function () {
        showToast('success', 'Deleted', 'Project has been deleted.');
        fetchProjects();
      }).catch(function () {
        showToast('error', 'Error', 'Failed to delete project.');
      });
    });
  }

  /* ===== PAGE: CREATE ===== */
  function renderCreate(el) {
    createImages = [];
    createSettings = { aspectRatio: '9:16', duration: 3, effect: 'none', transition: 'fade' };
    aiGenState = {
      activeTab: 'upload', prompt: '', negativePrompt: '', style: 'none',
      quality: 'high', aspectRatio: '9:16', numVariations: 1, seed: null,
      generationId: null, isGenerating: false, progress: 0, generatedImages: [], pollTimer: null
    };
    var activeTab = 'upload';
    el.innerHTML =
      '<div class="page-header"><h1>Create New Video</h1><p>Upload images or generate them with AI, then configure your video settings.</p></div>' +
      '<div class="glass-card" style="padding:var(--space-4);margin-bottom:var(--space-5)">' +
      '<div style="display:flex;gap:var(--space-2);border-bottom:1px solid var(--border-color-light);padding-bottom:0;margin-bottom:var(--space-5)">' +
        '<button class="create-tab ' + (activeTab === 'upload' ? 'active' : '') + '" data-create-tab="upload"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Images</button>' +
        '<button class="create-tab ' + (activeTab === 'ai' ? 'active' : '') + '" data-create-tab="ai"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> AI Generate</button>' +
      '</div>' +
      '<div id="createTabContent"></div></div>' +
      '<div id="imageGridContainer" style="margin-bottom:var(--space-5);display:none">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">' +
      '<h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold)">Images (<span id="imageCount">0</span>)</h3>' +
      '<button class="btn btn-sm btn-ghost" id="clearImagesBtn">Clear All</button></div>' +
      '<div class="image-thumb-grid" id="imageGrid"></div></div>' +
      '<div id="createSettingsPanel" style="display:none">' +
      '<div class="glass-card" style="padding:var(--space-6);margin-bottom:var(--space-5)">' +
      '<h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-5)">Video Settings</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-4)">' +
      '<div class="form-group"><label class="form-label">Aspect Ratio</label><select class="form-select" id="crAspectRatio"><option value="9:16">9:16 (Vertical)</option><option value="16:9">16:9 (Landscape)</option><option value="1:1">1:1 (Square)</option><option value="4:5">4:5 (Instagram)</option><option value="3:2">3:2 (Standard)</option></select></div>' +
      '<div class="form-group"><label class="form-label">Duration per Image (seconds)</label><input type="number" class="form-input" id="crDuration" min="1" max="30" value="3"></div>' +
      '<div class="form-group"><label class="form-label">Effect</label><select class="form-select" id="crEffect"><option value="none">None</option><option value="zoom">Zoom In</option><option value="pan">Pan</option><option value="kenburns">Ken Burns</option></select></div>' +
      '<div class="form-group"><label class="form-label">Transition</label><select class="form-select" id="crTransition"><option value="fade">Fade</option><option value="crossfade">Crossfade</option><option value="dissolve">Dissolve</option><option value="slide">Slide</option><option value="none">None</option></select></div>' +
      '</div></div>' +
      '<div style="display:flex;align-items:center;justify-content:flex-end;gap:var(--space-3)"><button class="btn btn-secondary" id="addMoreBtn">Add More Images</button><button class="btn btn-primary btn-lg" id="createVideoBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Create Video</button></div></div>';
    renderCreateTabContent('upload');
    bindCreateTabEvents();
    bindCreateEvents();
  }

  function renderCreateTabContent(tab) {
    var container = document.getElementById('createTabContent');
    if (!container) return;
    if (tab === 'upload') {
      container.innerHTML =
        '<h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4)">Upload Images</h3>' +
        '<div class="image-uploader" id="dropZone"><div class="image-uploader-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
        '<h3>Drag and drop images here</h3><p>or click to browse. Supports JPG, PNG, WebP.</p>' +
        '<input type="file" id="fileInput" multiple accept="image/*" style="display:none"></div>';
      bindUploadEvents();
    } else {
      renderAIPanel(container);
    }
  }

  function bindCreateTabEvents() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('.create-tab');
      if (!tab) return;
      var tabName = tab.getAttribute('data-create-tab');
      aiGenState.activeTab = tabName;
      var tabs = document.querySelectorAll('.create-tab');
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
      tab.classList.add('active');
      renderCreateTabContent(tabName);
    });
  }

  function bindUploadEvents() {
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    if (dropZone) {
      dropZone.addEventListener('click', function () { fileInput.click(); });
      dropZone.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', function () { this.classList.remove('drag-over'); });
      dropZone.addEventListener('drop', function (e) { e.preventDefault(); this.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
    }
    if (fileInput) fileInput.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
  }

  /* ===== AI GENERATION PANEL ===== */
  function renderAIPanel(container) {
    var stylesHtml = '';
    for (var s = 0; s < AI_STYLES.length; s++) {
      var st = AI_STYLES[s];
      stylesHtml += '<button class="ai-gen-style-chip' + (aiGenState.style === st.id ? ' active' : '') + '" data-style="' + st.id + '">' +
        '<span class="ai-gen-style-chip-preview" style="background:' + st.color + '"></span>' +
        escapeHtml(st.name) + '</button>';
    }

    var qualityHtml = '';
    for (var q = 0; q < AI_QUALITY_OPTIONS.length; q++) {
      var qu = AI_QUALITY_OPTIONS[q];
      qualityHtml += '<div class="ai-gen-model-option' + (aiGenState.quality === qu.id ? ' selected' : '') + '" data-quality="' + qu.id + '">' +
        '<div class="ai-gen-model-option-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg></div>' +
        '<div class="ai-gen-model-option-label">' + escapeHtml(qu.name) + '</div></div>';
    }

    var ratioHtml = '';
    for (var r = 0; r < AI_ASPECT_RATIOS.length; r++) {
      var ar = AI_ASPECT_RATIOS[r];
      ratioHtml += '<div class="ai-gen-ratio-option' + (aiGenState.aspectRatio === ar.id ? ' selected' : '') + '" data-ratio="' + ar.id + '">' +
        '<div class="ai-gen-ratio-preview" style="width:' + ar.w + 'px;height:' + ar.h + 'px"></div>' +
        '<div class="ai-gen-ratio-label">' + escapeHtml(ar.label) + '</div></div>';
    }

    var hintsHtml = '';
    for (var h = 0; h < AI_PROMPT_HINTS.length; h++) {
      hintsHtml += '<span class="ai-gen-hint-chip" data-hint="' + h + '">' + escapeHtml(AI_PROMPT_HINTS[h]) + '</span>';
    }

    container.innerHTML =
      '<div class="ai-gen-layout">' +
      '<div class="ai-gen-controls">' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Prompt <span class="ai-gen-panel-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg> AI</span></div>' +
          '<div class="ai-gen-prompt-area">' +
            '<textarea class="ai-gen-prompt-input" id="aiPrompt" placeholder="Describe the image you want to generate..." maxlength="2000">' + escapeHtml(aiGenState.prompt) + '</textarea>' +
            '<div class="ai-gen-prompt-footer"><span class="ai-gen-prompt-counter"><span id="aiPromptCount">' + (aiGenState.prompt || '').length + '</span>/2000</span>' +
            '<button class="ai-gen-prompt-enhance-btn" id="aiPromptClear">Clear</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Negative Prompt <span style="font-size:var(--font-size-xs);color:var(--text-quaternary);text-transform:none;letter-spacing:0;font-weight:var(--font-weight-normal)">(optional)</span></div>' +
          '<textarea class="ai-gen-negative-prompt" id="aiNegativePrompt" placeholder="What to avoid... (e.g. blurry, low quality)" maxlength="1000">' + escapeHtml(aiGenState.negativePrompt) + '</textarea>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Style</div>' +
          '<div class="ai-gen-style-chips" id="aiStyleChips">' + stylesHtml + '</div>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Quality</div>' +
          '<div class="ai-gen-model-grid" id="aiQualityGrid">' + qualityHtml + '</div>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Aspect Ratio</div>' +
          '<div class="ai-gen-ratio-grid" id="aiRatioGrid">' + ratioHtml + '</div>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Variations</div>' +
          '<div class="ai-gen-batch-controls">' +
            '<button class="ai-gen-batch-btn" id="aiVarMinus">−</button>' +
            '<span class="ai-gen-batch-count" id="aiVarCount">' + aiGenState.numVariations + '</span>' +
            '<button class="ai-gen-batch-btn" id="aiVarPlus">+</button>' +
            '<span style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-left:var(--space-2)">images</span>' +
          '</div>' +
        '</div>' +
        '<div class="ai-gen-controls-section">' +
          '<div class="ai-gen-section-label">Seed <span style="font-size:var(--font-size-xs);color:var(--text-quaternary);text-transform:none;letter-spacing:0;font-weight:var(--font-weight-normal)">(optional)</span></div>' +
          '<div class="ai-gen-seed-row">' +
            '<input type="number" class="ai-gen-seed-input" id="aiSeed" placeholder="Random" value="' + (aiGenState.seed != null ? aiGenState.seed : '') + '">' +
            '<button class="ai-gen-seed-random-btn" id="aiSeedRandom" title="Random seed"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>' +
          '</div>' +
        '</div>' +
        '<div class="ai-gen-actions">' +
          '<button class="ai-gen-generate-btn" id="aiGenerateBtn">' +
            '<span class="ai-gen-btn-text"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Generate Images</span>' +
            '<span class="ai-gen-btn-loading"><span class="ai-gen-loading-spinner"></span> Generating... <span id="aiGenProgress">0</span>%</span>' +
          '</button>' +
          '<div class="ai-gen-secondary-actions">' +
            '<button class="ai-gen-secondary-btn" id="aiAddAllBtn" style="display:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add All to Project</button>' +
            '<button class="ai-gen-secondary-btn" id="aiClearGenBtn" style="display:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Clear Results</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ai-gen-preview" id="aiPreview">' +
        renderAIPreviewContent() +
      '</div>' +
      '</div>';
    bindAIGenerateEvents();
  }

  function renderAIPreviewContent() {
    if (aiGenState.isGenerating) {
      var cols = aiGenState.numVariations > 2 ? 'cols-2' : (aiGenState.numVariations === 1 ? 'cols-1' : 'cols-2');
      var skeletons = '';
      for (var i = 0; i < aiGenState.numVariations; i++) {
        var h = aiGenState.aspectRatio === '9:16' ? '380px' : (aiGenState.aspectRatio === '16:9' ? '200px' : '260px');
        skeletons += '<div class="ai-gen-image-skeleton" style="height:' + h + '"><div class="ai-gen-image-skeleton-progress" style="width:' + aiGenState.progress + '%"></div></div>';
      }
      return '<div class="ai-gen-preview-grid ' + cols + '">' + skeletons + '</div>';
    }
    if (aiGenState.generatedImages.length > 0) {
      var cols = aiGenState.generatedImages.length > 2 ? 'cols-2' : (aiGenState.generatedImages.length === 1 ? 'cols-1' : 'cols-2');
      var cardsHtml = '';
      for (var j = 0; j < aiGenState.generatedImages.length; j++) {
        var img = aiGenState.generatedImages[j];
        cardsHtml += '<div class="ai-gen-image-card">' +
          '<img src="' + img.dataUrl + '" alt="Generated image ' + (j + 1) + '">' +
          '<div class="ai-gen-image-card-overlay">' +
            '<div class="ai-gen-image-card-number">' + (j + 1) + '</div>' +
            '<div class="ai-gen-image-card-actions">' +
              '<button class="ai-gen-image-action-btn" data-ai-action="add" data-ai-idx="' + j + '" title="Add to project"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
              '<button class="ai-gen-image-action-btn" data-ai-action="download" data-ai-idx="' + j + '" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>' +
              '<button class="ai-gen-image-action-btn" data-ai-action="regen" data-ai-idx="' + j + '" title="Regenerate variation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }
      return '<div class="ai-gen-preview-grid ' + cols + '">' + cardsHtml + '</div>';
    }
    var hintsHtml = '';
    for (var k = 0; k < AI_PROMPT_HINTS.length; k++) {
      hintsHtml += '<span class="ai-gen-hint-chip" data-hint="' + k + '">' + escapeHtml(AI_PROMPT_HINTS[k]) + '</span>';
    }
    return '<div class="ai-gen-empty-state">' +
      '<div class="ai-gen-empty-state-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>' +
      '<h3>Generate with AI</h3>' +
      '<p>Describe what you want to see and let AI create stunning images for your video.</p>' +
      '<div class="ai-gen-empty-state-hints">' + hintsHtml + '</div>' +
    '</div>';
  }

  function bindAIGenerateEvents() {
    var promptEl = document.getElementById('aiPrompt');
    var countEl = document.getElementById('aiPromptCount');
    if (promptEl) {
      promptEl.addEventListener('input', function () {
        aiGenState.prompt = this.value;
        if (countEl) countEl.textContent = this.value.length;
      });
    }
    var negEl = document.getElementById('aiNegativePrompt');
    if (negEl) {
      negEl.addEventListener('input', function () { aiGenState.negativePrompt = this.value; });
    }
    var clearPrompt = document.getElementById('aiPromptClear');
    if (clearPrompt) {
      clearPrompt.addEventListener('click', function () {
        aiGenState.prompt = '';
        if (promptEl) promptEl.value = '';
        if (countEl) countEl.textContent = '0';
      });
    }

    var styleChips = document.getElementById('aiStyleChips');
    if (styleChips) {
      styleChips.addEventListener('click', function (e) {
        var chip = e.target.closest('.ai-gen-style-chip');
        if (!chip) return;
        var chips = this.querySelectorAll('.ai-gen-style-chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
        chip.classList.add('active');
        aiGenState.style = chip.getAttribute('data-style');
      });
    }

    var qualityGrid = document.getElementById('aiQualityGrid');
    if (qualityGrid) {
      qualityGrid.addEventListener('click', function (e) {
        var opt = e.target.closest('.ai-gen-model-option');
        if (!opt) return;
        var opts = this.querySelectorAll('.ai-gen-model-option');
        for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
        opt.classList.add('selected');
        aiGenState.quality = opt.getAttribute('data-quality');
      });
    }

    var ratioGrid = document.getElementById('aiRatioGrid');
    if (ratioGrid) {
      ratioGrid.addEventListener('click', function (e) {
        var opt = e.target.closest('.ai-gen-ratio-option');
        if (!opt) return;
        var opts = this.querySelectorAll('.ai-gen-ratio-option');
        for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
        opt.classList.add('selected');
        aiGenState.aspectRatio = opt.getAttribute('data-ratio');
      });
    }

    var varMinus = document.getElementById('aiVarMinus');
    var varPlus = document.getElementById('aiVarPlus');
    var varCount = document.getElementById('aiVarCount');
    if (varMinus) varMinus.addEventListener('click', function () {
      if (aiGenState.numVariations > 1) { aiGenState.numVariations--; if (varCount) varCount.textContent = aiGenState.numVariations; }
    });
    if (varPlus) varPlus.addEventListener('click', function () {
      if (aiGenState.numVariations < 4) { aiGenState.numVariations++; if (varCount) varCount.textContent = aiGenState.numVariations; }
    });

    var seedInput = document.getElementById('aiSeed');
    if (seedInput) seedInput.addEventListener('input', function () { aiGenState.seed = this.value ? parseInt(this.value) : null; });
    var seedRandom = document.getElementById('aiSeedRandom');
    if (seedRandom) seedRandom.addEventListener('click', function () {
      aiGenState.seed = Math.floor(Math.random() * 2147483647);
      if (seedInput) seedInput.value = aiGenState.seed;
    });

    var generateBtn = document.getElementById('aiGenerateBtn');
    if (generateBtn) generateBtn.addEventListener('click', handleAIGenerate);

    var addAllBtn = document.getElementById('aiAddAllBtn');
    if (addAllBtn) addAllBtn.addEventListener('click', addAllGeneratedToProject);

    var clearGenBtn = document.getElementById('aiClearGenBtn');
    if (clearGenBtn) clearGenBtn.addEventListener('click', function () {
      aiGenState.generatedImages = [];
      aiGenState.generationId = null;
      var preview = document.getElementById('aiPreview');
      if (preview) preview.innerHTML = renderAIPreviewContent();
      updateAIGenButtons();
    });

    var preview = document.getElementById('aiPreview');
    if (preview) {
      preview.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-ai-action]');
        if (!btn) {
          var hint = e.target.closest('.ai-gen-hint-chip');
          if (hint) {
            var idx = parseInt(hint.getAttribute('data-hint'));
            var prompt = AI_PROMPT_HINTS[idx];
            aiGenState.prompt = prompt;
            var promptEl2 = document.getElementById('aiPrompt');
            var countEl2 = document.getElementById('aiPromptCount');
            if (promptEl2) promptEl2.value = prompt;
            if (countEl2) countEl2.textContent = prompt.length;
          }
          return;
        }
        var action = btn.getAttribute('data-ai-action');
        var idx2 = parseInt(btn.getAttribute('data-ai-idx'));
        if (action === 'add') addGeneratedImageToProject(idx2);
        if (action === 'download') downloadGeneratedImage(idx2);
        if (action === 'regen') handleAIGenerate();
      });
    }
  }

  function updateAIGenButtons() {
    var addAllBtn = document.getElementById('aiAddAllBtn');
    var clearGenBtn = document.getElementById('aiClearGenBtn');
    if (addAllBtn) addAllBtn.style.display = aiGenState.generatedImages.length > 0 ? 'flex' : 'none';
    if (clearGenBtn) clearGenBtn.style.display = aiGenState.generatedImages.length > 0 ? 'flex' : 'none';
  }

  function handleAIGenerate() {
    if (aiGenState.isGenerating) return;
    if (!aiGenState.prompt.trim()) { showToast('warning', 'Prompt Required', 'Please enter a description of the image you want to generate.'); return; }
    if (!window.apiCall) { showToast('error', 'Error', 'API module not available. Make sure you are logged in.'); return; }

    aiGenState.isGenerating = true;
    aiGenState.progress = 0;
    aiGenState.generatedImages = [];
    if (aiGenState.pollTimer) { clearInterval(aiGenState.pollTimer); aiGenState.pollTimer = null; }

    var generateBtn = document.getElementById('aiGenerateBtn');
    if (generateBtn) generateBtn.classList.add('generating');
    var preview = document.getElementById('aiPreview');
    if (preview) preview.innerHTML = renderAIPreviewContent();
    updateAIGenButtons();

    var body = {
      prompt: aiGenState.prompt.trim(),
      style: aiGenState.style,
      quality: aiGenState.quality,
      aspect_ratio: aiGenState.aspectRatio,
      num_variations: aiGenState.numVariations
    };
    if (aiGenState.negativePrompt.trim()) body.negative_prompt = aiGenState.negativePrompt.trim();
    if (aiGenState.seed != null) body.seed = aiGenState.seed;

    window.apiCall('/api/generate/image', {
      method: 'POST',
      body: JSON.stringify(body)
    }).then(function (data) {
      aiGenState.generationId = data.generation_id;
      startPollingGeneration();
    }).catch(function (err) {
      aiGenState.isGenerating = false;
      if (generateBtn) generateBtn.classList.remove('generating');
      showToast('error', 'Generation Failed', err.message || 'Failed to start image generation.');
      if (preview) preview.innerHTML = renderAIPreviewContent();
    });
  }

  function startPollingGeneration() {
    if (aiGenState.pollTimer) clearInterval(aiGenState.pollTimer);
    aiGenState.pollTimer = setInterval(function () {
      if (!aiGenState.generationId) { clearInterval(aiGenState.pollTimer); return; }
      window.apiCall('/api/generate/image/' + aiGenState.generationId).then(function (data) {
        if (data.status === 'generating') {
          aiGenState.progress = data.progress || Math.min(90, aiGenState.progress + 5);
          var progressEl = document.getElementById('aiGenProgress');
          if (progressEl) progressEl.textContent = Math.round(aiGenState.progress);
          var preview = document.getElementById('aiPreview');
          if (preview) preview.innerHTML = renderAIPreviewContent();
        } else if (data.status === 'completed') {
          clearInterval(aiGenState.pollTimer);
          aiGenState.pollTimer = null;
          aiGenState.isGenerating = false;
          aiGenState.progress = 100;
          var generateBtn = document.getElementById('aiGenerateBtn');
          if (generateBtn) generateBtn.classList.remove('generating');
          fetchGeneratedImages(data.images);
        } else if (data.status === 'failed') {
          clearInterval(aiGenState.pollTimer);
          aiGenState.pollTimer = null;
          aiGenState.isGenerating = false;
          var generateBtn2 = document.getElementById('aiGenerateBtn');
          if (generateBtn2) generateBtn2.classList.remove('generating');
          showToast('error', 'Generation Failed', data.error || 'Image generation failed.');
          var preview2 = document.getElementById('aiPreview');
          if (preview2) preview2.innerHTML = renderAIPreviewContent();
        }
      }).catch(function (err) {
        console.error('Poll error:', err);
      });
    }, 1000);
  }

  function fetchGeneratedImages(imageMetas) {
    if (!imageMetas || !imageMetas.length) { showToast('warning', 'No Images', 'Generation completed but no images were returned.'); return; }
    var baseUrl = window.getBackendUrl().replace(/\/+$/, '');
    var promises = [];
    for (var i = 0; i < imageMetas.length; i++) {
      (function (meta, index) {
        var url = baseUrl + meta.url;
        promises.push(
          fetch(url, { headers: { 'Authorization': 'Bearer ' + (firebase.auth().currentUser ? 'dummy' : '') } }).then(function (resp) {
            if (!resp.ok) throw new Error('Failed to fetch image ' + index);
            return resp.blob();
          }).then(function (blob) {
            return new Promise(function (resolve) {
              var reader = new FileReader();
              reader.onload = function (e) {
                resolve({
                  id: meta.id,
                  name: 'ai-generated-' + (index + 1) + '.png',
                  dataUrl: e.target.result,
                  width: meta.width,
                  height: meta.height,
                  rotation: 0,
                  crop: null,
                  generated: true
                });
              };
              reader.readAsDataURL(blob);
            });
          })
        );
      })(imageMetas[i], i);
    }
    Promise.all(promises).then(function (results) {
      aiGenState.generatedImages = results;
      showToast('success', 'Images Generated', results.length + ' image(s) generated successfully!');
      var preview = document.getElementById('aiPreview');
      if (preview) preview.innerHTML = renderAIPreviewContent();
      updateAIGenButtons();
    }).catch(function (err) {
      showToast('error', 'Error', 'Failed to load generated images.');
      console.error(err);
    });
  }

  function addGeneratedImageToProject(idx) {
    if (idx < 0 || idx >= aiGenState.generatedImages.length) return;
    var img = aiGenState.generatedImages[idx];
    createImages.push({
      id: generateId(), name: img.name, dataUrl: img.dataUrl,
      width: img.width, height: img.height, rotation: 0, crop: null
    });
    renderImageGrid();
    document.getElementById('imageGridContainer').style.display = 'block';
    document.getElementById('createSettingsPanel').style.display = 'block';
    showToast('success', 'Image Added', '"' + img.name + '" added to your project.');
  }

  function addAllGeneratedToProject() {
    for (var i = 0; i < aiGenState.generatedImages.length; i++) {
      var img = aiGenState.generatedImages[i];
      createImages.push({
        id: generateId(), name: img.name, dataUrl: img.dataUrl,
        width: img.width, height: img.height, rotation: 0, crop: null
      });
    }
    renderImageGrid();
    document.getElementById('imageGridContainer').style.display = 'block';
    document.getElementById('createSettingsPanel').style.display = 'block';
    showToast('success', 'All Added', aiGenState.generatedImages.length + ' image(s) added to your project.');
  }

  function downloadGeneratedImage(idx) {
    if (idx < 0 || idx >= aiGenState.generatedImages.length) return;
    var img = aiGenState.generatedImages[idx];
    var a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = img.name;
    a.click();
  }

  function bindCreateEvents() {
    var addMore = document.getElementById("addMoreBtn");
    if (addMore) addMore.addEventListener("click", function () {
      if (aiGenState.activeTab === "ai") {
        aiGenState.activeTab = "upload";
        var tabs = document.querySelectorAll(".create-tab");
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("active");
        var uploadTab = document.querySelector("[data-create-tab='upload']");
        if (uploadTab) uploadTab.classList.add("active");
        renderCreateTabContent("upload");
        setTimeout(function () { var fi = document.getElementById("fileInput"); if (fi) fi.click(); }, 50);
      } else {
        var fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.click();
      }
    });
    var addMore = document.getElementById('addMoreBtn');
    if (addMore) addMore.addEventListener('click', function () { fileInput.click(); });
    var clearBtn = document.getElementById('clearImagesBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      createImages = [];
      renderImageGrid();
      document.getElementById('imageGridContainer').style.display = 'none';
      document.getElementById('createSettingsPanel').style.display = 'none';
    });
    var createBtn = document.getElementById('createVideoBtn');
    if (createBtn) createBtn.addEventListener('click', saveProjectAndRedirect);
  }

  function handleFiles(files) {
    if (!files || !files.length) return;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) promises.push(readImageFile(files[i]));
    }
    Promise.all(promises).then(function (results) {
      for (var j = 0; j < results.length; j++) createImages.push(results[j]);
      renderImageGrid();
      document.getElementById('imageGridContainer').style.display = 'block';
      document.getElementById('createSettingsPanel').style.display = 'block';
    });
  }

  function readImageFile(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          resolve({ id: generateId(), name: file.name, dataUrl: e.target.result, width: img.width, height: img.height, rotation: 0, crop: null });
        };
        img.onerror = function () { resolve({ id: generateId(), name: file.name, dataUrl: e.target.result, width: 0, height: 0, rotation: 0, crop: null }); };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImageGrid() {
    var grid = document.getElementById('imageGrid');
    var countEl = document.getElementById('imageCount');
    if (!grid) return;
    if (countEl) countEl.textContent = createImages.length;
    var html = '';
    for (var i = 0; i < createImages.length; i++) {
      var img = createImages[i];
      html += '<div class="image-thumb-item" draggable="true" data-idx="' + i + '"><div class="image-thumb-num">' + (i + 1) + '</div><img src="' + img.dataUrl + '" alt="' + escapeHtml(img.name) + '">' +
        '<div class="image-thumb-actions">' +
        '<button class="project-card-action" style="background:rgba(255,255,255,0.15);color:#fff;width:28px;height:28px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-img-action="rotate" data-idx="' + i + '" title="Rotate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>' +
        '<button class="project-card-action" style="background:rgba(255,255,255,0.15);color:#fff;width:28px;height:28px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-img-action="crop" data-idx="' + i + '" title="Crop"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/></svg></button>' +
        '<button class="project-card-action" style="background:rgba(255,255,255,0.15);color:#fff;width:28px;height:28px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-img-action="replace" data-idx="' + i + '" title="Replace"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></button>' +
        '<button class="project-card-action" style="background:rgba(255,255,255,0.15);color:#fff;width:28px;height:28px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-img-action="duplicate" data-idx="' + i + '" title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
        '<button class="project-card-action" style="background:rgba(225,112,85,0.4);color:#FF7675;width:28px;height:28px;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center" data-img-action="delete" data-idx="' + i + '" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div></div>';
    }
    grid.innerHTML = html;
    bindImageGridEvents();
  }

  function bindImageGridEvents() {
    var grid = document.getElementById('imageGrid');
    if (!grid) return;
    grid.addEventListener('dragstart', function (e) {
      var item = e.target.closest('.image-thumb-item');
      if (item) { draggedImgIdx = parseInt(item.getAttribute('data-idx')); item.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
    });
    grid.addEventListener('dragend', function (e) {
      var item = e.target.closest('.image-thumb-item');
      if (item) item.classList.remove('dragging');
    });
    grid.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    grid.addEventListener('drop', function (e) {
      e.preventDefault();
      var item = e.target.closest('.image-thumb-item');
      if (item && draggedImgIdx !== null) {
        var targetIdx = parseInt(item.getAttribute('data-idx'));
        if (draggedImgIdx !== targetIdx) {
          var moved = createImages.splice(draggedImgIdx, 1)[0];
          createImages.splice(targetIdx, 0, moved);
          renderImageGrid();
        }
      }
      draggedImgIdx = null;
    });
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-img-action]');
      if (!btn) return;
      e.stopPropagation();
      var action = btn.getAttribute('data-img-action');
      var idx = parseInt(btn.getAttribute('data-idx'));
      if (action === 'delete') { createImages.splice(idx, 1); renderImageGrid(); if (!createImages.length) { document.getElementById('imageGridContainer').style.display = 'none'; document.getElementById('createSettingsPanel').style.display = 'none'; } }
      if (action === 'duplicate') { var dup = JSON.parse(JSON.stringify(createImages[idx])); dup.id = generateId(); createImages.splice(idx + 1, 0, dup); renderImageGrid(); }
      if (action === 'rotate') rotateImage(idx);
      if (action === 'crop') openCropModal(idx);
      if (action === 'replace') replaceImage(idx);
    });
  }

  function rotateImage(idx) {
    var imgData = createImages[idx];
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      var rotation = (imgData.rotation + 90) % 360;
      if (rotation === 90 || rotation === 270) { canvas.width = img.height; canvas.height = img.width; }
      else { canvas.width = img.width; canvas.height = img.height; }
      var ctx = canvas.getContext('2d');
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
      imgData.dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      imgData.rotation = rotation;
      var temp = imgData.width; imgData.width = imgData.height; imgData.height = temp;
      renderImageGrid();
    };
    img.src = imgData.dataUrl;
  }

  function openCropModal(idx) {
    var imgData = createImages[idx];
    openModal('Crop Image', '<div style="text-align:center"><canvas id="cropCanvas" style="max-width:100%;max-height:400px;border-radius:var(--radius-md);cursor:crosshair;"></canvas>' +
      '<p style="font-size:var(--font-size-sm);color:var(--text-tertiary);margin-top:var(--space-3)">Click and drag to select crop area, then apply.</p></div>',
      '<button class="btn btn-ghost" id="cropCancelBtn">Cancel</button><button class="btn btn-primary" id="cropApplyBtn">Apply Crop</button>');

    var canvas = document.getElementById('cropCanvas');
    var ctx = canvas.getContext('2d');
    var img = new Image();
    var cropStart = null, cropEnd = null, cropping = false;
    var maxW = 500, maxH = 400;

    img.onload = function () {
      var scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = imgData.dataUrl;

    canvas.addEventListener('mousedown', function (e) {
      var rect = canvas.getBoundingClientRect();
      cropStart = { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
      cropEnd = null; cropping = true;
    });
    canvas.addEventListener('mousemove', function (e) {
      if (!cropping) return;
      var rect = canvas.getBoundingClientRect();
      cropEnd = { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      var x = Math.min(cropStart.x, cropEnd.x), y = Math.min(cropStart.y, cropEnd.y);
      var w = Math.abs(cropEnd.x - cropStart.x), h = Math.abs(cropEnd.y - cropStart.y);
      var sx = x / (canvas.width / img.width), sy = y / (canvas.height / img.height);
      var sw = w / (canvas.width / img.width), sh = h / (canvas.height / img.height);
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      ctx.strokeStyle = '#A29BFE';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    });
    canvas.addEventListener('mouseup', function () { cropping = false; });

    document.getElementById('cropCancelBtn').addEventListener('click', closeModal);
    document.getElementById('cropApplyBtn').addEventListener('click', function () {
      if (!cropStart || !cropEnd) { closeModal(); return; }
      var x = Math.min(cropStart.x, cropEnd.x), y = Math.min(cropStart.y, cropEnd.y);
      var w = Math.abs(cropEnd.x - cropStart.x), h = Math.abs(cropEnd.y - cropStart.y);
      if (w < 10 || h < 10) { closeModal(); return; }
      var scaleX = img.width / canvas.width, scaleY = img.height / canvas.height;
      var outCanvas = document.createElement('canvas');
      outCanvas.width = w * scaleX; outCanvas.height = h * scaleY;
      outCanvas.getContext('2d').drawImage(img, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, outCanvas.width, outCanvas.height);
      imgData.dataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
      imgData.width = outCanvas.width; imgData.height = outCanvas.height;
      closeModal();
      renderImageGrid();
    });
  }

  function replaceImage(idx) {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = function () {
      if (input.files.length) {
        readImageFile(input.files[0]).then(function (result) {
          createImages[idx] = result;
          renderImageGrid();
        });
      }
    };
    input.click();
  }

  function saveProjectAndRedirect() {
    if (!createImages.length) { showToast('warning', 'No Images', 'Please add at least one image.'); return; }
    var user = getUser();
    if (!user || !db) { showToast('error', 'Error', 'You must be logged in.'); return; }
    var btn = document.getElementById('createVideoBtn');
    if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); btn.textContent = 'Creating...'; }
    var arEl = document.getElementById('crAspectRatio');
    var durEl = document.getElementById('crDuration');
    var effEl = document.getElementById('crEffect');
    var trEl = document.getElementById('crTransition');
    var project = {
      userId: user.uid, name: 'Untitled Project',
      aspectRatio: arEl ? arEl.value : '9:16',
      defaultDuration: durEl ? parseFloat(durEl.value) : 3,
      defaultEffect: effEl ? effEl.value : 'none',
      defaultTransition: trEl ? trEl.value : 'fade',
      imageCount: createImages.length,
      totalDuration: createImages.length * (durEl ? parseFloat(durEl.value) : 3),
      images: createImages.map(function (img) { return { id: img.id, name: img.name, dataUrl: img.dataUrl, width: img.width, height: img.height, rotation: img.rotation }; }),
      thumbnail: createImages[0].dataUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection('projects').add(project).then(function (ref) {
      db.collection('users').doc(user.uid).update({ projectsCount: firebase.firestore.FieldValue.increment(1) }).catch(function () {});
      db.collection('history').add({ userId: user.uid, type: 'create', description: 'Created project "Untitled Project"', projectId: ref.id, createdAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
      window.location.href = 'editor.html?id=' + ref.id;
    }).catch(function () {
      showToast('error', 'Error', 'Failed to create project.');
      if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Create Video'; }
    });
  }

  /* ===== PAGE: TEMPLATES ===== */
  function renderTemplates(el) {
    var categories = ['All', 'YouTube Shorts', 'TikTok', 'Instagram Reels', 'Facebook Videos', 'Church', 'Events', 'Bible Verse', 'Testimony', 'Quote', 'Worship'];
    var chipsHtml = '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-6)" id="templateChips">';
    for (var i = 0; i < categories.length; i++) {
      chipsHtml += '<span class="chip ' + (i === 0 ? 'active' : '') + '" data-cat="' + categories[i] + '">' + categories[i] + '</span>';
    }
    chipsHtml += '</div>';
    el.innerHTML = '<div class="page-header"><h1>Templates</h1><p>Start with a pre-designed template for your video.</p></div>' + chipsHtml + '<div id="templatesGrid">' + skeletonCards(8) + '</div>';
    renderTemplateCards('All');
    document.getElementById('templateChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var chips = this.querySelectorAll('.chip');
      for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
      chip.classList.add('active');
      renderTemplateCards(chip.getAttribute('data-cat'));
    });
  }

  function renderTemplateCards(category) {
    var grid = document.getElementById('templatesGrid');
    var filtered = category === 'All' ? TEMPLATE_DATA : TEMPLATE_DATA.filter(function (t) { return t.category === category; });
    if (!filtered.length) { grid.innerHTML = emptyState('No Templates', 'No templates found in this category.'); return; }
    var html = '<div class="templates-grid">';
    for (var i = 0; i < filtered.length; i++) {
      var t = filtered[i];
      html += '<div class="template-card" data-template-idx="' + TEMPLATE_DATA.indexOf(t) + '">' +
        '<div class="template-card-thumb" style="background:' + t.gradient + ';display:flex;align-items:center;justify-content:center;">' +
        '<div style="width:60px;height:60px;border-radius:var(--radius-lg);background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);">' +
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg></div>' +
        '<span class="template-card-badge badge badge-primary">' + escapeHtml(t.category) + '</span></div>' +
        '<div class="template-card-body"><div class="template-card-title">' + escapeHtml(t.name) + '</div>' +
        '<div class="template-card-category">' + escapeHtml(t.aspectRatio) + ' &middot; ' + t.duration + 's</div></div></div>';
    }
    html += '</div>';
    grid.innerHTML = html;
    grid.onclick = function (e) {
      var card = e.target.closest('.template-card');
      if (!card) return;
      var idx = parseInt(card.getAttribute('data-template-idx'));
      createProjectFromTemplate(TEMPLATE_DATA[idx]);
    };
  }

  function createProjectFromTemplate(tmpl) {
    var user = getUser();
    if (!user || !db) { showToast('error', 'Error', 'You must be logged in.'); return; }
    var project = {
      userId: user.uid, name: tmpl.name, aspectRatio: tmpl.aspectRatio,
      defaultDuration: tmpl.duration, defaultEffect: tmpl.effect, defaultTransition: tmpl.transition,
      imageCount: 0, totalDuration: 0, images: [], templateName: tmpl.name, templateCategory: tmpl.category,
      thumbnail: tmpl.gradient,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection('projects').add(project).then(function (ref) {
      db.collection('users').doc(user.uid).update({ projectsCount: firebase.firestore.FieldValue.increment(1), templatesUsed: firebase.firestore.FieldValue.increment(1) }).catch(function () {});
      showToast('success', 'Project Created', 'Template "' + tmpl.name + '" applied.');
      window.location.href = 'editor.html?id=' + ref.id;
    }).catch(function () { showToast('error', 'Error', 'Failed to create project from template.'); });
  }

  /* ===== PAGE: RECENT ===== */
  function renderRecent(el) {
    el.innerHTML = '<div class="page-header"><h1>Recent Videos</h1><p>Videos that have been rendered.</p></div><div id="recentGrid">' + skeletonCards(6) + '</div>';
    var user = getUser();
    if (!user || !db) { document.getElementById('recentGrid').innerHTML = emptyState('No Videos', 'Render a project to see it here.', 'create'); bindEmptyCTA(document.getElementById('recentGrid')); return; }
    db.collection('projects').where('userId', '==', user.uid).where('lastRenderedAt', '!=', null).orderBy('lastRenderedAt', 'desc').get().then(function (snap) {
      if (snap.empty) { document.getElementById('recentGrid').innerHTML = emptyState('No Rendered Videos', 'Projects that have been rendered will appear here.', 'projects'); bindEmptyCTA(document.getElementById('recentGrid')); return; }
      var html = '<div class="projects-grid">';
      snap.forEach(function (doc) {
        var p = doc.data();
        var thumb = p.thumbnail || p.renderedThumbnail || GRADIENT_THUMBS[Math.abs(doc.id.length) % GRADIENT_THUMBS.length];
        var thumbHtml = thumb.indexOf('linear-gradient') !== -1 ? '<div style="width:100%;height:100%;background:' + thumb + '"></div>' : '<img src="' + thumb + '" alt="' + escapeHtml(p.name) + '">';
        var res = p.resolution || (p.aspectRatio === '9:16' ? '1080x1920' : '1920x1080');
        var dur = p.totalDuration || 0;
        var durStr = dur >= 60 ? Math.floor(dur / 60) + ':' + String(Math.floor(dur % 60)).padStart(2, '0') : dur + 's';
        html += '<div class="video-card"><div class="video-card-thumb">' + thumbHtml + '</div><div class="video-card-body"><div class="video-card-title">' + escapeHtml(p.name || 'Untitled') + '</div>' +
          '<div class="video-card-meta"><span class="badge badge-info">' + escapeHtml(res) + '</span><span>' + durStr + '</span><span>' + formatDate(p.lastRenderedAt) + '</span></div>' +
          (p.videoUrl ? '<button class="btn btn-sm btn-primary" style="margin-top:var(--space-2)" data-download-url="' + escapeHtml(p.videoUrl) + '" data-download-name="' + escapeHtml(p.name || 'video') + '.mp4">Download</button>' : '') +
          '</div></div>';
      });
      html += '</div>';
      document.getElementById('recentGrid').innerHTML = html;
      var downloadBtns = document.querySelectorAll('[data-download-url]');
      for (var i = 0; i < downloadBtns.length; i++) {
        downloadBtns[i].addEventListener('click', function () {
          var url = this.getAttribute('data-download-url');
          var name = this.getAttribute('data-download-name');
          if (url && Utils && Utils.downloadFile) Utils.downloadFile(url, name);
          else if (url) { var a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
        });
      }
    }).catch(function () { document.getElementById('recentGrid').innerHTML = emptyState('Error', 'Could not load rendered videos.', 'projects'); });
  }

  /* ===== PAGE: ACCOUNT ===== */
  function renderAccount(el) {
    var user = getUser();
    if (!user) { el.innerHTML = '<div class="empty-state"><h3>Not Logged In</h3></div>'; return; }
    var initials = (user.displayName || user.email || 'U').split(' ').map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
    var avatarHtml = user.photoURL ? '<img src="' + escapeHtml(user.photoURL) + '" alt="Avatar" class="avatar-xl" style="border-radius:50%;object-fit:cover;">' :
      '<div class="avatar avatar-xl">' + initials + '</div>';
    el.innerHTML = '<div class="profile-header">' +
      '<div class="profile-avatar-wrapper">' + avatarHtml + '</div>' +
      '<div><div class="profile-name">' + escapeHtml(user.displayName || 'User') + '</div>' +
      '<div class="profile-email">' + escapeHtml(user.email || '') + '</div>' +
      '<div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-top:var(--space-1)">Member since ' + formatDate(user.metadata && user.metadata.creationTime) + '</div></div></div>' +
      '<div class="settings-section"><div class="settings-section-title">Edit Profile</div>' +
      '<div style="max-width:480px">' +
      '<div class="form-group"><label class="form-label">Display Name</label><input type="text" class="form-input" id="acctDisplayName" value="' + escapeHtml(user.displayName || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Email (read-only)</label><input type="email" class="form-input" value="' + escapeHtml(user.email || '') + '" disabled></div>' +
      '<div class="form-group"><label class="form-label">Photo URL</label><input type="url" class="form-input" id="acctPhotoUrl" value="' + escapeHtml(user.photoURL || '') + '" placeholder="https://example.com/photo.jpg"></div>' +
      '<button class="btn btn-primary" id="saveProfileBtn">Save Changes</button></div></div>' +
      '<div class="settings-section"><div class="settings-section-title">Change Password</div>' +
      '<div style="max-width:480px">' +
      '<div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-input" id="acctCurrentPwd"></div>' +
      '<div class="form-group"><label class="form-label">New Password</label><input type="password" class="form-input" id="acctNewPwd"></div>' +
      '<div class="form-group"><label class="form-label">Confirm New Password</label><input type="password" class="form-input" id="acctConfirmPwd"></div>' +
      '<button class="btn btn-primary" id="changePwdBtn">Change Password</button></div></div>' +
      '<div class="settings-section" style="border-color:rgba(225,112,85,0.3)"><div class="settings-section-title" style="color:var(--color-danger)">Danger Zone</div>' +
      '<p style="font-size:var(--font-size-sm);color:var(--text-tertiary);margin-bottom:var(--space-4)">Once you delete your account, there is no going back. All your data will be permanently removed.</p>' +
      '<button class="btn btn-danger" id="deleteAcctBtn">Delete Account</button></div>';

    document.getElementById('saveProfileBtn').addEventListener('click', function () {
      var displayName = document.getElementById('acctDisplayName').value.trim();
      var photoURL = document.getElementById('acctPhotoUrl').value.trim();
      if (Auth && Auth.handleProfileUpdate) Auth.handleProfileUpdate({ displayName: displayName, photoURL: photoURL });
      else showToast('error', 'Error', 'Auth module not available.');
    });

    document.getElementById('changePwdBtn').addEventListener('click', function () {
      var current = document.getElementById('acctCurrentPwd').value;
      var newPwd = document.getElementById('acctNewPwd').value;
      var confirm = document.getElementById('acctConfirmPwd').value;
      if (!current || !newPwd || !confirm) { showToast('warning', 'Missing Fields', 'Please fill in all password fields.'); return; }
      if (newPwd.length < 6) { showToast('warning', 'Weak Password', 'New password must be at least 6 characters.'); return; }
      if (newPwd !== confirm) { showToast('warning', 'Mismatch', 'New passwords do not match.'); return; }
      var btn = this; btn.disabled = true; btn.textContent = 'Changing...';
      var credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
      user.reauthenticateWithCredential(credential).then(function () {
        return user.updatePassword(newPwd);
      }).then(function () {
        showToast('success', 'Password Changed', 'Your password has been updated.');
        document.getElementById('acctCurrentPwd').value = '';
        document.getElementById('acctNewPwd').value = '';
        document.getElementById('acctConfirmPwd').value = '';
      }).catch(function (err) {
        if (err.code === 'auth/wrong-password') showToast('error', 'Wrong Password', 'Current password is incorrect.');
        else if (err.code === 'auth/weak-password') showToast('error', 'Weak Password', 'New password is too weak.');
        else showToast('error', 'Error', 'Failed to change password.');
      }).finally(function () { btn.disabled = false; btn.textContent = 'Change Password'; });
    });

    document.getElementById('deleteAcctBtn').addEventListener('click', function () {
      openModal('Delete Account', '<p style="color:var(--text-secondary)">This will permanently delete your account and all associated data. Type <strong>DELETE</strong> to confirm.</p>' +
        '<input type="text" class="form-input" id="deleteAcctConfirm" placeholder="Type DELETE to confirm" style="margin-top:var(--space-4)">',
        '<button class="btn btn-ghost" id="cancelDeleteAcctBtn">Cancel</button><button class="btn btn-danger" id="confirmDeleteAcctBtn">Delete Forever</button>');
      document.getElementById('cancelDeleteAcctBtn').addEventListener('click', closeModal);
      document.getElementById('confirmDeleteAcctBtn').addEventListener('click', function () {
        if (document.getElementById('deleteAcctConfirm').value !== 'DELETE') { showToast('warning', 'Confirmation Required', 'Please type DELETE to confirm.'); return; }
        closeModal();
        user.delete().then(function () {
          showToast('info', 'Account Deleted', 'Your account has been permanently deleted.');
          window.location.href = 'index.html';
        }).catch(function (err) {
          if (err.code === 'auth/requires-recent-login') showToast('error', 'Re-login Required', 'Please sign out and sign in again before deleting your account.');
          else showToast('error', 'Error', 'Failed to delete account.');
        });
      });
    });
  }

  /* ===== PAGE: SETTINGS ===== */
  function renderSettings(el) {
    var user = getUser();
    el.innerHTML = '<div class="page-header"><h1>Settings</h1><p>Configure your preferences.</p></div>' +
      '<div id="settingsContent">' + skeletonCards(3) + '</div>';
    if (user && db) {
      db.collection('users').doc(user.uid).get().then(function (doc) {
        var data = doc.exists ? doc.data() : {};
        var s = data.settings || {};
        renderSettingsContent(s);
      }).catch(function () { renderSettingsContent({}); });
    } else { renderSettingsContent({}); }
  }

  function renderSettingsContent(s) {
    var theme = Utils ? Utils.getTheme() : 'dark';
    var ar = s.defaultAspectRatio || '9:16';
    var res = s.defaultResolution || '1080p';
    var autoSave = s.autoSave !== false;
    var imgDur = s.defaultImageDuration || 3;
    var trans = s.defaultTransition || 'fade';
    var effect = s.defaultEffect || 'none';
    var emailNotif = s.emailNotifications !== false;
    var renderNotif = s.renderCompleteNotification !== false;
    var weeklyDigest = s.weeklyDigest || false;

    var html =
      '<div class="settings-section"><div class="settings-section-title">Appearance</div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Theme</div><div class="settings-row-desc">Switch between dark and light mode</div></div>' +
      '<label class="toggle"><input type="checkbox" id="setTheme" ' + (theme === 'dark' ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Default Aspect Ratio</div></div>' +
      '<select class="form-select" style="width:180px" id="setAspectRatio"><option value="9:16" ' + (ar === '9:16' ? 'selected' : '') + '>9:16 Vertical</option><option value="16:9" ' + (ar === '16:9' ? 'selected' : '') + '>16:9 Landscape</option><option value="1:1" ' + (ar === '1:1' ? 'selected' : '') + '>1:1 Square</option><option value="4:5" ' + (ar === '4:5' ? 'selected' : '') + '>4:5 Instagram</option></select></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Default Resolution</div></div>' +
      '<select class="form-select" style="width:180px" id="setResolution"><option value="720p" ' + (res === '720p' ? 'selected' : '') + '>720p HD</option><option value="1080p" ' + (res === '1080p' ? 'selected' : '') + '>1080p Full HD</option><option value="4k" ' + (res === '4k' ? 'selected' : '') + '>4K Ultra HD</option></select></div></div>' +

      '<div class="settings-section"><div class="settings-section-title">Preferences</div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Auto-Save</div><div class="settings-row-desc">Automatically save project changes</div></div>' +
      '<label class="toggle"><input type="checkbox" id="setAutoSave" ' + (autoSave ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Default Image Duration</div></div>' +
      '<div style="display:flex;align-items:center;gap:var(--space-3)"><input type="range" class="range-slider" style="width:140px" id="setImageDuration" min="1" max="30" value="' + imgDur + '"><span id="imgDurVal" style="font-size:var(--font-size-sm);min-width:36px">' + imgDur + 's</span></div></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Default Transition</div></div>' +
      '<select class="form-select" style="width:180px" id="setTransition"><option value="fade" ' + (trans === 'fade' ? 'selected' : '') + '>Fade</option><option value="crossfade" ' + (trans === 'crossfade' ? 'selected' : '') + '>Crossfade</option><option value="dissolve" ' + (trans === 'dissolve' ? 'selected' : '') + '>Dissolve</option><option value="slide" ' + (trans === 'slide' ? 'selected' : '') + '>Slide</option><option value="none" ' + (trans === 'none' ? 'selected' : '') + '>None</option></select></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Default Effect</div></div>' +
      '<select class="form-select" style="width:180px" id="setEffect"><option value="none" ' + (effect === 'none' ? 'selected' : '') + '>None</option><option value="zoom" ' + (effect === 'zoom' ? 'selected' : '') + '>Zoom In</option><option value="pan" ' + (effect === 'pan' ? 'selected' : '') + '>Pan</option><option value="kenburns" ' + (effect === 'kenburns' ? 'selected' : '') + '>Ken Burns</option></select></div></div>' +

      '<div class="settings-section"><div class="settings-section-title">Notifications</div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Email Notifications</div><div class="settings-row-desc">Receive updates via email</div></div>' +
      '<label class="toggle"><input type="checkbox" id="setEmailNotif" ' + (emailNotif ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Render Complete</div><div class="settings-row-desc">Notify when video rendering finishes</div></div>' +
      '<label class="toggle"><input type="checkbox" id="setRenderNotif" ' + (renderNotif ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>' +
      '<div class="settings-row"><div><div class="settings-row-label">Weekly Digest</div><div class="settings-row-desc">Summary of your weekly activity</div></div>' +
      '<label class="toggle"><input type="checkbox" id="setWeeklyDigest" ' + (weeklyDigest ? 'checked' : '') + '><span class="toggle-slider"></span></label></div></div>' +

      '<div class="settings-section"><div class="settings-section-title">Data</div>' +
      '<div style="display:flex;gap:var(--space-3);flex-wrap:wrap">' +
      '<button class="btn btn-secondary" id="exportDataBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export All Data</button>' +
      '<button class="btn btn-ghost" id="clearCacheBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Clear Cache</button>' +
      '</div></div>' +
      '<div style="margin-top:var(--space-5)"><button class="btn btn-primary" id="saveSettingsBtn">Save Settings</button></div>';

    document.getElementById('settingsContent').innerHTML = html;
    bindSettingsEvents();
  }

  function bindSettingsEvents() {
    var themeToggle = document.getElementById('setTheme');
    if (themeToggle) {
      themeToggle.addEventListener('change', function () {
        var next = this.checked ? 'dark' : 'light';
        if (Utils) Utils.setTheme(next);
        var icon = document.getElementById('themeIcon');
        if (icon) {
          icon.innerHTML = next === 'dark' ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' :
            '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
        }
        debouncedSaveSettings();
      });
    }

    var durSlider = document.getElementById('setImageDuration');
    var durVal = document.getElementById('imgDurVal');
    if (durSlider && durVal) {
      durSlider.addEventListener('input', function () { durVal.textContent = this.value + 's'; });
      durSlider.addEventListener('change', debouncedSaveSettings);
    }

    ['setAspectRatio', 'setResolution', 'setTransition', 'setEffect'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', debouncedSaveSettings);
    });

    ['setAutoSave', 'setEmailNotif', 'setRenderNotif', 'setWeeklyDigest'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', debouncedSaveSettings);
    });

    var saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveSettings(); showToast('success', 'Settings Saved', 'Your preferences have been saved.'); });

    var exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportUserData);

    var clearBtn = document.getElementById('clearCacheBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      localStorage.removeItem('giodai-theme');
      if (caches && caches.keys) caches.keys().then(function (names) { names.forEach(function (n) { caches.delete(n); }); }).catch(function () {});
      showToast('success', 'Cache Cleared', 'Local cache has been cleared.');
    });
  }

  function getSettingsObject() {
    return {
      defaultAspectRatio: (document.getElementById('setAspectRatio') || {}).value || '9:16',
      defaultResolution: (document.getElementById('setResolution') || {}).value || '1080p',
      autoSave: (document.getElementById('setAutoSave') || {}).checked !== false,
      defaultImageDuration: parseInt((document.getElementById('setImageDuration') || {}).value) || 3,
      defaultTransition: (document.getElementById('setTransition') || {}).value || 'fade',
      defaultEffect: (document.getElementById('setEffect') || {}).value || 'none',
      emailNotifications: (document.getElementById('setEmailNotif') || {}).checked !== false,
      renderCompleteNotification: (document.getElementById('setRenderNotif') || {}).checked !== false,
      weeklyDigest: (document.getElementById('setWeeklyDigest') || {}).checked || false
    };
  }

  function saveSettings() {
    var user = getUser();
    if (!user || !db) return;
    db.collection('users').doc(user.uid).set({ settings: getSettingsObject(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(function () {});
  }

  var debouncedSaveSettings = (Utils && Utils.debounce) ? Utils.debounce(function () { saveSettings(); }, 500) :
    (function () { var t = null; return function () { if (t) clearTimeout(t); t = setTimeout(saveSettings, 500); }; })();

  function exportUserData() {
    var user = getUser();
    if (!user || !db) { showToast('error', 'Error', 'You must be logged in.'); return; }
    showToast('info', 'Exporting', 'Gathering your data...');
    var exportData = { profile: { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }, projects: [], settings: {} };
    db.collection('users').doc(user.uid).get().then(function (doc) {
      if (doc.exists) exportData.settings = doc.data().settings || {};
      return db.collection('projects').where('userId', '==', user.uid).get();
    }).then(function (snap) {
      if (snap) snap.forEach(function (d) { exportData.projects.push(d.data()); });
      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'giodai-export-' + Date.now() + '.json'; a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Export Complete', 'Your data has been downloaded.');
    }).catch(function () { showToast('error', 'Error', 'Failed to export data.'); });
  }

  /* ===== HELPERS ===== */
  function emptyState(title, desc, ctaPage) {
    return '<div class="empty-state"><div class="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>' +
      '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(desc) + '</p>' +
      (ctaPage ? '<button class="btn btn-primary" data-nav="' + ctaPage + '">Get Started</button>' : '') + '</div>';
  }

  function bindEmptyCTA(container) {
    var cta = container.querySelector('[data-nav]');
    if (cta) cta.addEventListener('click', function () { navigateTo(this.getAttribute('data-nav')); });
  }

  /* ===== INIT ===== */
  function initDashboard() {
    if (!auth) {
      window.addEventListener('firebase-ready', initDashboard);
      return;
    }
    auth.onAuthStateChanged(function (user) {
      if (!user) { window.location.href = 'auth/login.html'; return; }
      db = window.firebaseDb;
      initSidebar();
      initThemeToggle();
      initNotifications();
      initSearch();
      initModal();
      navigateTo('home');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }
})();
