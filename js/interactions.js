// ── Linkify ───────────────────────────────────────────────────────────────
function linkify(text) {
  return text.replace(/(https?:\/\/[\S]+|www\.[\S]+)/g, url => {
    const href = url.startsWith('http') ? url : 'https://' + url;
    return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });
}

// ── Drawer ────────────────────────────────────────────────────────────────
const drawer   = document.getElementById('drawer');
const btnPrev  = document.getElementById('drawer-prev');
const btnNext  = document.getElementById('drawer-next');
let activeDrawerId = null;
let navMode = 'all'; // 'all' | 'category'

function getNavEvents() {
  const vis = getVisibleEvents();
  if (navMode === 'category' && activeDrawerId !== null) {
    const cur = events.find(e => e.id === activeDrawerId);
    if (cur) return vis.filter(e => e.group === cur.group);
  }
  return vis;
}

document.getElementById('scope-all').addEventListener('click', () => {
  navMode = 'all';
  document.getElementById('scope-all').classList.add('active');
  document.getElementById('scope-cat').classList.remove('active');
  updateDrawerNav();
});
document.getElementById('scope-cat').addEventListener('click', () => {
  navMode = 'category';
  document.getElementById('scope-cat').classList.add('active');
  document.getElementById('scope-all').classList.remove('active');
  updateDrawerNav();
});
const noembedCache = new Map();

async function fetchNoembed(url) {
  if (noembedCache.has(url)) return noembedCache.get(url);
  const res  = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  noembedCache.set(url, data);
  return data;
}

function preloadAdjacent() {
  const vis = getVisibleEvents();
  const idx = vis.findIndex(e => e.id === activeDrawerId);
  [idx - 1, idx + 1].forEach(i => {
    if (i >= 0 && i < vis.length) {
      const ev = vis[i];
      if (ev.media && /flickr\.com/.test(ev.media) && !noembedCache.has(ev.media))
        fetchNoembed(ev.media).catch(() => {});
    }
  });
}

function getVisibleEvents() {
  return events.filter(isEventVisible).sort((a, b) => a.startTs - b.startTs);
}

async function renderMedia(ev, container) {
  container.innerHTML = '';

  const url   = ev.media || '';
  const thumb = ev.mediaThumbnail || '';
  const targetId = ev.id;

  const metaHtml = (caption, credit) => {
    let html = '';
    if (caption) html += `<div class="d-media-caption">${caption}</div>`;
    if (credit)  html += `<div class="d-media-credit">${credit}</div>`;
    return html;
  };

  // Build video HTML (sync)
  let vidHtml = '';
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    vidHtml = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe>`;
  } else {
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) vidHtml = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" allowfullscreen></iframe>`;
  }

  // Case 1: video present → embed only, ignore thumbnail
  if (vidHtml) {
    container.innerHTML = vidHtml + metaHtml(ev.mediaCaption, ev.mediaCredit);
    return;
  }

  // Case 1b: direct thumbnail URL → show image (no video)
  if (thumb && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(thumb)) {
    container.innerHTML = `<img src="${thumb}" alt="${ev.mediaCaption || ''}">${metaHtml(ev.mediaCaption, ev.mediaCredit)}`;
    return;
  }

  // Case 2: direct image URL in media
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)) {
    container.innerHTML = `<img src="${url}" alt="${ev.mediaCaption || ''}">${metaHtml(ev.mediaCaption, ev.mediaCredit)}`;
    return;
  }

  // Case 3: Flickr → async noembed for image (check media url first, then thumbnail)
  const flickrUrl = /flickr\.com/.test(url) ? url : /flickr\.com/.test(thumb) ? thumb : null;
  if (flickrUrl) {
    container.innerHTML = '<div class="d-media-caption">Loading…</div>';
    try {
      const data   = await fetchNoembed(flickrUrl);
      if (activeDrawerId !== targetId) return;
      const imgUrl = data.media_url || data.thumbnail_url;
      const imgHtml = imgUrl
        ? `<img src="${imgUrl}" alt="${data.title || ''}">`
        : `<a href="${flickrUrl}" target="_blank" style="color:${COLORS.accent}">View photo ↗</a>`;
      container.innerHTML = imgHtml + metaHtml(ev.mediaCaption, ev.mediaCredit || data.author_name);
    } catch {
      if (activeDrawerId === targetId)
        container.innerHTML = `<a href="${flickrUrl}" target="_blank" style="color:${COLORS.accent}">View photo ↗</a>${metaHtml(ev.mediaCaption, ev.mediaCredit)}`;
    }
    return;
  }

}

function updateDrawerNav() {
  const nav = getNavEvents();
  const idx = nav.findIndex(e => e.id === activeDrawerId);
  btnPrev.disabled = idx <= 0;
  btnNext.disabled = idx < 0 || idx >= nav.length - 1;
}

async function openDrawer(ev) {
  if (activeDrawerId === ev.id) { closeDrawer(); return; }
  const color = groupColor[ev.group] || '#e5e7eb';
  const titleEl = document.getElementById('d-title');
  titleEl.textContent = ev.headline;
  titleEl.style.color = color;
  const duration = ev.end > ev.start
    ? `${fmtDate(ev.start)} → ${fmtDate(ev.end)}`
    : fmtDate(ev.start);
  // Trust assumption: data is user-controlled (own xlsx/GSheet); ev.group is not sanitized.
  document.getElementById('d-meta').innerHTML = `<div>${duration}</div><div>${ev.group}</div>`;
  document.getElementById('d-desc').innerHTML = linkify(ev.description || '');
  const moreEl = document.getElementById('d-more');
  moreEl.innerHTML = ev.headlineUrl
    ? `<a href="${ev.headlineUrl}" target="_blank">${ev.headlineLinkLabel || 'More Info'} ↗</a>`
    : '';
  const teamEl = document.getElementById('d-team');
  if (ev.teamMembers) {
    // Parse segments into {role, names} objects
    const parsed = ev.teamMembers.split(';').map(s => s.trim()).filter(Boolean).map(seg => {
      const colon = seg.indexOf(':');
      return colon === -1 ? { role: seg, names: '' } : { role: seg.slice(0, colon).trim(), names: seg.slice(colon + 1).trim() };
    });

    // Collect RA sub-levels
    const RA_LEVELS = [
      { key: 'RA-Undergraduate', label: 'Undergraduate' },
      { key: 'RA-Masters',       label: 'Masters' },
      { key: 'RA-PhD',           label: 'PhD' },
    ];
    const raMap = {};
    RA_LEVELS.forEach(l => { raMap[l.key] = null; });
    parsed.forEach(p => { if (raMap.hasOwnProperty(p.role)) raMap[p.role] = p.names; });
    const hasRA = RA_LEVELS.some(l => raMap[l.key] !== null);
    const raCount = RA_LEVELS.reduce((n, l) => raMap[l.key] !== null ? n + raMap[l.key].split(',').length : n, 0);

    // Non-RA roles in display order
    const NON_RA_ORDER = ['Staff', 'Co-investigator', 'Co-investigators', 'Primary Investigator'];
    const nonRA = NON_RA_ORDER.map(r => parsed.find(p => p.role.toLowerCase() === r.toLowerCase())).filter(Boolean);
    // Also catch any unrecognised roles
    const knownRoles = new Set([...RA_LEVELS.map(l => l.key.toLowerCase()), ...NON_RA_ORDER.map(r => r.toLowerCase())]);
    parsed.filter(p => !knownRoles.has(p.role.toLowerCase())).forEach(p => nonRA.push(p));

    let html = '';

    // Research Assistant block
    if (hasRA) {
      const raLabel = raCount > 1 ? 'Research Assistants' : 'Research Assistant';
      html += `<div class="d-team-group"><span class="d-team-role">${raLabel}</span>`;
      RA_LEVELS.forEach(l => {
        if (raMap[l.key] === null) return;
        const names = raMap[l.key].split(',').map(s => s.trim()).filter(Boolean);
        const namesHtml = names.length === 2
          ? `<span class="d-team-name">${names.join(' and ')}</span>`
          : names.map(n => `<span class="d-team-name">${n}</span>`).join('');
        html += `<div class="d-team-ra-level"><span class="d-team-sublabel">${l.label}</span>${namesHtml}</div>`;
      });
      html += `</div>`;
    }

    // Remaining roles
    const ROLE_PLURAL = {
      'co-investigator':   ['Co-investigator',  'Co-investigators'],
      'co-investigators':  ['Co-investigator',  'Co-investigators'],
      'primary investigator':  ['Primary Investigator', 'Primary Investigators'],
      'primary investigators': ['Primary Investigator', 'Primary Investigators'],
    };
    nonRA.forEach(p => {
      let namesHtml = '';
      let names = [];
      if (p.names) {
        names = p.names.split(',').map(s => s.trim()).filter(Boolean);
        namesHtml = '<br>' + (names.length === 2 ? names.join(' and ') : names.map(n => `<span class="d-team-name">${n}</span>`).join(''));
      }
      const pair = ROLE_PLURAL[p.role.toLowerCase()];
      const label = pair ? (names.length > 1 ? pair[1] : pair[0]) : p.role;
      html += `<div class="d-team-group"><span class="d-team-role">${label}</span>${namesHtml}</div>`;
    });

    teamEl.innerHTML = `<h3>Research Team</h3>${html}`;
  } else {
    teamEl.innerHTML = '';
  }

  const fundersEl = document.getElementById('d-funders');
  if (ev.funders) {
    const funders = ev.funders.split(';').map(s => s.trim()).filter(Boolean);
    const fundersHtml = funders.map(f => `<span class="d-team-name">${f}</span>`).join('');
    fundersEl.innerHTML = `<h3>Funders</h3>${fundersHtml}`;
  } else {
    fundersEl.innerHTML = '';
  }

  // ── Enrichment tags ───────────────────────────────────────────────────
  const renderTags = (elId, tags, cssClass, title) => {
    const el = document.getElementById(elId);
    if (tags && tags.length) {
      // Trust assumption: tag strings come from user-controlled enrichment data; not sanitized.
      const pills = tags.map(t => `<span class="d-tag ${cssClass}">${t}</span>`).join('');
      el.innerHTML = `<div class="d-tags"><h3>${title}</h3><div class="d-tag-list">${pills}</div></div>`;
    } else {
      el.innerHTML = '';
    }
  };
  renderTags('d-themes',        ev.themes,        'theme',        'Themes');
  renderTags('d-concepts',      ev.concepts,      'concept',      'Concepts');
  renderTags('d-collaborators', ev.collaborators, 'collaborator', 'Collaborators');

  activeDrawerId = ev.id;
  drawer.classList.add('open');
  closeMobileSidebar();
  updateDrawerNav();
  await renderMedia(ev, document.getElementById('d-media'));
  preloadAdjacent();
}

function closeDrawer() { drawer.classList.remove('open'); activeDrawerId = null; }

btnPrev.addEventListener('click', () => {
  const nav = getNavEvents();
  const idx = nav.findIndex(e => e.id === activeDrawerId);
  if (idx > 0) openDrawer(nav[idx - 1]);
});
btnNext.addEventListener('click', () => {
  const nav = getNavEvents();
  const idx = nav.findIndex(e => e.id === activeDrawerId);
  if (idx >= 0 && idx < nav.length - 1) openDrawer(nav[idx + 1]);
});

document.getElementById('drawer-x').addEventListener('click', () => closeDrawer());
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDrawer();
    exportModalBg.classList.remove('open');
  }
});

// ── Zoom & pan ────────────────────────────────────────────────────────────
const MIN_SCALE = 1e-11;
const MAX_SCALE = 1 / 3600000;

function zoom(factor, pivotX) {
  const tsAt = xToTs(pivotX);
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
  panX  = pivotX - LABEL_W - (tsAt - minTs) * scale;
  redraw();
}

function doZoomIn()  { zoom(1.5,     wrap.clientWidth / 2); }
function doZoomOut() { zoom(1 / 1.5, wrap.clientWidth / 2); }
function doToday()   { panX = wrap.clientWidth - LABEL_W - (Date.now() - minTs) * scale; redraw(); }

document.getElementById('btn-zoomin') .addEventListener('click', doZoomIn);
document.getElementById('btn-zoomout').addEventListener('click', doZoomOut);
document.getElementById('btn-fit')    .addEventListener('click', fitAll);
document.getElementById('btn-today')  .addEventListener('click', doToday);

// ── Search ────────────────────────────────────────────────────────────────
let searchResults = [], searchIdx = -1, searchQuery = '', searchMode = 'absolute';
let searchMatchSet = new Set(); // IDs of events matching current search
const searchInput   = document.getElementById('search-input');
const searchCount   = document.getElementById('search-count');
const searchPrev    = document.getElementById('search-prev');
const searchNext    = document.getElementById('search-next');
const searchAbsBtn  = document.getElementById('search-abs');
const searchRelBtn  = document.getElementById('search-rel');

function updateSearchUI() {
  const has = searchResults.length > 0;
  searchPrev.disabled = !has;
  searchNext.disabled = !has;
  searchCount.textContent = has ? `${searchIdx + 1} / ${searchResults.length}` : (searchQuery ? 'No matches' : '');
}

function jumpToEvent(ev) {
  panX = (wrap.clientWidth / 2) - LABEL_W - (ev.startTs - minTs) * scale;
  redraw();
  const rowTop = groupY[ev.group];
  if (rowTop !== undefined) {
    wrap.scrollTop = rowTop - wrap.clientHeight / 2 + (rowHeights[ev.group] || ROW_H) / 2;
  }
  openDrawer(ev);
}

function runSearch(q) {
  searchQuery = q;
  searchResults = events.filter(ev =>
    [ev.headline, ev.description, ev.group, ev.org, ev.program, ev.project, ev.teamMembers, ev.funders]
      .some(f => f && f.toLowerCase().includes(q))
  ).sort((a, b) => a.startTs - b.startTs);

  searchMatchSet = new Set(searchResults.map(e => e.id));
  if (!searchResults.length) { searchIdx = -1; return; }

  if (searchMode === 'relative') {
    // Start from first result at or after the current view centre
    const centreTs = xToTs(LABEL_W + (wrap.clientWidth - LABEL_W) / 2);
    searchIdx = searchResults.findIndex(ev => ev.startTs >= centreTs);
    if (searchIdx === -1) searchIdx = 0; // wrap to beginning if all are in the past
  } else {
    searchIdx = 0;
  }
}

searchInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!events.length) return;
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults = []; searchIdx = -1; searchQuery = ''; updateSearchUI(); return; }
  if (q !== searchQuery) runSearch(q);
  else if (searchResults.length) searchIdx = (searchIdx + 1) % searchResults.length;
  updateSearchUI();
  if (searchResults.length) jumpToEvent(searchResults[searchIdx]);
});

searchPrev.addEventListener('click', () => {
  if (!searchResults.length) return;
  searchIdx = (searchIdx - 1 + searchResults.length) % searchResults.length;
  updateSearchUI();
  jumpToEvent(searchResults[searchIdx]);
});

searchNext.addEventListener('click', () => {
  if (!searchResults.length) return;
  searchIdx = (searchIdx + 1) % searchResults.length;
  updateSearchUI();
  jumpToEvent(searchResults[searchIdx]);
});

searchAbsBtn.addEventListener('click', () => {
  searchMode = 'absolute';
  searchAbsBtn.classList.add('active');
  searchRelBtn.classList.remove('active');
  searchQuery = ''; // force re-run on next search
});

searchRelBtn.addEventListener('click', () => {
  searchMode = 'relative';
  searchRelBtn.classList.add('active');
  searchAbsBtn.classList.remove('active');
  searchQuery = ''; // force re-run on next search
});

searchInput.addEventListener('input', () => {
  if (!searchInput.value.trim()) { searchResults = []; searchIdx = -1; searchQuery = ''; searchMatchSet = new Set(); updateSearchUI(); redraw(); }
});

let spaceDown = false;
window.addEventListener('keydown', e => { if (e.code === 'Space') { spaceDown = true; e.preventDefault(); } });
window.addEventListener('keyup',   e => { if (e.code === 'Space') spaceDown = false; });

wrap.addEventListener('wheel', e => {
  if (!spaceDown) return;
  e.preventDefault();
  const r = wrap.getBoundingClientRect();
  zoom(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - r.left);
}, { passive: false });

wrap.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  dragging            = true;
  dragStartX          = e.clientX;
  dragStartPan        = panX;
  dragStartY          = e.clientY;
  dragStartScrollTop  = wrap.scrollTop;
  wrap.classList.add('panning');
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  panX = dragStartPan + (e.clientX - dragStartX);
  wrap.scrollTop = dragStartScrollTop - (e.clientY - dragStartY);
  if (!_rafPending) { _rafPending = true; requestAnimationFrame(() => { _rafPending = false; redraw(); }); }
});
window.addEventListener('mouseup', () => {
  dragging = false;
  wrap.classList.remove('panning');
});

// iOS horizontal pan — three-part solution:
// 1. document-level listeners + getBoundingClientRect guard (SVG events don't bubble to HTML)
// 2. {passive:false} + preventDefault for horizontal gestures (stops iOS gesture absorption)
// 3. Reparent touch target before redraw() so innerHTML='' doesn't fire touchcancel;
//    return it invisibly to tlSvg after — iOS keeps tracking the finger; full redraw each frame.
let touchStartX = null, touchStartY = null, touchStartPan = null;
let touchIsH = null, touchLiveDx = 0, touchRaf = null, _touchTargetEl = null;
const _touchAnchor = document.getElementById('_touch_anchor');

// Pinch-to-zoom state
let pinchActive = false, pinchStartDist = null, pinchStartScale = null;
let pinchLiveDist = null, pinchLiveMidX = null, pinchRaf = null;
let _pinchTargetEls = [];

function _pinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function _reparentIn(els) {
  els.forEach(el => { if (el && tlSvg.contains(el)) _touchAnchor.appendChild(el); });
}
function _reparentOut(els) {
  els.forEach(el => {
    if (el && _touchAnchor.contains(el)) {
      el.setAttribute('visibility', 'hidden');
      tlSvg.appendChild(el);
    }
  });
}

document.addEventListener('touchstart', e => {
  const r = wrap.getBoundingClientRect();
  if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    if (t0.clientX < r.left || t0.clientX > r.right) return;
    pinchActive     = true;
    pinchStartDist  = _pinchDist(e);
    pinchStartScale = scale;
    pinchLiveDist   = pinchStartDist;
    pinchLiveMidX   = ((t0.clientX + t1.clientX) / 2) - r.left;
    _pinchTargetEls = [t0, t1].map(t =>
      (e.target !== tlSvg && tlSvg.contains(e.target)) ? e.target : null
    );
    // Cancel any single-finger pan in progress
    touchStartX = null;
    return;
  }
  const t = e.touches[0];
  if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) return;
  touchStartX   = t.clientX;
  touchStartY   = t.clientY;
  touchStartPan = panX;
  touchIsH      = null;
  touchLiveDx   = 0;
  _touchTargetEl = (e.target !== tlSvg && tlSvg.contains(e.target)) ? e.target : null;
}, { passive: true });

document.addEventListener('touchmove', e => {
  // Pinch zoom
  if (pinchActive && e.touches.length === 2) {
    e.preventDefault();
    const r    = wrap.getBoundingClientRect();
    pinchLiveDist = _pinchDist(e);
    pinchLiveMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - r.left;
    if (!pinchRaf) pinchRaf = requestAnimationFrame(() => {
      pinchRaf = null;
      _reparentIn(_pinchTargetEls);
      const factor = pinchLiveDist / pinchStartDist;
      const tsAt   = xToTs(pinchLiveMidX);
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale * factor));
      panX  = pinchLiveMidX - LABEL_W - (tsAt - minTs) * scale;
      redraw();
      _reparentOut(_pinchTargetEls);
    });
    return;
  }
  if (touchStartX === null) return;
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if (touchIsH === null && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
    touchIsH = Math.abs(dx) >= Math.abs(dy);
  }
  if (touchIsH) {
    e.preventDefault();
    touchLiveDx = dx;
    if (!touchRaf) touchRaf = requestAnimationFrame(() => {
      touchRaf = null;
      // Move touch target to anchor — keeps it in DOM through innerHTML=''
      if (_touchTargetEl && tlSvg.contains(_touchTargetEl)) _touchAnchor.appendChild(_touchTargetEl);
      panX = touchStartPan + touchLiveDx;
      redraw();
      // Return invisibly so iOS keeps delivering touchmove
      if (_touchTargetEl && _touchAnchor.contains(_touchTargetEl)) {
        _touchTargetEl.setAttribute('visibility', 'hidden');
        tlSvg.appendChild(_touchTargetEl);
      }
    });
  }
}, { passive: false });

function _commitTouch() {
  if (pinchActive) {
    if (pinchRaf) { cancelAnimationFrame(pinchRaf); pinchRaf = null; }
    _reparentIn(_pinchTargetEls);
    redraw();
    pinchActive = false; pinchStartDist = null; pinchStartScale = null;
    pinchLiveDist = null; pinchLiveMidX = null; _pinchTargetEls = [];
  }
  if (touchRaf) { cancelAnimationFrame(touchRaf); touchRaf = null; }
  if (touchIsH && touchStartX !== null) {
    panX = touchStartPan + touchLiveDx;
    // Move phantom element away before final redraw
    if (_touchTargetEl) _touchAnchor.appendChild(_touchTargetEl);
    redraw();
  }
  _touchTargetEl = null;
  touchStartX = null; touchStartY = null; touchStartPan = null;
  touchIsH = null; touchLiveDx = 0;
}
document.addEventListener('touchend',    _commitTouch);
document.addEventListener('touchcancel', _commitTouch);

