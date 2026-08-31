// ── File loading ─────────────────────────────────────────────────────────
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
});
dz.addEventListener('click', () => fi.click());
fi.addEventListener('change', e => { if (e.target.files[0]) load(e.target.files[0]); });

// ── Plain-text CV parser (for cv.txt drop) ───────────────────────────────
// Same 3-strategy logic as parseGDoc() but splits on tabs / 2+ spaces
// instead of \xa0\xa0+, and works line-by-line on plain text.
function parseCVText(text) {
  const rows = [];
  let group = null, lastRow = null;

  for (const rawLine of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.length < 2) continue;

    // Section heading?
    const key = line.toLowerCase().replace(/[\s\xa0]+/g, ' ').trim().replace(/:$/, '');
    if (GDOC_SECTION_MAP[key]) { group = GDOC_SECTION_MAP[key]; lastRow = null; continue; }

    if (!group) continue;

    // Strategy 1: date prefix + tab or 2+ spaces
    const sep = rawLine.match(/^(.+?)(?:\t+|\s{2,})(.+)$/);
    if (sep) {
      const cleanDate = sep[1].trim();
      const rest      = sep[2].trim().replace(/\s*\{[^}]*\}\s*$/, '').trim();
      const [start, end] = gdocParseDateRange(cleanDate);
      if (start) {
        const row = { 'start date': start, 'end date': end || start,
          'headline': rest, 'description': '', 'group': group, 'project': GDOC_PROJECT_MAP[group] || '' };
        rows.push(row); lastRow = row;
        continue;
      }
    }

    // Strategy 2: continuation line
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    if (lastRow && lastRow['group'] === group && !hasYear && line.length < 150) {
      lastRow['description'] = lastRow['description'] ? lastRow['description'] + '  ' + line : line;
      continue;
    }

    // Strategy 3: bibliography — extract year from text
    const years = [...line.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m => parseInt(m[1]));
    if (years.length) {
      const year = years[years.length - 1];
      const d = gdocFmt(year);
      const row = { 'start date': d, 'end date': d,
        'headline': gdocExtractTitle(line), 'description': line, 'group': group, 'project': GDOC_PROJECT_MAP[group] || '' };
      rows.push(row); lastRow = row;
    }
  }
  return rows;
}

function load(file) {
  if (file.name.toLowerCase().endsWith('.txt')) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const rows = parseCVText(e.target.result);
        if (!rows.length) throw new Error('No CV sections recognised — check headings match expected format.');
        parse(rows);
      } catch (ex) { alert('Could not read file:\n' + ex.message); }
    };
    r.readAsText(file, 'utf-8');
    return;
  }
  if (file.name.toLowerCase().endsWith('.js')) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const text  = e.target.result;
        const match = text.match(/window\.__TIMELINE_DATA__\s*=\s*(\[[\s\S]*?\]);\s*$/m);
        if (!match) throw new Error('File does not contain window.__TIMELINE_DATA__ — is this a timeline data JS file?');
        const rows = JSON.parse(match[1]);
        parse(rows);
      } catch (ex) { alert('Could not read file:\n' + ex.message); }
    };
    r.readAsText(file, 'utf-8');
    return;
  }
  if (file.name.toLowerCase().endsWith('.csv')) {
    const r = new FileReader();
    r.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'string' });
        const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
        parse(rows);
      } catch (ex) { alert('Could not read file:\n' + ex.message); }
    };
    r.readAsText(file, 'utf-8');
    return;
  }
  const r = new FileReader();
  r.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary' });
      const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
      parse(rows);
    } catch (ex) { alert('Could not read file:\n' + ex.message); }
  };
  r.readAsBinaryString(file);
}

// ── Google Sheets loader ──────────────────────────────────────────────────
const GSHEET_LS_KEY = 'timeline-gsheet-url';
const GSHEET_PROXY  = 'https://api.allorigins.win/raw?url='; // CORS proxy — no default response caching (unlike corsproxy.io, which caches at the edge by default)

// Default sheet shown on first load (until the user loads a different one,
// at which point their choice is remembered in localStorage instead).
const DEFAULT_GSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTSm4iN6wJTrWnm0DGzig23MmxbfdL7-n6f81RJv8Z3WYvvDXYPsdnK_WuKyRH0HN1mTo4wiJubJ-5-/pubhtml';

const gsheetInput  = document.getElementById('gsheet-input');
const gsheetStatus = document.getElementById('gsheet-status');

// Pre-fill from localStorage if the user has loaded a sheet before,
// otherwise fall back to the default sheet (but don't fetch yet).
const savedGSheetUrl = localStorage.getItem(GSHEET_LS_KEY);
gsheetInput.value = savedGSheetUrl || DEFAULT_GSHEET_URL;

function parseGSheetUrl(url) {
  url = url.trim();
  // Published "pub" or "pubhtml" format: /d/e/{key}/pub...
  let m = url.match(/\/spreadsheets\/d\/e\/([^\/]+)\//);
  if (m) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv`;
  // Standard format: /d/{key}/
  m = url.match(/\/spreadsheets\/d\/([^\/]+)\//);
  if (m) {
    const gid = (url.match(/[?&]gid=(\d+)/) || [])[1];
    return `https://docs.google.com/spreadsheets/d/${m[1]}/pub?output=csv${gid ? `&single=true&gid=${gid}` : ''}`;
  }
  return null;
}

async function loadFromGSheet(url) {
  const csvUrl = parseGSheetUrl(url);
  if (!csvUrl) { gsheetStatus.textContent = 'Invalid URL'; gsheetStatus.style.color = COLORS.error; return; }

  gsheetStatus.textContent = 'Loading…';
  gsheetStatus.style.color = COLORS.textMuted;

  const bust = `&t=${Date.now()}`;
  const tryFetch = async u => {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };

  let csvText;
  try {
    csvText = await tryFetch(csvUrl + bust);
  } catch {
    try {
      csvText = await tryFetch(GSHEET_PROXY + encodeURIComponent(csvUrl + bust));
    } catch (ex) {
      gsheetStatus.textContent = 'Failed: ' + ex.message;
      gsheetStatus.style.color = COLORS.error;
      return;
    }
  }

  try {
    const wb   = XLSX.read(csvText, { type: 'string' });
    const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
    parse(rows);
    localStorage.setItem(GSHEET_LS_KEY, url);
    gsheetStatus.textContent = '✓ Loaded';
    gsheetStatus.style.color = COLORS.success;
  } catch (ex) {
    gsheetStatus.textContent = 'Parse error: ' + ex.message;
    gsheetStatus.style.color = COLORS.error;
  }
}

function isGDocUrl(url) {
  return url.includes('/document/d/');
}

// ── Google Doc CV parser ──────────────────────────────────────────────────

const GDOC_SECTION_MAP = {
  'employment history':        'Employment',
  'education':                 'Education',
  'honors and awards':         'Honors',
  'books':                     'Books',
  'book chapters':             'Book Chapters',
  'journal articles & conference proceedings (refereed)': 'Journal Articles',
  'journal articles & conference proceedings':            'Journal Articles',
  'journal articles and conference proceedings':          'Journal Articles',
  'conference / symposia presentations (refereed)':       'Conference Presentations',
  'conference / symposia presentations':                  'Conference Presentations',
  'keynote, plenary, and special guest speaker':          'Keynotes',
  'invited publications':      'Invited Publications',
  'invited lectures / artist talks / panels': 'Invited Lectures',
  "artist's books and exhibition publications": "Artist's Books",
  'symposium, workshop, and lecture series organizer or lead': 'Symposia Organized',
  'promotion review / peer reviewer / jury member / expert assessor': 'Service',
  'documentaries':             'Documentaries',
  'websites':                  'Websites',
  'residencies':               'Residencies',
  'residency organizer':       'Residency Organizer',
  'academic review & textbook inclusion': 'Academic Reviews',
  'op-ed':                     'Op-Ed',
  'press coverage / interviews / documentaries': 'Press Coverage',
  'policy papers, governmental presentations, reviews & consultations': 'Policy & Reports',
  'exhibitions - solo':        'Solo Exhibitions',
  'exhibitions - group':       'Group Exhibitions',
  'film screenings':           'Film Screenings',
  'commissions':               'Commissions',
  'poetry publication & performances': 'Poetry',
  'curatorial':                'Curatorial',
  'visiting artist & master classes':  'Visiting Artist',
  'producer / executive producer':     'Productions',
  'major works':               'Creative Works',
};

const GDOC_PROJECT_MAP = {
  'Employment':               'Concordia',
  'Education':                'Early Career',
  'Honors':                   'Recognition',
  'Books':                    'Research',
  'Book Chapters':            'Research',
  'Journal Articles':         'Research',
  'Conference Presentations': 'Research',
  'Keynotes':                 'IIF',
  'Invited Publications':     'Research',
  'Invited Lectures':         'Research',
  "Artist's Books":           'Creative',
  'Symposia Organized':       'Research',
  'Service':                  'Research',
  'Documentaries':            'AbTeC',
  'Websites':                 'Creative',
  'Residencies':              'Research',
  'Residency Organizer':      'Research',
  'Academic Reviews':         'Research',
  'Op-Ed':                    'Research',
  'Press Coverage':           'Research',
  'Policy & Reports':         'Research',
  'Solo Exhibitions':         'Creative',
  'Group Exhibitions':        'Creative',
  'Film Screenings':          'AbTeC',
  'Commissions':              'Creative',
  'Poetry':                   'Creative',
  'Curatorial':               'Creative',
  'Visiting Artist':          'Research',
  'Productions':              'AbTeC',
  'Creative Works':           'Creative',
};

const GDOC_MONTHS = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

function gdocFmt(y, m = 1, d = 1) {
  return `${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}/${String(y).padStart(4,'0')}`;
}

function gdocYy4(yy) { return yy <= 29 ? 2000 + yy : 1900 + yy; }

function gdocParseDateRange(s) {
  s = s.trim().replace(/[\u2013\u2014]/g, '-').replace(/\s*-\s*/g, '-');
  const today = new Date();
  const todayStr = gdocFmt(today.getFullYear(), today.getMonth() + 1, today.getDate());
  let m;

  // M.YY-present — must come before letter check
  m = s.match(/^(\d{1,2})\.(\d{2,4})-present$/i);
  if (m) {
    const yr = parseInt(m[2]);
    return [gdocFmt(yr > 100 ? yr : gdocYy4(yr), parseInt(m[1])), todayStr];
  }

  if (/[A-Za-z]/.test(s)) {
    if (s.toLowerCase() === 'present') return [todayStr, todayStr];
    // "Month. D-D, YYYY"
    m = s.match(/^([A-Za-z]+)\.?\s+\d{1,2}-\d{1,2},?\s*(\d{4})$/);
    if (m) { const mon = GDOC_MONTHS[m[1].toLowerCase().slice(0,3)]; if (mon) { const d = gdocFmt(parseInt(m[2]),mon,1); return [d,d]; } }
    // "D Month, YYYY"
    m = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s*(\d{4})$/);
    if (m) { const mon = GDOC_MONTHS[m[2].toLowerCase().slice(0,3)]; if (mon) { const d = gdocFmt(parseInt(m[3]),mon,parseInt(m[1])); return [d,d]; } }
    // "Month. D, YYYY"
    m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})$/);
    if (m) { const mon = GDOC_MONTHS[m[1].toLowerCase().slice(0,3)]; if (mon) { const d = gdocFmt(parseInt(m[3]),mon,parseInt(m[2])); return [d,d]; } }
    // "Month YYYY"
    m = s.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
    if (m) { const mon = GDOC_MONTHS[m[1].toLowerCase().slice(0,3)]; if (mon) { const d = gdocFmt(parseInt(m[2]),mon,1); return [d,d]; } }
    return [null, null];
  }

  // M.YY-M.YY or M.YY-present (numeric)
  m = s.match(/^(\d{1,2})\.(\d{2,4})-(present|\d{1,2}\.\d{2,4})$/i);
  if (m) {
    const yr = parseInt(m[2]), startY = yr > 100 ? yr : gdocYy4(yr);
    const start = gdocFmt(startY, parseInt(m[1]));
    const ep = m[3];
    if (ep.toLowerCase() === 'present') return [start, todayStr];
    const em = ep.match(/^(\d{1,2})\.(\d{2,4})$/);
    if (em) { const ey = parseInt(em[2]); return [start, gdocFmt(ey > 100 ? ey : gdocYy4(ey), parseInt(em[1]))]; }
    return [start, start];
  }
  // M.YY or M.YYYY
  m = s.match(/^(\d{1,2})\.(\d{2,4})$/);
  if (m) { const yr = parseInt(m[2]); const d = gdocFmt(yr > 100 ? yr : gdocYy4(yr), parseInt(m[1])); return [d,d]; }
  // YYYY-YY
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) { const sy = parseInt(m[1]), ey = Math.floor(sy/100)*100 + parseInt(m[2]); return [gdocFmt(sy), gdocFmt(ey,6,30)]; }
  // YYYY-YYYY
  m = s.match(/^(\d{4})-(\d{4})$/);
  if (m) return [gdocFmt(parseInt(m[1])), gdocFmt(parseInt(m[2]))];
  // YYYY
  m = s.match(/^(\d{4})$/);
  if (m) { const d = gdocFmt(parseInt(m[1])); return [d,d]; }

  return [null, null];
}

function gdocSplitNbsp(text) {
  const m = text.match(/^(.+?)[\xa0]{2,}([\s\S]*)/);
  return m ? [m[1].trim(), m[2].trim()] : [null, text];
}

function gdocExtractTitle(text) {
  const m = text.match(/["\u201c]([^"\u201d]{4,})["\u201d]/);
  if (m) return m[1].trim();
  const parts = text.split(/(?<=[a-z)])[.;]/);
  return (parts[0] || text).trim().slice(0, 200);
}

function gdocExtractLink(tag) {
  const unwrap = a => {
    let href = a.getAttribute('href') || '';
    const qm = href.match(/[?&]q=([^&]+)/);
    return qm ? decodeURIComponent(qm[1]) : href;
  };
  // Look for a {text} link: an <a> whose text content is exactly "text" (or
  // "{text}" if the whole thing was hyperlinked). Google Docs places { and }
  // as plain text around it, but may insert empty spans between them and the
  // <a>, so sibling checks are unreliable — link text is the safe signal.
  for (const a of tag.querySelectorAll('a[href]')) {
    if (/^text$|^\{text\}$/i.test((a.textContent || '').trim()))
      return { url: unwrap(a), label: 'Text' };
  }
  // Fall back to first link
  const a = tag.querySelector('a[href]');
  return a ? { url: unwrap(a), label: 'More Info' } : { url: '', label: 'More Info' };
}

function parseGDoc(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];
  let group = null, lastRow = null;

  for (const tag of doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li')) {
    const rawTag = tag.textContent || '';
    const text = rawTag.trim();
    if (!text || text.length < 2) continue;

    if (/^H[1-6]$/.test(tag.tagName)) {
      const key = text.toLowerCase().replace(/[\s\xa0]+/g, ' ').trim().replace(/:$/, '');
      if (GDOC_SECTION_MAP[key]) { group = GDOC_SECTION_MAP[key]; lastRow = null; }
      continue;
    }

    if (!group) continue;

    const entryLink = gdocExtractLink(tag);

    // Strategy 1: date prefix + \xa0\xa0+ separator
    const [dateCandidate, rest] = gdocSplitNbsp(rawTag);
    if (dateCandidate) {
      const cleanDate = dateCandidate.replace(/\xa0/g, '').trim();
      const [start, end] = gdocParseDateRange(cleanDate);
      if (start) {
        const restClean = rest.replace(/\xa0/g, ' ').replace(/\s*\{[^}]*\}\s*$/, '').trim();
        const headlineVal = entryLink.url ? `<a href="${entryLink.url}">${restClean}</a>` : restClean;
        const row = { 'start date': start, 'end date': end || start,
          'headline': headlineVal, 'headline link label': entryLink.url ? entryLink.label : '',
          'description': '', 'group': group, 'project': GDOC_PROJECT_MAP[group] || '' };
        rows.push(row); lastRow = row;
        continue;
      }
    }

    // Strategy 2: continuation line
    const clean = text.replace(/[\xa0\s]+/g, ' ').trim();
    const hasYear = /\b(19|20)\d{2}\b/.test(clean);
    if (lastRow && lastRow['group'] === group && !hasYear && clean.length < 150) {
      const addition = clean.replace(/\s*\{[^}]*\}\s*/g, ' ').trim();
      if (addition) lastRow['description'] = lastRow['description'] ? lastRow['description'] + '  ' + addition : addition;
      continue;
    }

    // Strategy 3: bibliography — extract year from text
    const cleanFull = text.replace(/[\xa0]+/g, ' ').replace(/\s*\{[^}]*\}\s*/g, ' ').trim();
    const years = [...cleanFull.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m => parseInt(m[1]));
    if (years.length) {
      const year = years[years.length - 1];
      const d = gdocFmt(year);
      const titleText = gdocExtractTitle(cleanFull);
      const headlineVal = entryLink.url ? `<a href="${entryLink.url}">${titleText}</a>` : titleText;
      const row = { 'start date': d, 'end date': d,
        'headline': headlineVal, 'headline link label': entryLink.url ? entryLink.label : '',
        'description': cleanFull, 'group': group, 'project': GDOC_PROJECT_MAP[group] || '' };
      rows.push(row); lastRow = row;
    }
  }
  return rows;
}

async function loadFromGDoc(url) {
  gsheetStatus.textContent = 'Loading…';
  gsheetStatus.style.color = COLORS.textMuted;

  // Ensure URL ends with /pub
  let pubUrl = url.trim();
  if (!pubUrl.match(/\/pub(\?|$)/)) {
    pubUrl = pubUrl.replace(/\/document\/d\/([^\/]+).*$/, '/document/d/$1/pub');
  }

  const bust = `&t=${Date.now()}`;
  const tryFetch = async u => {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };

  let html;
  try {
    html = await tryFetch(pubUrl + (pubUrl.includes('?') ? bust : `?${bust.slice(1)}`));
  } catch {
    try {
      html = await tryFetch(GSHEET_PROXY + encodeURIComponent(pubUrl + (pubUrl.includes('?') ? bust : `?${bust.slice(1)}`)));
    } catch (ex) {
      gsheetStatus.textContent = 'Failed: ' + ex.message;
      gsheetStatus.style.color = COLORS.error;
      return;
    }
  }

  try {
    const rows = parseGDoc(html);
    if (!rows.length) throw new Error('No CV sections found — is the doc published to the web?');
    parse(rows);
    localStorage.setItem(GSHEET_LS_KEY, url);
    gsheetStatus.textContent = `✓ Loaded ${rows.length} entries`;
    gsheetStatus.style.color = COLORS.success;
  } catch (ex) {
    gsheetStatus.textContent = 'Parse error: ' + ex.message;
    gsheetStatus.style.color = COLORS.error;
  }
}

document.getElementById('btn-gsheet-load').addEventListener('click', () => {
  const url = gsheetInput.value.trim();
  if (!url) return;
  if (isGDocUrl(url)) loadFromGDoc(url); else loadFromGSheet(url);
});

gsheetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const url = gsheetInput.value.trim();
    if (!url) return;
    if (isGDocUrl(url)) loadFromGDoc(url); else loadFromGSheet(url);
  }
});

