// ── Google Sheets loader ──────────────────────────────────────────────────
const GSHEET_PROXY  = 'https://api.allorigins.win/raw?url='; // CORS proxy — no default response caching (unlike corsproxy.io, which caches at the edge by default)

// The single data source for the timeline. Visitors cannot change it.
// To point the site at a different sheet (or a published Google Doc CV), edit this URL.
const DATA_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTSm4iN6wJTrWnm0DGzig23MmxbfdL7-n6f81RJv8Z3WYvvDXYPsdnK_WuKyRH0HN1mTo4wiJubJ-5-/pubhtml';

// ── Load status (sidebar "Data" line + empty-state message) ───────────────
const loadStatusEl = document.getElementById('load-status');
const emptyMsgEl   = document.getElementById('empty-msg');
function setLoadStatus(state, text) {
  const color = state === 'ok' ? COLORS.success : state === 'error' ? COLORS.error : COLORS.slate;
  loadStatusEl.textContent = text;
  loadStatusEl.style.color = color;
  if (state !== 'ok') emptyMsgEl.textContent = text;
}

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
  if (!csvUrl) { setLoadStatus('error', 'Data source URL is invalid'); return; }

  setLoadStatus('loading', 'Loading timeline…');

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
      setLoadStatus('error', 'Couldn\'t load timeline (' + ex.message + '). Please refresh.');
      return;
    }
  }

  try {
    const wb   = XLSX.read(csvText, { type: 'string' });
    const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
    parse(rows);
    setLoadStatus('ok', `✓ Loaded ${events.length} events`);
  } catch (ex) {
    setLoadStatus('error', 'Couldn\'t read timeline data: ' + ex.message);
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
        const row = { 'start date': start, 'end date': end || start,
          'headline': restClean, 'link': entryLink.url || '', 'headline link label': entryLink.url ? entryLink.label : '',
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
      const row = { 'start date': d, 'end date': d,
        'headline': titleText, 'link': entryLink.url || '', 'headline link label': entryLink.url ? entryLink.label : '',
        'description': cleanFull, 'group': group, 'project': GDOC_PROJECT_MAP[group] || '' };
      rows.push(row); lastRow = row;
    }
  }
  return rows;
}

async function loadFromGDoc(url) {
  setLoadStatus('loading', 'Loading timeline…');

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
      setLoadStatus('error', 'Couldn\'t load timeline (' + ex.message + '). Please refresh.');
      return;
    }
  }

  try {
    const rows = parseGDoc(html);
    if (!rows.length) throw new Error('No CV sections found — is the doc published to the web?');
    parse(rows);
    setLoadStatus('ok', `✓ Loaded ${events.length} events`);
  } catch (ex) {
    setLoadStatus('error', 'Couldn\'t read timeline data: ' + ex.message);
  }
}


