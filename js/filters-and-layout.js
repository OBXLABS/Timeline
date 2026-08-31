// ── Data parsing ─────────────────────────────────────────────────────────
function pDate(v) {
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let yr = +m[3];
  if (yr < 100) yr += yr < 50 ? 2000 : 1900;
  return new Date(yr, +m[1] - 1, +m[2]);
}

function fmtDate(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

const stripHtml  = s => s.replace(/<[^>]*>/g, '').trim();
const extractUrl = s => { const m = s.match(/href=["']([^"']+)["']/i); return m ? m[1] : ''; };

// Read a worksheet into row objects, deduplicating repeated column names (Group_2, etc.)
function sheetToRows(ws) {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!raw.length) return [];
  const seen = {}, deduped = [];
  for (const h of raw[0]) {
    const key = (h !== null && h !== undefined && h !== '') ? String(h) : null;
    if (!key) { deduped.push(null); continue; }
    seen[key] = (seen[key] || 0) + 1;
    deduped.push(seen[key] > 1 ? `${key}_${seen[key]}` : key);
  }
  return raw.slice(1).map(row => {
    const obj = {};
    deduped.forEach((h, i) => { if (h) obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// Detect data format by sniffing column headers of the first row.
// 'abtec' : has a Category column (main grouping) + Group (org) + Program dimensions
// 'cv'    : uses Group as the main grouping; no Category/Org/Program columns
function detectFormat(rows) {
  if (!rows.length) return 'abtec';
  const keys = Object.keys(rows[0]).map(k => k.trim().toLowerCase().replace(/[\s_]+/g, ''));
  return keys.includes('category') ? 'abtec' : 'cv';
}

function normalizeRow(row, format = 'abtec') {
  const n = {};
  for (const k of Object.keys(row))
    n[k.trim().toLowerCase().replace(/[\s_]+/g, '')] = row[k];
  const g = (...ks) => {
    for (const k of ks) if (n[k] !== undefined && n[k] !== '') return String(n[k]).trim();
    return '';
  };

  // Year/Month/Day parts format (e.g. Timeline-JS3 style)
  let startRaw, endRaw;
  if (n['year'] !== undefined) {
    const yr  = g('year');
    if (!yr) {
      startRaw = '';  // no year → row skipped in parse()
      endRaw   = '';
    } else {
      const mo  = g('month') || '1';
      const dy  = g('day')   || '1';
      startRaw  = `${mo}/${dy}/${yr}`;
      const eyr = g('endyear');
      if (eyr) {
        const emo = g('endmonth') || '1';
        const edy = g('endday')   || '1';
        endRaw = `${emo}/${edy}/${eyr}`;
      } else {
        endRaw = '';  // treated as single-day in parse()
      }
    }
  } else {
    startRaw = g('startdate', 'start');
    endRaw   = g('enddate', 'end');
  }

  const base = {
    startRaw,
    endRaw,
    headline:    stripHtml(g('title', 'headline', 'name', 'event')),
    headlineUrl:       extractUrl(g('headline', 'name', 'event')),
    headlineLinkLabel: g('headlinelinklabel'),
    description: g('text', 'description', 'desc', 'details', 'notes', 'body'),
    project:     g('project', 'proj'),
  };

  if (format === 'abtec') {
    return { ...base,
      group:   g('category', 'group', 'grp'), // Category col = main grouping
      org:     g('group'),                    // Group col = organisational group
      program: g('program', 'prog'),
      media:          g('media', 'url', 'video', 'image'),
      mediaThumbnail: g('mediathumbnail', 'thumbnail'),
      mediaCaption:   g('mediacaption', 'caption'),
      mediaCredit:    g('mediacredit', 'credit'),
      teamMembers:    g('teammembers', 'team', 'members'),
      funders:        g('funders', 'funder'),
    };
  } else {
    // CV format: Group col = category; org = institution; program = funding agency; project = funding role
    return { ...base,
      group:          g('group', 'grp', 'category'),
      org:            g('org', 'institution'),
      program:        g('program', 'prog'),
      fundingGroup:   g('fundinggroup', 'funding_group'),
      categoryGroup:  g('categorygroup', 'category_group'),
      media:          g('media', 'url', 'video', 'image'),
      mediaThumbnail: g('mediathumbnail', 'thumbnail'),
      mediaCaption:   g('mediacaption', 'caption'),
      mediaCredit:    g('mediacredit', 'credit'),
      teamMembers:    g('teammembers', 'team', 'members'),
      funders:        g('funders', 'funder'),
    };
  }
}

const FORMAT_TITLES = { abtec: 'AbTeC Timeline', cv: 'CV Timeline' };

function parse(rows) {
  VIEW_MODE = 'sections';
  accordionState.clear(); // reset on every data reload to avoid stale open/closed state from previous dataset
  _visEvsDirty  = true;  // new dataset — invalidate visEvs cache
  _tickCacheKey = '';    // new date range — invalidate tick cache
  const format = detectFormat(rows);
  const titleEl = document.getElementById('sidebar-title-text');
  const mobileTitleEl = document.getElementById('mobile-title');
  const t = FORMAT_TITLES[format] ?? 'Timeline';
  if (titleEl) titleEl.textContent = t;
  if (mobileTitleEl) mobileTitleEl.textContent = t;

  const parsed = rows.map((r, i) => {
    const nr    = normalizeRow(r, format);
    const start = pDate(nr.startRaw);
    if (!start) return null;
    let end = pDate(nr.endRaw) || start;
    if (end < start) end = start;
    return {
      id: i, start, end,
      startTs: start.getTime(), endTs: end.getTime(),
      headline:    nr.headline    || '(Untitled)',
      headlineUrl:       nr.headlineUrl       || '',
      headlineLinkLabel: nr.headlineLinkLabel || '',
      description: nr.description || '',
      group:       nr.group       || 'Ungrouped',
      org:         nr.org         || '',
      program:      nr.program      || '',
      fundingGroup:  nr.fundingGroup  || '',
      categoryGroup: nr.categoryGroup || '',
      project:      nr.project      || '',
      media:          nr.media          || '',
      mediaThumbnail: nr.mediaThumbnail || '',
      mediaCaption:   nr.mediaCaption   || '',
      mediaCredit:    nr.mediaCredit    || '',
      teamMembers:    nr.teamMembers    || '',
      funders:        nr.funders        || '',
      themes:        Array.isArray(r.themes)        ? r.themes        : [],
      concepts:      Array.isArray(r.concepts)      ? r.concepts      : [],
      collaborators: Array.isArray(r.collaborators) ? r.collaborators : [],
    };
  }).filter(Boolean);

  if (!parsed.length) {
    alert('No valid events found.\n\nSupported column formats:\n  • start date, end date, headline, description, project, group\n  • Year, Month, Day, End Year, End Month, End Day, headline, text, Group');
    return;
  }

  events = parsed;

  // Build group → Event[] index for O(1) group lookup in syncCategoryVis/syncDimVis
  eventsByGroup = new Map();
  for (const ev of events) {
    if (!eventsByGroup.has(ev.group)) eventsByGroup.set(ev.group, []);
    eventsByGroup.get(ev.group).push(ev);
  }

  const GROUP_ORDER = format === 'cv' ? [
    'Employment', 'Honors', 'Education',
    'Creative Works', 'Books/Chapters', 'Journal Articles',
    'Keynotes', 'Conference Presentations', 'Invited Publications', 'Invited Lectures',
    'Policy Papers', 'Op-Ed', "Artist's Books", 'Poetry',
    'Solo Exhibitions', 'Group Exhibitions',
    'Film Screenings', 'Commissions', 'Curatorial', 'Visiting Artist', 'Productions',
    'Residencies', 'Residency Organizer',
    'Documentaries', 'Websites',
    'Press Coverage', 'Academic Reviews', 'Symposia Organized',
    'Funding (PI)', 'Funding (Co-I)', 'Funding (Internal)',
    'Courses Taught',
    'Postdoc', 'PhD', 'Masters', 'Grad Certificate', 'Undergraduate',
    'Service',
  ] : [
    'Workshops',
    'Symposia and Partnership Meetings',
    'Residencies/Exhibitions',
    'Guest Lectures and Artist Talks',
    'Illustrating the Future Imaginary',
    'Archive',
    'Dissemination',
    'Press/Reviews',
  ];
  groups = [...new Set(events.map(e => e.group))].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a), bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  // Only show org/program/project filters when they are distinct from category
  const hasOrgDim = events.some(e => e.org && e.org !== e.group);
  orgs     = hasOrgDim ? [...new Set(events.map(e => e.org).filter(Boolean))].sort() : [];
  programs = [...new Set(events.map(e => e.program).filter(Boolean))].sort();
  projects = [...new Set(events.map(e => e.project).filter(Boolean))].sort();
  groups.forEach((g, i) => groupColor[g] = PALETTE[i % PALETTE.length]);
  // Build category sub-groups (CV only — e.g. Supervision parent)
  let catSubGroups = null;
  if (format === 'cv') {
    const CG_ORDER = ['Art', 'Dissemination', 'Supervision'];
    const byCatGroup = new Map();
    const ungroupedCats = [];
    for (const g of groups) {
      const cg = events.find(e => e.group === g)?.categoryGroup || '';
      if (cg) {
        if (!byCatGroup.has(cg)) byCatGroup.set(cg, []);
        byCatGroup.get(cg).push(g);
      } else {
        ungroupedCats.push(g);
      }
    }
    if (byCatGroup.size) {
      catSubGroups = CG_ORDER
        .filter(cg => byCatGroup.has(cg))
        .map(cg => ({ label: cg, items: byCatGroup.get(cg) }));
      if (ungroupedCats.length) catSubGroups.push({ label: 'Other', items: ungroupedCats });
    }
  }
  categoryGroups = [{ title: 'Category', items: groups, subGroups: catSubGroups }]; // seam for multi-document grouping
  dimLabels = format === 'cv'
    ? { orgs: 'Institution', programs: 'Funding Agency', projects: 'Role' }
    : { orgs: 'Group',       programs: 'Program',        projects: 'Project' };
  // Build program sub-groups for CV (Tri-council, Concordia, then ungrouped)
  if (format === 'cv') {
    const FG_ORDER = ['Tri-council', 'Concordia'];
    const byGroup  = new Map();
    const ungrouped = [];
    for (const prog of programs) {
      const fg = events.find(e => e.program === prog)?.fundingGroup || '';
      if (fg) {
        if (!byGroup.has(fg)) byGroup.set(fg, []);
        byGroup.get(fg).push(prog);
      } else {
        ungrouped.push(prog);
      }
    }
    programGroups = FG_ORDER
      .filter(fg => byGroup.has(fg))
      .map(fg => ({ label: fg, items: byGroup.get(fg) }));
    if (ungrouped.length) programGroups.push({ label: 'Other', items: ungrouped });
  } else {
    programGroups = [];
  }
  groupVis   = new Set(groups);
  orgVis     = new Set(orgs);
  programVis = new Set(programs);
  projVis    = new Set(projects);

  // ── Build theme data (enriched CV only) ──────────────────────────────
  hasEnrichedData = events.some(e => e.themes.length > 0);
  themeRows = []; themeColor = {}; themeVis = new Set();
  if (hasEnrichedData) {
    const freq = {};
    for (const ev of events) for (const t of ev.themes) freq[t] = (freq[t] || 0) + 1;
    themeRows = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    themeRows.forEach((t, i) => { themeColor[t] = PALETTE[i % PALETTE.length]; });
    themeVis = new Set(themeRows);
  }

  minTs    = Math.min(...events.map(e => e.startTs));
  maxTs    = Math.max(...events.map(e => e.endTs));
  const earliestYear = new Date(minTs).getFullYear();
  AXIS_START = new Date(earliestYear, 0, 1).getTime();

  // Minimum effective width for lane stacking: at least 8px wide at fit-all scale,
  // so point events that would visually overlap get assigned to separate lanes.
  const W0 = Math.max(wrap.clientWidth, 1200);
  const fitAllScale = (W0 - LABEL_W - 20) / Math.max(maxTs - minTs, 86400000);
  const minEffMs = Math.max(86400000, 8 / fitAllScale);

  computeLanes(minEffMs);
  if (hasEnrichedData) computeThemeLanes(minEffMs);
  buildFilters();
  fitAll();
}

// ── Filter UI ─────────────────────────────────────────────────────────────

// Recompute groupVis: a category is checked iff at least one of its events
// passes the current org/program/project filter.
function syncCategoryVis() {
  const noTagDims = orgs.length === 0 && programs.length === 0 && projects.length === 0;
  groupVis = new Set(groups.filter(g => {
    return (eventsByGroup.get(g) ?? []).some(e => {
      if (noTagDims) return true;
      const hasTag = e.org !== '' || e.program !== '' || e.project !== '';
      if (!hasTag) return true;
      return (e.org     !== '' && orgVis.has(e.org))         ||
             (e.program !== '' && programVis.has(e.program)) ||
             (e.project !== '' && projVis.has(e.project));
    });
  }));
}

// Ensure any org/program/project that has events in a checked category is also checked.
function syncDimVis() {
  for (const g of groupVis) {
    for (const e of (eventsByGroup.get(g) ?? [])) {
      if (e.org)     orgVis.add(e.org);
      if (e.program) programVis.add(e.program);
      if (e.project) projVis.add(e.project);
    }
  }
}

// ── Filter UI helpers ──────────────────────────────────────────────────────

// Creates checkbox labels for `items` and appends them to `container`.
// Shared by all filter layout renderers.
function makeFilterItems(container, items, vis, colorFn, isDim, syncDims) {
  for (const item of items) {
    const lbl = document.createElement('label');
    lbl.className = 'filter-label';
    const cb  = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = vis.has(item);
    cb.addEventListener('change', () => {
      if (cb.checked) vis.add(item); else vis.delete(item);
      if (isDim) { syncCategoryVis(); buildFilters(); }
      else if (syncDims && cb.checked) { syncDimVis(); buildFilters(); }
      redraw();
    });
    const dot = document.createElement('span');
    dot.className = 'filter-dot';
    dot.style.background = colorFn(item);
    const txt = document.createElement('span');
    txt.textContent = item;
    lbl.append(cb, dot, txt);
    container.appendChild(lbl);
  }
}

// Returns a .filter-all-none div with All + None buttons for a filter section.
function makeAllNoneButtons(items, vis, isDim, syncDims) {
  const wrap = document.createElement('div');
  wrap.className = 'filter-all-none';
  const btnAll = document.createElement('button');
  btnAll.textContent = 'All';
  btnAll.addEventListener('click', e => {
    e.stopPropagation();
    items.forEach(i => vis.add(i));
    if (isDim)    syncCategoryVis();
    if (syncDims) syncDimVis();
    buildFilters(); redraw();
  });
  const btnNone = document.createElement('button');
  btnNone.textContent = 'None';
  btnNone.addEventListener('click', e => {
    e.stopPropagation();
    items.forEach(i => vis.delete(i));
    if (isDim) syncCategoryVis();
    buildFilters(); redraw();
  });
  wrap.append(btnAll, btnNone);
  return wrap;
}

// ── Layout renderers ───────────────────────────────────────────────────────

function buildFiltersAccordion() {
  const panelTitle = document.createElement('div');
  panelTitle.className = 'filter-panel-title';
  panelTitle.textContent = 'Filters';
  panelTitle.appendChild(cntEl);
  filDiv.appendChild(panelTitle);

  // Creates one collapsible accordion section and appends it to filDiv.
  const addSection = (title, items, vis, colorFn, isDim, syncDims, subGroups = null) => {
    if (!accordionState.has(title)) accordionState.set(title, true);
    const isOpen = accordionState.get(title);

    const sec = document.createElement('div');
    sec.className = 'accordion-section';

    const hdr = document.createElement('div');
    hdr.className = 'accordion-header';
    const arrow = document.createElement('span');
    arrow.className = 'accordion-arrow' + (isOpen ? ' open' : '');
    arrow.textContent = '▶';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    const allNone = makeAllNoneButtons(items, vis, isDim, syncDims);
    hdr.append(arrow, titleSpan, allNone);

    const body = document.createElement('div');
    body.className = 'accordion-body' + (isOpen ? '' : ' collapsed');
    if (subGroups && subGroups.length) {
      for (const sg of subGroups) {
        if (sg.label) {
          const sgKey = title + '/' + sg.label;
          if (!accordionState.has(sgKey)) accordionState.set(sgKey, true);
          const sgOpen = accordionState.get(sgKey);

          const sgSec = document.createElement('div');
          sgSec.className = 'accordion-subgroup';

          const sgHdr = document.createElement('div');
          sgHdr.className = 'accordion-subgroup-header';
          const sgArrow = document.createElement('span');
          sgArrow.className = 'accordion-arrow' + (sgOpen ? ' open' : '');
          sgArrow.textContent = '▶';
          const sgTitle = document.createElement('span');
          sgTitle.textContent = sg.label;
          sgHdr.append(sgArrow, sgTitle);

          const sgBody = document.createElement('div');
          sgBody.className = 'accordion-body' + (sgOpen ? '' : ' collapsed');
          makeFilterItems(sgBody, sg.items, vis, colorFn, isDim, syncDims);

          sgHdr.addEventListener('click', () => {
            const open = !accordionState.get(sgKey);
            accordionState.set(sgKey, open);
            sgArrow.classList.toggle('open', open);
            sgBody.classList.toggle('collapsed', !open);
          });

          sgSec.append(sgHdr, sgBody);
          body.appendChild(sgSec);
        } else {
          makeFilterItems(body, sg.items, vis, colorFn, isDim, syncDims);
        }
      }
    } else {
      makeFilterItems(body, items, vis, colorFn, isDim, syncDims);
    }

    hdr.addEventListener('click', e => {
      if (e.target.closest('.filter-all-none')) return;
      const open = !accordionState.get(title);
      accordionState.set(title, open);
      arrow.classList.toggle('open', open);
      body.classList.toggle('collapsed', !open);
    });

    sec.append(hdr, body);
    filDiv.appendChild(sec);
  };

  if (orgs.length)     addSection(dimLabels.orgs,     orgs,     orgVis,     () => COLORS.textMuted, true,  false);
  if (programs.length) addSection(dimLabels.programs, programs, programVis, () => COLORS.textMuted, true,  false, programGroups.length ? programGroups : null);
  if (projects.length) addSection(dimLabels.projects, projects, projVis,    () => COLORS.textMuted, true,  false);
  for (const grp of categoryGroups) {
    addSection(grp.title, grp.items, groupVis, g => groupColor[g], false, true, grp.subGroups || null);
  }
}

// PLANNED: alternative filter layouts (chips-bar, doc-toggles, tabs) — implement here when needed

function buildFiltersThemes() {
  const panelTitle = document.createElement('div');
  panelTitle.className = 'filter-panel-title';
  panelTitle.textContent = 'Themes';
  panelTitle.appendChild(cntEl);
  filDiv.appendChild(panelTitle);

  const allNone = makeAllNoneButtons(themeRows, themeVis, false, false);
  filDiv.appendChild(allNone);

  const body = document.createElement('div');
  makeFilterItems(body, themeRows, themeVis, t => themeColor[t], false, false);
  filDiv.appendChild(body);
}

function buildFilters() {
  _visEvsDirty = true; // filter state changed — invalidate visEvs cache
  filDiv.innerHTML = '';

  // View mode toggle (only when enriched data is loaded)
  if (hasEnrichedData) {
    const tog = document.createElement('div');
    tog.className = 'view-mode-toggle';
    ['sections', 'themes'].forEach(mode => {
      const btn = document.createElement('button');
      btn.className = 'view-mode-btn' + (VIEW_MODE === mode ? ' active' : '');
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.addEventListener('click', () => {
        if (VIEW_MODE === mode) return;
        VIEW_MODE = mode;
        buildFilters(); redraw();
      });
      tog.appendChild(btn);
    });
    filDiv.appendChild(tog);
  }

  if (VIEW_MODE === 'themes' && hasEnrichedData) buildFiltersThemes();
  else                                           buildFiltersAccordion();
}

