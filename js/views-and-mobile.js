// ── Mobile sidebar ────────────────────────────────────────────────────────
const sidebarEl      = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

function openMobileSidebar() {
  sidebarEl.classList.add('mobile-open');
  sidebarOverlay.classList.add('visible');
}
function closeMobileSidebar() {
  sidebarEl.classList.remove('mobile-open');
  sidebarOverlay.classList.remove('visible');
}
document.getElementById('btn-sidebar-toggle').addEventListener('click', () => {
  sidebarEl.classList.contains('mobile-open') ? closeMobileSidebar() : openMobileSidebar();
});

// ── Filter section (Import/Export) collapse toggle ─────────────────────
const sfToggle = document.getElementById('sf-toggle');
const sfBody   = document.getElementById('sf-body');
const sfArrow  = document.getElementById('sf-arrow');
// Collapse by default on mobile
if (window.matchMedia('(hover: none), (max-width: 1024px)').matches) {
  sfBody.classList.add('collapsed');
  sfArrow.classList.remove('open');
}
sfToggle.addEventListener('click', () => {
  const collapsed = sfBody.classList.toggle('collapsed');
  sfArrow.classList.toggle('open', !collapsed);
});
sidebarOverlay.addEventListener('click', closeMobileSidebar);

// ── Saved View ────────────────────────────────────────────────────────────
function captureView(name) {
  const centreTs = xToTs(LABEL_W + (wrap.clientWidth - LABEL_W) / 2);
  return {
    type:       'abtec-timeline-view',
    version:    1,
    name:       name.trim() || 'Untitled',
    savedAt:    Date.now(),
    scale,
    centreTs,
    scrollTop:  wrap.scrollTop,
    groupVis:   [...groupVis],
    orgVis:     [...orgVis],
    programVis: [...programVis],
    projVis:    [...projVis],
  };
}

function applyView(v) {
  if (!events.length) { alert('Load data before applying a view.'); return; }
  scale      = v.scale;
  panX       = (wrap.clientWidth / 2) - LABEL_W - (v.centreTs - minTs) * scale;
  groupVis   = new Set((v.groupVis   || []).filter(x => groups.includes(x)));
  orgVis     = new Set((v.orgVis     || []).filter(x => orgs.includes(x)));
  programVis = new Set((v.programVis || []).filter(x => programs.includes(x)));
  projVis    = new Set((v.projVis    || []).filter(x => projects.includes(x)));
  buildFilters();
  redraw();
  wrap.scrollTop = v.scrollTop;
}

// ── View directory handle (persisted in IndexedDB) ────────────────────────
const VIEW_DB_NAME    = 'abtec-timeline';
const VIEW_STORE_NAME = 'handles';
const VIEW_DIR_KEY    = 'viewDir';

function openViewDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIEW_DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(VIEW_STORE_NAME);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function getViewDirHandle() {
  try {
    const db  = await openViewDB();
    const tx  = db.transaction(VIEW_STORE_NAME, 'readonly');
    const req = tx.objectStore(VIEW_STORE_NAME).get(VIEW_DIR_KEY);
    return await new Promise(res => { req.onsuccess = () => res(req.result); req.onerror = () => res(null); });
  } catch { return null; }
}

async function setViewDirHandle(handle) {
  try {
    const db = await openViewDB();
    const tx = db.transaction(VIEW_STORE_NAME, 'readwrite');
    tx.objectStore(VIEW_STORE_NAME).put(handle, VIEW_DIR_KEY);
  } catch { /* non-fatal */ }
}

// ── Save / Load with File System Access API (fallback for Firefox/Safari) ─
document.getElementById('btn-save-view').addEventListener('click', async () => {
  const nameInput = document.getElementById('view-name-input');
  const v         = captureView(nameInput.value);
  const safeName  = v.name.replace(/[/\\:*?"<>|]/g, '-');
  const json      = JSON.stringify(v, null, 2);

  if (window.showSaveFilePicker) {
    try {
      const dirHandle = await getViewDirHandle();
      const fh = await window.showSaveFilePicker({
        suggestedName: `${safeName}.view.json`,
        startIn:       dirHandle ?? 'documents',
        types: [{ description: 'Timeline View', accept: { 'application/json': ['.view.json'] } }],
      });
      // Note: FileSystemFileHandle.getParent() is unshipped in browsers; directory stays as-is after save.
      const writable = await fh.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e) { if (e.name !== 'AbortError') alert('Save failed: ' + e.message); }
  } else {
    // Fallback: silent download
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${safeName}.view.json` });
    a.click();
    URL.revokeObjectURL(url);
  }
});

document.getElementById('btn-load-view').addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const dirHandle = await getViewDirHandle();
      const [fh] = await window.showOpenFilePicker({
        startIn: dirHandle ?? 'documents',
        types: [{ description: 'Timeline View', accept: { 'application/json': ['.view.json'] } }],
        multiple: false,
      });
      // Note: FileSystemFileHandle.getParent() is unshipped in browsers; directory stays as-is after load.
      const file = await fh.getFile();
      try   { applyView(JSON.parse(await file.text())); }
      catch { alert('Invalid view file.'); }
    } catch (e) { if (e.name !== 'AbortError') alert('Load failed: ' + e.message); }
  } else {
    // Fallback: input picker
    const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.view.json,.view' });
    picker.addEventListener('change', () => {
      const file = picker.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { try { applyView(JSON.parse(e.target.result)); } catch { alert('Invalid view file.'); } };
      reader.readAsText(file);
    });
    picker.click();
  }
});

document.getElementById('view-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save-view').click();
});

const svsToggle = document.getElementById('svs-toggle');
const svsBody   = document.getElementById('svs-body');
const svsArrow  = document.getElementById('svs-arrow');
if (window.matchMedia('(hover: none), (max-width: 1024px)').matches) {
  svsBody.classList.add('collapsed');
  svsArrow.classList.remove('open');
}
svsToggle.addEventListener('click', () => {
  const collapsed = svsBody.classList.toggle('collapsed');
  svsArrow.classList.toggle('open', !collapsed);
});

// Mobile toolbar: call the same named functions as the sidebar controls
document.getElementById('mob-zoomin') .addEventListener('click', doZoomIn);
document.getElementById('mob-zoomout').addEventListener('click', doZoomOut);
document.getElementById('mob-fit')    .addEventListener('click', fitAll);
document.getElementById('mob-today')  .addEventListener('click', doToday);

