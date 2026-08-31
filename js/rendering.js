// ── Lane stacking ─────────────────────────────────────────────────────────
function computeLanes(minEffMs = 86400000) {
  laneCounts = {};
  rowHeights = {};
  for (const g of groups) {
    const gEvs = events.filter(e => e.group === g).sort((a, b) => a.startTs - b.startTs);
    const laneEnds = []; // effective end ts of last event placed in each lane
    for (const ev of gEvs) {
      const effEnd = Math.max(ev.endTs, ev.startTs + minEffMs);
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (ev.startTs >= laneEnds[i]) {
          ev.lane = i;
          laneEnds[i] = effEnd;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev.lane = laneEnds.length;
        laneEnds.push(effEnd);
      }
    }
    laneCounts[g] = Math.max(1, laneEnds.length);
    rowHeights[g] = Math.max(ROW_H, laneCounts[g] * LANE_H + LANE_PAD * 2);
  }
}

function computeThemeLanes(minEffMs = 86400000) {
  themeLaneCounts = {}; themeRowH = {}; themeLanes = {};
  for (const theme of themeRows) {
    const tEvs = events.filter(e => e.themes.includes(theme))
                       .sort((a, b) => a.startTs - b.startTs);
    const laneEnds = [];
    themeLanes[theme] = {};
    for (const ev of tEvs) {
      const effEnd = Math.max(ev.endTs, ev.startTs + minEffMs);
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (ev.startTs >= laneEnds[i]) {
          themeLanes[theme][ev.id] = i; laneEnds[i] = effEnd; placed = true; break;
        }
      }
      if (!placed) { themeLanes[theme][ev.id] = laneEnds.length; laneEnds.push(effEnd); }
    }
    themeLaneCounts[theme] = Math.max(1, laneEnds.length);
    themeRowH[theme] = Math.max(ROW_H, themeLaneCounts[theme] * LANE_H + LANE_PAD * 2);
  }
}

// ── Coordinate helpers ────────────────────────────────────────────────────
const tsToX = ts => LABEL_W + (ts - minTs) * scale + panX;
const xToTs = x  => minTs + (x - LABEL_W - panX) / scale;

// ── Fit view ─────────────────────────────────────────────────────────────
function fitView() {
  const W         = wrap.clientWidth;
  const oneYearMs = 365.25 * 86400000;
  scale = (W - LABEL_W) / oneYearMs;  // one year fills the timeline width
  panX  = -(AXIS_START - minTs) * scale; // start at Jan 1 2012
  redraw();
}

function fitAll() {
  const W     = wrap.clientWidth;
  const range = Math.max(Date.now() - AXIS_START, 86400000);
  scale = (W - LABEL_W - 20) / range;
  panX  = -(AXIS_START - minTs) * scale;
  redraw();
}

// ── SVG helpers ───────────────────────────────────────────────────────────
const mk = (tag, a = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
  return e;
};
const svgTxt = (x, y, s, a = {}) => {
  const t = mk('text', { x, y, 'font-family': 'system-ui, sans-serif', ...a });
  t.textContent = s; return t;
};

// Word-wrap text into lines of at most maxChars; truncates last line with … if overflow
function wrapLabel(text, maxChars, maxLines = 3) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (test.length > maxChars && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*$/, '') + '…';
  }
  return lines;
}

// Render a vertically centred multi-line SVG text label using tspan elements
function svgWrappedLabel(x, cy, text, maxChars, attrs = {}, lineH = 14) {
  const lines = wrapLabel(text, maxChars);
  const totalH = lines.length * lineH;
  const t = mk('text', { x, y: cy - totalH / 2 + lineH * 0.8, 'font-family': 'system-ui, sans-serif', ...attrs });
  lines.forEach((line, i) => {
    const ts = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    ts.setAttribute('x', x);
    if (i > 0) ts.setAttribute('dy', lineH);
    ts.textContent = line;
    t.appendChild(ts);
  });
  return t;
}

// ── Tick generation ───────────────────────────────────────────────────────
function getTickConfig() {
  const ppd = scale * 86400000; // pixels per day
  if (ppd > 60)  return { maj: addDays(7),    min: addDays(1),    fmt: d => fmt(d, 'Md') };
  if (ppd > 15)  return { maj: addMonths(1),  min: addDays(7),    fmt: d => fmt(d, 'My') };
  if (ppd > 4)   return { maj: addMonths(3),  min: addMonths(1),  fmt: d => fmt(d, 'My') };
  if (ppd > 1)   return { maj: addYears(1),   min: addMonths(3),  fmt: d => fmt(d, 'Y')  };
  if (ppd > 0.2) return { maj: addYears(5),   min: addYears(1),   fmt: d => fmt(d, 'Y')  };
               return { maj: addYears(10),  min: addYears(5),   fmt: d => fmt(d, 'Y')  };
}

function fmt(d, pat) {
  if (pat === 'Y')  return String(d.getFullYear());
  if (pat === 'My') return d.toLocaleString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2);
  if (pat === 'Md') return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString();
}

const addDays   = n => d => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addMonths = n => d => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const addYears  = n => d => { const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; };

function cleanStart(d, addFn) {
  const ref = new Date(2000, 0, 1);
  const ms  = addFn(ref) - ref;
  const r   = new Date(d);
  r.setHours(0, 0, 0, 0);
  if (ms >= 365 * 86400000 * 8) {
    const n = Math.round(ms / (365 * 86400000));
    r.setFullYear(Math.ceil(r.getFullYear() / n) * n, 0, 1);
  } else if (ms >= 365 * 86400000 * 3) {
    r.setFullYear(Math.ceil(r.getFullYear() / 5) * 5, 0, 1);
  } else if (ms >= 365 * 86400000) {
    r.setMonth(0, 1);
    if (r <= d) r.setFullYear(r.getFullYear() + 1);
  } else if (ms >= 86 * 86400000) {
    r.setDate(1);
    while (r <= d) r.setMonth(r.getMonth() + 3);
  } else if (ms >= 27 * 86400000) {
    r.setDate(1);
    if (r <= d) r.setMonth(r.getMonth() + 1);
  } else if (ms >= 6 * 86400000) {
    r.setDate(r.getDate() - r.getDay());
    if (r <= d) r.setDate(r.getDate() + 7);
  } else {
    if (r <= d) r.setDate(r.getDate() + 1);
  }
  return r;
}

function generateTicks(addFn, start, end) {
  const ticks = [];
  let d = cleanStart(start, addFn);
  let safety = 0;
  while (d <= end && safety++ < 800) {
    ticks.push(new Date(d));
    d = addFn(d);
  }
  if (safety >= 800) console.warn('generateTicks: safety limit hit — tick loop may be broken');
  return ticks;
}

// ── Month axis (top or bottom) ────────────────────────────────────────────
// fromBottom=false → ticks hang down from top edge; fromBottom=true → ticks rise from bottom edge
function drawMonthAxis(svgEl, W, axisH, fromBottom, cpId) {
  const now   = new Date();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1); // start of next month
  const defs  = mk('defs');
  const cp    = mk('clipPath', { id: cpId });
  cp.appendChild(mk('rect', { x: LABEL_W, y: 0, width: W - LABEL_W, height: axisH }));
  defs.appendChild(cp);
  svgEl.appendChild(defs);

  // Pixels per (average) month — drives month label verbosity
  const ppm = scale * 30.44 * 86400000;
  const monthFmt = ppm > 80 ? 'long' : ppm > 30 ? 'short' : null;

  // Pixels per year — drives year label density
  const ppy = scale * 365.25 * 86400000;
  const yearStep = ppy >= 40 ? 1 : ppy >= 20 ? 2 : ppy >= 8 ? 5 : 10;

  const g = mk('g', { 'clip-path': `url(#${cpId})` });
  let d = new Date(new Date(AXIS_START).getFullYear(), 0, 1);

  while (d <= end) {
    const x      = tsToX(d.getTime());
    const mo     = d.getMonth(); // 0=Jan … 6=Jul
    const isJan   = mo === 0;
    const isJuly  = mo === 6;
    const isQuart = mo === 3 || mo === 9; // Apr / Oct

    // Tick height: Jan=full, July=medium, Apr/Oct=25% above regular, other=short
    const tickLen = isJan ? 18 : isJuly ? 12 : isQuart ? 8 : 5;
    const stroke  = isJan ? COLORS.textSubtle : isJuly || isQuart ? COLORS.textMuted : COLORS.border;
    const sw      = 3;

    if (x >= LABEL_W - 1 && x <= W + 1) {
      if (fromBottom) {
        // ticks point upward from y=0
        g.appendChild(mk('line', { x1: x, y1: 0, x2: x, y2: tickLen, stroke, 'stroke-width': sw }));
        if (isJan && d.getFullYear() % yearStep === 0) {
          g.appendChild(svgTxt(x + 3, tickLen + 11, String(d.getFullYear()), {
            fill: COLORS.textSubtle, 'font-size': 11, 'font-weight': '600'
          }));
        } else if (monthFmt) {
          g.appendChild(svgTxt(x + 3, tickLen + 11, d.toLocaleString('en-US', { month: monthFmt }), {
            fill: COLORS.textMuted, 'font-size': 10, 'font-weight': '500'
          }));
        }
      } else {
        // ticks point downward from y=axisH
        g.appendChild(mk('line', { x1: x, y1: axisH - tickLen, x2: x, y2: axisH, stroke, 'stroke-width': sw }));
        if (isJan && d.getFullYear() % yearStep === 0) {
          g.appendChild(svgTxt(x + 3, axisH - tickLen - 4, String(d.getFullYear()), {
            fill: COLORS.textSubtle, 'font-size': 11, 'font-weight': '600'
          }));
        } else if (monthFmt) {
          g.appendChild(svgTxt(x + 3, axisH - tickLen - 4, d.toLocaleString('en-US', { month: monthFmt }), {
            fill: COLORS.textMuted, 'font-size': 10, 'font-weight': '500'
          }));
        }
      }
    }
    d.setMonth(d.getMonth() + 1);
  }
  svgEl.appendChild(g);
}

// ── Event bar helper ─────────────────────────────────────────────────────
function drawEventBar(evG, ev, barTop, color, W, rowEvs) {
  const x1    = tsToX(ev.startTs);
  const x2    = tsToX(ev.endTs);
  const barW  = Math.max(x2 - x1, 6);

  const g    = mk('g');
  g.setAttribute('data-ev-id', ev.id);
  g.classList.add('event-bar-g');
  g.style.cursor = 'pointer';
  if (searchQuery && !searchMatchSet.has(ev.id)) {
    g.setAttribute('opacity', '0.15');
  }
  evG.appendChild(g);
  const rect = mk('rect', { x: x1, y: barTop, width: barW, height: BAR_H, fill: color, rx: 4, opacity: 0.82 });
  g.appendChild(rect);

  if (barW > 22) {
    const lx    = Math.max(x1 + 6, LABEL_W + 2);
    const avail = barW - (lx - x1) - 6;
    const maxCh = Math.max(0, Math.floor(avail / 7));
    if (maxCh > 1) {
      const label  = ev.headline.length > maxCh ? ev.headline.slice(0, maxCh - 1) + '…' : ev.headline;
      const textY  = barTop + BAR_H / 2 + 4;
      const textEl = svgTxt(lx, textY, label, {
        fill: COLORS.white, 'font-size': 11, 'font-weight': '500'
      });
      g.appendChild(textEl);
      const textW = label.length * 7; // O7: heuristic matches truncation estimate (no layout flush)
      g.appendChild(mk('line', {
        x1: lx, y1: textY + 2, x2: lx + textW, y2: textY + 2,
        stroke: COLORS.white, 'stroke-width': 2, 'stroke-opacity': 0.7,
        style: 'pointer-events:none'
      }));
    }
  } else {
    const lx = x1 + barW + 5;
    if (lx < W - 10) {
      let maxRight = W - 4;
      for (const e2 of rowEvs) {
        if (e2 === ev || e2.group !== ev.group || (e2.lane || 0) !== (ev.lane || 0)) continue;
        if (e2.startTs <= ev.startTs) continue;
        const e2x = tsToX(e2.startTs);
        if (e2x < maxRight) maxRight = e2x - 4;
      }
      const avail  = maxRight - lx;
      const maxCh  = Math.max(0, Math.floor(avail / 7));
      if (maxCh > 2) {
        const label  = ev.headline.length > maxCh ? ev.headline.slice(0, maxCh - 1) + '…' : ev.headline;
        const textY  = barTop + BAR_H / 2 + 4;
        const textEl = svgTxt(lx, textY, label, {
          fill: COLORS.textLight, 'font-size': 11, 'font-weight': '500'
        });
        g.appendChild(textEl);
        const textW = label.length * 7; // O7: heuristic matches truncation estimate (no layout flush)
        g.appendChild(mk('line', {
          x1: lx, y1: textY + 2, x2: lx + textW, y2: textY + 2,
          stroke: color, 'stroke-width': 2,
          style: 'pointer-events:none'
        }));
      }
    }
  }

  // O6: hover opacity handled by CSS (.event-bar-g:hover > rect); interactions delegated to evG in redraw()
}

// ── Event visibility ──────────────────────────────────────────────────────
function isEventVisible(e) {
  if (!groupVis.has(e.group)) return false;
  // OR logic across Group / Program / Project:
  // events with no tags in these dimensions always show;
  // tagged events show if any one of their tags is checked
  const noTags = orgs.length === 0 && programs.length === 0 && projects.length === 0;
  if (noTags) return true;
  const hasTag = e.org !== '' || e.program !== '' || e.project !== '';
  if (!hasTag) return true;
  return (e.org     !== '' && orgVis.has(e.org))         ||
         (e.program !== '' && programVis.has(e.program)) ||
         (e.project !== '' && projVis.has(e.project));
}

// ── Main render ───────────────────────────────────────────────────────────
function redraw() {
  if (!events.length) return;
  LABEL_W = computeLabelW();

  const isThemes  = VIEW_MODE === 'themes' && hasEnrichedData;
  const W         = wrap.clientWidth;

  const visGroups = groups.filter(g => groupVis.has(g));
  const visThemes = themeRows.filter(t => themeVis.has(t));
  const visRows   = isThemes ? visThemes : visGroups;
  const rowH      = isThemes ? (r => themeRowH[r]) : (r => rowHeights[r] || ROW_H);
  const rowClr    = isThemes ? (r => themeColor[r]) : (r => groupColor[r]);

  // Compute cumulative Y for active row set
  if (isThemes) {
    themeY = {}; let curY = 0;
    for (const t of visThemes) { themeY[t] = curY; curY += themeRowH[t] || ROW_H; }
  } else {
    groupY = {}; let curY = 0;
    for (const g of visGroups) { groupY[g] = curY; curY += rowHeights[g] || ROW_H; }
  }
  const contentH = isThemes
    ? visThemes.reduce((s, t) => s + (themeRowH[t] || ROW_H), 0)
    : visGroups.reduce((s, g) => s + (rowHeights[g] || ROW_H), 0);
  const H = contentH;

  tlSvg.setAttribute('width',  W);
  tlSvg.setAttribute('height', H);
  tlSvg.style.display = 'block';
  emptyEl.style.display = 'none';
  tlSvg.innerHTML = '';

  // ── Header SVG ────────────────────────────────────────────────────────
  hdrSvg.setAttribute('width', W);
  hdrSvg.setAttribute('height', HDR_H);
  hdrSvg.innerHTML = '';
  hdrSvg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: HDR_H, fill: COLORS.panelBg }));
  hdrSvg.appendChild(mk('rect', { x: 0, y: 0, width: LABEL_W, height: HDR_H, fill: COLORS.panelBg }));
  hdrSvg.appendChild(mk('line', { x1: LABEL_W, y1: 0, x2: LABEL_W, y2: HDR_H, stroke: COLORS.border, 'stroke-width': 1 }));
  hdrSvg.appendChild(svgTxt(12, HDR_H / 2 + 4, isThemes ? 'THEME' : 'CATEGORY', {
    fill: COLORS.textDim, 'font-size': 10, 'font-weight': '700', 'letter-spacing': '0.08em'
  }));
  drawMonthAxis(hdrSvg, W, HDR_H, false, 'cpHdr');

  // ── Defs (clip paths) ────────────────────────────────────────────────
  const defs = mk('defs');
  const cpEvent = mk('clipPath', { id: 'cpE' });
  cpEvent.appendChild(mk('rect', { x: LABEL_W, y: 0, width: W - LABEL_W, height: H }));
  defs.append(cpEvent);
  tlSvg.appendChild(defs);

  // ── Background ────────────────────────────────────────────────────────
  tlSvg.appendChild(mk('rect', { x: 0, y: 0, width: W, height: H, fill: COLORS.bgDark }));

  // ── Tick lines + row backgrounds (clipped) ───────────────────────────
  // Tick config changes at 6 discrete scale thresholds; cache until threshold or data changes.
  const { maj: majAdd, min: minAdd } = getTickConfig();
  const tickKey = `${Math.round(scale * 1e9)}|${minTs}|${maxTs}`;
  if (tickKey !== _tickCacheKey) {
    _tickCacheKey = tickKey;
    _tickCache = {
      majDates: generateTicks(majAdd, new Date(minTs), new Date(maxTs)),
      minDates: generateTicks(minAdd, new Date(minTs), new Date(maxTs)),
    };
  }
  const { majDates, minDates } = _tickCache;

  const gridG = mk('g', { 'clip-path': 'url(#cpE)' });

  // Row backgrounds
  visRows.forEach((r, i) => {
    const y  = isThemes ? themeY[r] : groupY[r];
    const rh = rowH(r);
    gridG.appendChild(mk('rect', {
      x: LABEL_W, y, width: W - LABEL_W, height: rh,
      fill: i % 2 === 0 ? COLORS.stripeDark : COLORS.bgDark
    }));
    gridG.appendChild(mk('line', {
      x1: LABEL_W, y1: y + rh, x2: W, y2: y + rh,
      stroke: COLORS.panelBg, 'stroke-width': 1
    }));
  });

  // Minor grid lines
  for (const d of minDates) {
    const x = tsToX(d.getTime());
    if (x < LABEL_W || x > W) continue;
    gridG.appendChild(mk('line', { x1: x, y1: 0, x2: x, y2: H, stroke: COLORS.stripeLight, 'stroke-width': 1 }));
  }
  // Major grid lines
  for (const d of majDates) {
    const x = tsToX(d.getTime());
    if (x < LABEL_W || x > W) continue;
    gridG.appendChild(mk('line', { x1: x, y1: 0, x2: x, y2: H, stroke: COLORS.border, 'stroke-width': 1 }));
  }
  tlSvg.appendChild(gridG);

  // ── Past watermark ────────────────────────────────────────────────────
  {
    const wX = tsToX(AXIS_START) - 20;
    pastWatermarkG = mk('g', { 'clip-path': 'url(#cpE)', opacity: 0.25 });
    [
      [wX, 105, 'i ka wā ma mua'],
      [wX, 215, 'ka wā ma hope'],
    ].forEach(([x, y, s]) => {
      pastWatermarkG.appendChild(svgTxt(x, y, s, {
        fill: COLORS.watermark, 'font-size': 100, 'text-anchor': 'end',
        'font-family': 'Nunito, system-ui, sans-serif', 'font-weight': 700,
      }));
    });
    tlSvg.appendChild(pastWatermarkG);
    logoWatermarkG = mk('g', { 'clip-path': 'url(#cpE)', opacity: 0.15 });
    logoWatermarkG.appendChild(mk('image', {
      href: 'image/AbTeCLogo-Horizontal-Primary.png',
      x: wX - 600, y: 290, width: 600, height: 600,
      preserveAspectRatio: 'xMaxYMin meet',
    }));
    tlSvg.appendChild(logoWatermarkG);
  }

  // ── Future watermark ──────────────────────────────────────────────────
  {
    const wX = tsToX(Math.max(maxTs, Date.now())) + 20;
    futureWatermarkG = mk('g', { 'clip-path': 'url(#cpE)', opacity: 0.25 });
    [
      [wX, 105, 'the future is'],
      [wX, 215, 'Indigenous'],
    ].forEach(([x, y, s]) => {
      futureWatermarkG.appendChild(svgTxt(x, y, s, {
        fill: COLORS.watermark, 'font-size': 100, 'text-anchor': 'start',
        'font-family': 'Nunito, system-ui, sans-serif', 'font-weight': 700,
      }));
    });
    tlSvg.appendChild(futureWatermarkG);
  }

  updateWatermarkY();

  crosshairSvgH = H;
  crosshairG    = null; // re-created on every mousemove, inserted before evG

  // ── Events (clipped) ──────────────────────────────────────────────────
  // Recompute only when filter state changed; pure pan/zoom reuses the cached array.
  if (_visEvsDirty) { _visEvsCache = events.filter(isEventVisible); _visEvsDirty = false; }
  const visEvs = _visEvsCache;
  const evG    = mk('g', { 'clip-path': 'url(#cpE)' });
  tlSvg.appendChild(evG);
  evGRef = evG;

  // O6: delegated interaction handlers — 3 listeners total regardless of event count
  evG.addEventListener('click', e => {
    const g = e.target.closest('.event-bar-g');
    if (!g) return;
    e.stopPropagation(); hideTooltip();
    const ev = events.find(ev => ev.id === +g.dataset.evId);
    if (ev) openDrawer(ev);
  });
  evG.addEventListener('mouseover', e => {
    if (!hasFineMouse()) return;
    const g = e.target.closest('.event-bar-g');
    if (!g || g.contains(e.relatedTarget)) return; // not entering g
    const ev = events.find(ev => ev.id === +g.dataset.evId);
    if (ev) showTooltip(ev, e.clientX, e.clientY);
  });
  evG.addEventListener('mouseout', e => {
    if (!hasFineMouse()) return;
    const g = e.target.closest('.event-bar-g');
    if (!g || g.contains(e.relatedTarget)) return; // not leaving g
    hideTooltip();
  });

  if (!isThemes) {
    // ── Sections mode ────────────────────────────────────────────────────
    for (const ev of visEvs) {
      if (groupY[ev.group] === undefined) continue;
      const rY     = groupY[ev.group];
      const barTop = rY + LANE_PAD + (ev.lane || 0) * LANE_H;
      drawEventBar(evG, ev, barTop, groupColor[ev.group], W, visEvs);
    }
  } else {
    // ── Themes mode ──────────────────────────────────────────────────────
    for (const theme of visThemes) {
      const tRowEvs = events.filter(e => e.themes.includes(theme));
      for (const ev of tRowEvs) {
        const rY     = themeY[theme];
        const lane   = themeLanes[theme]?.[ev.id] ?? 0;
        const barTop = rY + LANE_PAD + lane * LANE_H;
        drawEventBar(evG, ev, barTop, themeColor[theme], W, tRowEvs);
      }
    }
  }

  // ── Today marker (clipped to event area) ─────────────────────────────
  const todayX = tsToX(Date.now());
  if (todayX >= LABEL_W && todayX <= W) {
    const todayG = mk('g', { 'clip-path': 'url(#cpE)' });
    // Vertical line
    todayG.appendChild(mk('line', {
      x1: todayX, y1: 0, x2: todayX, y2: H,
      stroke: COLORS.todayMarker, 'stroke-width': 1.5, 'stroke-dasharray': '4 3'
    }));
    // Triangle at top (pointing down into timeline)
    const ta = 6;
    todayG.appendChild(mk('polygon', {
      points: `${todayX - ta},0 ${todayX + ta},0 ${todayX},${ta * 1.6}`,
      fill: COLORS.todayMarker
    }));
    // Triangle at bottom (pointing up)
    todayG.appendChild(mk('polygon', {
      points: `${todayX - ta},${H} ${todayX + ta},${H} ${todayX},${H - ta * 1.6}`,
      fill: COLORS.todayMarker
    }));
    tlSvg.appendChild(todayG);
  }

  // ── Label column (always on top) ──────────────────────────────────────
  const lblG = mk('g');
  lblG.appendChild(mk('rect', { x: 0, y: 0, width: LABEL_W, height: H, fill: COLORS.panelBg }));
  lblG.appendChild(mk('line', { x1: LABEL_W, y1: 0, x2: LABEL_W, y2: H, stroke: COLORS.border, 'stroke-width': 1 }));
  // row label column
  visRows.forEach((r, i) => {
    const y  = isThemes ? themeY[r] : groupY[r];
    const rh = rowH(r);
    lblG.appendChild(mk('rect', {
      x: 0, y, width: LABEL_W, height: rh,
      fill: i % 2 === 0 ? COLORS.stripeLight : COLORS.stripeDark
    }));
    lblG.appendChild(mk('line', { x1: 0, y1: y + rh, x2: LABEL_W, y2: y + rh, stroke: COLORS.border, 'stroke-width': 0.5 }));
    lblG.appendChild(svgWrappedLabel(12, y + rh / 2, r, 17, { fill: rowClr(r), 'font-size': 12, 'font-weight': '500' }));
  });
  tlSvg.appendChild(lblG);

  const visCount = isThemes
    ? new Set(events.filter(e => e.themes.some(t => themeVis.has(t))).map(e => e.id)).size
    : visEvs.length;
  cntEl.textContent = `${visCount} of ${events.length} event${events.length !== 1 ? 's' : ''}`;

  // ── Bottom axis ───────────────────────────────────────────────────────
  const btmSvg = document.getElementById('btm-svg');
  btmSvg.setAttribute('width', W);
  btmSvg.innerHTML = '';
  drawMonthAxis(btmSvg, W, BTM_H, true, 'cpBtm');
}


