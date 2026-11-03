// ── Crosshair ─────────────────────────────────────────────────────────────
const crosshairLabel = document.getElementById('crosshair-label');
const CROSSHAIR_GAP  = 20;

function hideCrosshair() {
  if (crosshairG) { crosshairG.remove(); crosshairG = null; }
  crosshairLabel.style.display = 'none';
}

wrap.addEventListener('mousemove', e => {
  if (!events.length) return;
  const rect = wrap.getBoundingClientRect();
  const svgX = e.clientX - rect.left;
  if (svgX <= LABEL_W) { hideCrosshair(); return; }

  // Y in #tl-svg coordinates (accounts for sticky header and scroll position)
  const svgY = e.clientY - tlSvg.getBoundingClientRect().top;

  if (crosshairG) crosshairG.remove();
  crosshairG = mk('g', { 'pointer-events': 'none' });
  crosshairG.appendChild(mk('line', {
    x1: svgX, y1: 0, x2: svgX, y2: Math.max(0, svgY - CROSSHAIR_GAP),
    stroke: COLORS.black, 'stroke-opacity': '0.3', 'stroke-width': 1
  }));
  crosshairG.appendChild(mk('line', {
    x1: svgX, y1: svgY + CROSSHAIR_GAP, x2: svgX, y2: crosshairSvgH,
    stroke: COLORS.black, 'stroke-opacity': '0.3', 'stroke-width': 1
  }));
  if (evGRef) tlSvg.insertBefore(crosshairG, evGRef);

  const d = new Date(xToTs(svgX));
  crosshairLabel.textContent   = fmtDate(d);
  crosshairLabel.style.display = 'block';
  const lw     = crosshairLabel.offsetWidth;
  const labelX = (e.clientX + 8 + lw > rect.right) ? e.clientX - lw - 8 : e.clientX + 8;
  crosshairLabel.style.left = labelX + 'px';
  crosshairLabel.style.top  = (rect.top + 4) + 'px';
});
wrap.addEventListener('mouseleave', hideCrosshair);

window.addEventListener('resize', () => { if (events.length) redraw(); });

// ── Watermark vertical centering ──────────────────────────────────────────
function updateWatermarkY() {
  if (!pastWatermarkG) return;
  const mid = wrap.scrollTop + wrap.clientHeight / 2;
  // Left group: centre text (top≈33) + logo (bottom=logoGroupBottom) together
  const dyLeft  = mid - (33 + logoGroupBottom) / 2;
  // Right group: centre just the phrase (baselines 105 / 215, centre≈160)
  const dyRight = mid - 160;
  if (pastWatermarkG)  pastWatermarkG.setAttribute('transform',  `translate(0,${dyLeft})`);
  if (logoWatermarkG)  logoWatermarkG.setAttribute('transform',  `translate(0,${dyLeft})`);
  if (futureWatermarkG) futureWatermarkG.setAttribute('transform', `translate(0,${dyRight})`);
}
wrap.addEventListener('scroll', updateWatermarkY);
window.addEventListener('focus',  () => { if (events.length) redraw(); });

// ── Sidebar resize handle ──────────────────────────────────────────────────
{
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.getElementById('sidebar');
  let resizing = false, startX = 0, startW = 0;

  resizer.addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const w = Math.max(120, Math.min(520, startW + e.clientX - startX));
    sidebar.style.width = w + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
    if (events.length) redraw();
  });
}

// ── Auto-load ─────────────────────────────────────────────────────────────
// Always loads from DATA_SOURCE_URL (data-loaders.js). Progress and errors
// are shown in the sidebar "Data" line and in the empty-state message.
(async () => {
  if (isGDocUrl(DATA_SOURCE_URL)) await loadFromGDoc(DATA_SOURCE_URL);
  else                            await loadFromGSheet(DATA_SOURCE_URL);
})();

// ── Markdown Export ───────────────────────────────────────────────────────
document.getElementById('btn-export-md').addEventListener('click', () => {
  if (!events.length) return;

  const title  = document.getElementById('sidebar-title-text').textContent;
  const visEvs = getVisibleEvents();

  // Bucket by category, preserving display order
  const byGroup = {};
  for (const e of visEvs) {
    (byGroup[e.group] ??= []).push(e);
  }

  const exportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeStart = fmtDate(visEvs[0].start);
  const rangeEnd   = fmtDate(visEvs[visEvs.length - 1].end);
  const lines = [`# ${title}`, '', `*${rangeStart} – ${rangeEnd} · ${visEvs.length} events · exported ${exportDate}*`, ''];

  const visGroups = groups.filter(g => byGroup[g]);
  for (let si = 0; si < visGroups.length; si++) {
    const g    = visGroups[si];
    const evs  = byGroup[g];
    const sNum = si + 1;
    lines.push(`## ${g} (${evs.length})`, '');
    for (let ei = 0; ei < evs.length; ei++) {
      const e       = evs[ei];
      const dateStr = e.end > e.start ? `${fmtDate(e.start)} – ${fmtDate(e.end)}` : fmtDate(e.start);
      lines.push(`- **${sNum}.${ei + 1}** **${dateStr}** — ${e.headline}`);
    }
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  const y1md = visEvs[0].start.getFullYear();
  const y2md = visEvs[visEvs.length - 1].end.getFullYear();
  a.download = `AbTeC-Timeline-List-${y1md}-${y2md}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

// ── PDF Export ────────────────────────────────────────────────────────────
const exportModalBg = document.getElementById('export-modal-bg');

document.getElementById('btn-export').addEventListener('click', () => {
  if (!events.length) return;
  document.getElementById('export-y1').value = new Date(minTs).getFullYear();
  document.getElementById('export-y2').value = new Date(maxTs).getFullYear();
  exportModalBg.classList.add('open');
});

document.getElementById('export-cancel').addEventListener('click', () => {
  exportModalBg.classList.remove('open');
});
exportModalBg.addEventListener('click', e => {
  if (e.target === exportModalBg) exportModalBg.classList.remove('open');
});

document.getElementById('export-go').addEventListener('click', () => {
  const y1 = parseInt(document.getElementById('export-y1').value, 10);
  const y2 = parseInt(document.getElementById('export-y2').value, 10);
  if (!y1 || !y2 || y2 < y1) { alert('Please enter a valid year range.'); return; }
  exportModalBg.classList.remove('open');
  const svgString = buildExportSVG(y1, y2);
  const html = `<!DOCTYPE html><html><head>
  <title>AbTeC-Timeline-Visual-${y1}-${y2}</title>
  <style>
    @page {
      size: 11in 8.5in;
      margin-top: 0.75in;
      margin-right: 0.75in;
      margin-bottom: 0.75in;
      margin-left: 0.75in;
    }
    body  { margin: 0; background: ${COLORS.lightGray}; }
    svg   { display: block; width: 100%; height: auto; }
    #print-btn {
      position: fixed; top: 8px; right: 8px;
      background: ${COLORS.indigo}; color: ${COLORS.black};
      border: none; padding: 8px 18px;
      border-radius: 6px; cursor: pointer;
      font-size: 14px; font-family: system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4); z-index: 999;
    }
    #print-btn:hover { background: #4f46e5; }
    @media print { #print-btn { display: none !important; } }
  </style>
</head><body>
  <button id="print-btn">Print / Save as PDF</button>
  ${svgString}
  <script>
    document.getElementById('print-btn').addEventListener('click', function() {
      window.print();
    });
    window.onload = function() { window.print(); };
    window.onafterprint = function() { window.close(); };
  <\/script>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  if (!win) { URL.revokeObjectURL(blobUrl); alert('Please allow pop-ups for this page to export PDF.'); return; }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
});

function buildExportSVG(y1, y2) {
  const EXPORT_W       = 1100;
  const EXPORT_LABEL_W = 150;
  const EXPORT_HDR_H   = 36;
  const EXPORT_BTM_H   = 32;
  const TITLE_H        = 28;

  const exportStartTs = new Date(y1, 0, 1).getTime();
  const exportEndTs   = new Date(y2, 11, 31).getTime();
  const exportScale   = (EXPORT_W - EXPORT_LABEL_W) / Math.max(exportEndTs - exportStartTs, 86400000);
  const eTsToX = ts => (ts - exportStartTs) * exportScale + EXPORT_LABEL_W;

  // Same filter logic as redraw() — via shared isEventVisible()
  const visEvs    = events.filter(isEventVisible);
  const visGroups = visibleGroups(visEvs);

  // Group Y positions (same logic as redraw)
  const expGroupY = {};
  let expCurY = 0;
  for (const g of visGroups) {
    expGroupY[g] = expCurY;
    expCurY += rowHeights[g] || ROW_H;
  }
  const contentH    = expCurY;
  const contentOffY = TITLE_H + EXPORT_HDR_H;
  const totalH      = contentOffY + contentH + EXPORT_BTM_H;

  const svg = mk('svg', { xmlns: NS, width: EXPORT_W, height: totalH, viewBox: `0 0 ${EXPORT_W} ${totalH}` });

  // Defs: clip for content area
  const defs = mk('defs');
  const cpContent = mk('clipPath', { id: 'expCpContent' });
  cpContent.appendChild(mk('rect', {
    x: EXPORT_LABEL_W, y: contentOffY,
    width: EXPORT_W - EXPORT_LABEL_W, height: contentH
  }));
  defs.appendChild(cpContent);
  svg.appendChild(defs);

  // Background
  svg.appendChild(mk('rect', { x: 0, y: 0, width: EXPORT_W, height: totalH, fill: COLORS.lightGray }));

  // Title bar
  const titleText = document.getElementById('sidebar-title-text').textContent;
  svg.appendChild(mk('rect', { x: 0, y: 0, width: EXPORT_W, height: TITLE_H, fill: COLORS.lightGray }));
  svg.appendChild(svgTxt(EXPORT_LABEL_W + 6, TITLE_H - 7, titleText, {
    fill: '#f59e0b', 'font-size': 14, 'font-weight': '700', 'letter-spacing': '0.04em'
  }));

  // Header (top axis)
  svg.appendChild(mk('rect', { x: 0, y: TITLE_H, width: EXPORT_W, height: EXPORT_HDR_H, fill: COLORS.lightGray }));
  svg.appendChild(mk('line', {
    x1: 0, y1: TITLE_H + EXPORT_HDR_H, x2: EXPORT_W, y2: TITLE_H + EXPORT_HDR_H,
    stroke: COLORS.slate, 'stroke-width': 1
  }));
  svg.appendChild(mk('line', {
    x1: EXPORT_LABEL_W, y1: TITLE_H, x2: EXPORT_LABEL_W, y2: TITLE_H + EXPORT_HDR_H,
    stroke: COLORS.slate, 'stroke-width': 1
  }));
  svg.appendChild(svgTxt(12, TITLE_H + EXPORT_HDR_H / 2 + 4, 'CATEGORY', {
    fill: COLORS.slate, 'font-size': 10, 'font-weight': '700', 'letter-spacing': '0.08em'
  }));
  drawExportMonthAxis(svg, eTsToX, exportStartTs, exportEndTs,
    EXPORT_W, EXPORT_LABEL_W, TITLE_H, EXPORT_HDR_H, false, 'expCpHdr');

  // Row backgrounds + year grid lines
  const bgG = mk('g', { 'clip-path': 'url(#expCpContent)' });
  visGroups.forEach((g, i) => {
    const y  = contentOffY + expGroupY[g];
    const rh = rowHeights[g] || ROW_H;
    bgG.appendChild(mk('rect', {
      x: EXPORT_LABEL_W, y, width: EXPORT_W - EXPORT_LABEL_W, height: rh,
      fill: COLORS.lightGray
    }));
    bgG.appendChild(mk('rect', { // row divider, matches the label column line (see rendering.js)
      x: EXPORT_LABEL_W, y: y + rh - 0.25, width: EXPORT_W - EXPORT_LABEL_W, height: 0.25, fill: COLORS.slate
    }));
  });
  for (let yr = y1; yr <= y2 + 1; yr++) {
    const x = eTsToX(new Date(yr, 0, 1).getTime());
    if (x >= EXPORT_LABEL_W && x <= EXPORT_W) {
      bgG.appendChild(mk('line', {
        x1: x, y1: contentOffY, x2: x, y2: contentOffY + contentH,
        stroke: COLORS.slate, 'stroke-width': 1
      }));
    }
  }
  svg.appendChild(bgG);

  // Today marker
  const todayX = eTsToX(Date.now());
  if (todayX >= EXPORT_LABEL_W && todayX <= EXPORT_W) {
    const tG = mk('g', { 'clip-path': 'url(#expCpContent)' });
    tG.appendChild(mk('line', {
      x1: todayX, y1: contentOffY, x2: todayX, y2: contentOffY + contentH,
      stroke: COLORS.red, 'stroke-width': 1.5, 'stroke-dasharray': '4 3'
    }));
    const ta = 5;
    tG.appendChild(mk('polygon', {
      points: `${todayX - ta},${contentOffY} ${todayX + ta},${contentOffY} ${todayX},${contentOffY + ta * 1.6}`,
      fill: COLORS.red
    }));
    svg.appendChild(tG);
  }

  // Events
  const evG = mk('g', { 'clip-path': 'url(#expCpContent)' });
  for (const ev of visEvs) {
    if (expGroupY[ev.group] === undefined) continue;
    const rY     = contentOffY + expGroupY[ev.group];
    const x1     = eTsToX(ev.startTs);
    const x2     = eTsToX(ev.endTs);
    const barW   = Math.max(x2 - x1, 4);
    const barTop = rY + LANE_PAD + (ev.lane || 0) * LANE_H;
    const color  = groupColor[ev.group];
    evG.appendChild(mk('rect', {
      x: x1, y: barTop, width: barW, height: BAR_H,
      fill: color, rx: 3, opacity: 0.85
    }));
    if (barW > 18) {
      const lx    = Math.max(x1 + 4, EXPORT_LABEL_W + 2);
      const avail = barW - (lx - x1) - 4;
      const maxCh = Math.max(0, Math.floor(avail / 6.5)); // heuristic: ~6.5px/char (no DOM for getComputedTextLength in export)
      if (maxCh > 1) {
        const label = ev.headline.length > maxCh ? ev.headline.slice(0, maxCh - 1) + '…' : ev.headline;
        evG.appendChild(svgTxt(lx, barTop + BAR_H / 2 + 4, label, {
          fill: COLORS.black, 'font-size': 10, 'font-weight': '500'
        }));
      }
    }
  }
  svg.appendChild(evG);

  // Label column (always on top of events)
  const lblG = mk('g');
  lblG.appendChild(mk('rect', {
    x: 0, y: contentOffY, width: EXPORT_LABEL_W, height: contentH, fill: COLORS.lightGray
  }));
  lblG.appendChild(mk('line', {
    x1: EXPORT_LABEL_W, y1: contentOffY, x2: EXPORT_LABEL_W, y2: contentOffY + contentH,
    stroke: COLORS.slate, 'stroke-width': 1
  }));
  visGroups.forEach((g, i) => {
    const y  = contentOffY + expGroupY[g];
    const rh = rowHeights[g] || ROW_H;
    lblG.appendChild(mk('rect', {
      x: 0, y, width: EXPORT_LABEL_W, height: rh,
      fill: COLORS.lightGray
    }));
    lblG.appendChild(mk('line', {
      x1: 0, y1: y + rh, x2: EXPORT_LABEL_W, y2: y + rh,
      stroke: COLORS.slate, 'stroke-width': 0.5
    }));
    lblG.appendChild(svgWrappedLabel(12, y + rh / 2, g, 17, { fill: COLORS.black, 'font-size': 11, 'font-weight': '500' }));
  });
  svg.appendChild(lblG);

  // Bottom axis
  const btmY = contentOffY + contentH;
  svg.appendChild(mk('rect', { x: 0, y: btmY, width: EXPORT_W, height: EXPORT_BTM_H, fill: COLORS.lightGray }));
  svg.appendChild(mk('line', {
    x1: 0, y1: btmY, x2: EXPORT_W, y2: btmY, stroke: COLORS.slate, 'stroke-width': 1
  }));
  drawExportMonthAxis(svg, eTsToX, exportStartTs, exportEndTs,
    EXPORT_W, EXPORT_LABEL_W, btmY, EXPORT_BTM_H, true, 'expCpBtm');

  return new XMLSerializer().serializeToString(svg);
}

function drawExportMonthAxis(svgEl, eTsToX, startTs, endTs, W, LW, axisY, axisH, fromBottom, cpId) {
  const defs = mk('defs');
  const cp   = mk('clipPath', { id: cpId });
  cp.appendChild(mk('rect', { x: LW, y: axisY, width: W - LW, height: axisH }));
  defs.appendChild(cp);
  svgEl.appendChild(defs);

  const g = mk('g', { 'clip-path': `url(#${cpId})` });
  let d = new Date(new Date(startTs).getFullYear(), 0, 1);
  const endDate = new Date(endTs);
  endDate.setMonth(endDate.getMonth() + 2);

  while (d <= endDate) {
    const x       = eTsToX(d.getTime());
    const mo      = d.getMonth();
    const isJan   = mo === 0;
    const isJuly  = mo === 6;
    const isQuart = mo === 3 || mo === 9;
    const tickLen = isJan ? 16 : isJuly ? 10 : isQuart ? 7 : 4;
    const stroke  = isJan ? COLORS.slate : (isJuly || isQuart) ? COLORS.slate : COLORS.slate;

    if (x >= LW - 1 && x <= W + 1) {
      if (fromBottom) {
        g.appendChild(mk('line', { x1: x, y1: axisY, x2: x, y2: axisY + tickLen, stroke, 'stroke-width': 2 }));
        if (isJan) {
          g.appendChild(svgTxt(x + 3, axisY + tickLen + 10, String(d.getFullYear()), {
            fill: COLORS.slate, 'font-size': 10, 'font-weight': '600'
          }));
        }
      } else {
        g.appendChild(mk('line', { x1: x, y1: axisY + axisH - tickLen, x2: x, y2: axisY + axisH, stroke, 'stroke-width': 2 }));
        if (isJan) {
          g.appendChild(svgTxt(x + 3, axisY + axisH - tickLen - 3, String(d.getFullYear()), {
            fill: COLORS.slate, 'font-size': 10, 'font-weight': '600'
          }));
        }
      }
    }
    d.setMonth(d.getMonth() + 1);
  }
  svgEl.appendChild(g);
}

