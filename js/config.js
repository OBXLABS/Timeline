// ── Layout constants ─────────────────────────────────────────────────────
let LABEL_W    = 150;   // group label column width (px) — updated dynamically
function computeLabelW() {
  if (window.innerWidth < 480) return 90;
  if (window.innerWidth < 768) return 110;
  return 150;
}
const HDR_H      = 48;    // time axis header height (px)
const BTM_H      = 40;    // bottom axis height (px)
let AXIS_START = new Date(2012, 0, 1).getTime(); // updated to earliest event's year on load
const ROW_H   = 64;    // minimum group row height (px)
const BAR_H   = 28;    // event bar height (px)
const BAR_Y   = (ROW_H - BAR_H) / 2;
const LANE_H  = BAR_H + 8;  // height per lane
const LANE_PAD = 10;          // top/bottom padding within a row
const NS      = 'http://www.w3.org/2000/svg';

// ── Color palette (per category) ─────────────────────────────────────────
// const PALETTE = [
//   '#6366f1','#ec4899','#8b5cf6','#10b981',
//   '#3b82f6','#ef4444','#f59e0b','#14b8a6',
//   '#f97316','#84cc16','#06b6d4','#a855f7'
// ];
// Olivia Test Palete
const PALETTE = [
  '#FFC117','#8531C4','#E02830','#1C8756',
  '#FF801C','#1852CC','#DE217D','#0BB3AA',
  '#f97316','#84cc16','#06b6d4','#a855f7'
];

// ── State ────────────────────────────────────────────────────────────────
let events    = [];
let groups    = [];
let orgs      = [];
let programs  = [];
let projects  = [];
let groupColor = {};
let groupVis  = new Set();
let orgVis    = new Set();
let programVis = new Set();
let projVis   = new Set();
let categoryGroups = [];          // [{ title, items }] — category accordion groups; one entry per source document
let accordionState = new Map();   // section title → boolean (true = expanded); persists across buildFilters() calls
let dimLabels = { orgs: 'Group', programs: 'Program', projects: 'Project' }; // renamed per format
let VIEW_MODE       = 'sections'; // 'sections' | 'themes'
let hasEnrichedData = false;
let themeRows       = [];         // all themes sorted by event-count desc
let themeColor      = {};         // theme → hex color
let themeVis        = new Set();  // visible themes (filter)
let themeRowH       = {};         // theme → row height px
let themeY          = {};         // theme → cumulative Y (built in redraw)
let themeLaneCounts = {};         // theme → lane count
let themeLanes      = {};         // theme → { evId → lane index }
let programGroups  = []; // [{ label, items }] — sub-groups within Funding Agency; CV only
let eventsByGroup  = new Map(); // group → Event[] index; built in parse(), used by syncCategoryVis/syncDimVis
const hasFineMouse = () => window.matchMedia('(pointer: fine)').matches; // true on mouse/trackpad, false on touch
let minTs, maxTs;
let laneCounts = {};   // group -> number of lanes needed
let rowHeights = {};   // group -> row height in px
let groupY     = {};   // group -> cumulative Y offset (updated each redraw)
let scale     = 1e-8;   // pixels per millisecond
let panX      = 0;
let dragging  = false;
let dragStartX, dragStartPan, dragStartY, dragStartScrollTop;
let crosshairG = null, evGRef = null, crosshairSvgH = 0;
let pastWatermarkG = null, futureWatermarkG = null, logoWatermarkG = null;

// ── Opt: render caches ────────────────────────────────────────────────────
let _rafPending  = false;              // RAF gate: at most one redraw per animation frame
let _visEvsDirty = true;               // true → recompute visEvs on next redraw
let _visEvsCache = [];                 // cached result of events.filter(isEventVisible)
let _tickCacheKey = '';                // last tick config key (level|minTs|maxTs)
let _tickCache    = null;              // { majDates, minDates }
let logoGroupBottom = 590; // refined once image loads
(function () {
  const img = new Image();
  img.onload = function () {
    const renderedH = 600 / (this.naturalWidth / this.naturalHeight);
    logoGroupBottom = 290 + Math.min(renderedH, 600);
    updateWatermarkY();
  };
  img.src = 'image/AbTeCLogo-Horizontal-Primary.png';
}());

// ── DOM refs ─────────────────────────────────────────────────────────────
const dz       = document.getElementById('drop-zone');
const fi       = document.getElementById('file-input');
const wrap     = document.getElementById('tl-wrap');
const tlSvg    = document.getElementById('tl-svg');
const hdrSvg   = document.getElementById('hdr-svg');
const emptyEl  = document.getElementById('empty');
const filDiv   = document.getElementById('filters');
const cntEl    = Object.assign(document.createElement('div'), { id: 'event-count' });
const tooltip  = document.getElementById('tooltip');

let _hideTimer = null;
function _cancelHide() { if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; } }
function _scheduleHide() { _hideTimer = setTimeout(() => { tooltip.style.display = 'none'; _hideTimer = null; }, 180); }

function showTooltip(ev, x, y) {
  _cancelHide();
  document.getElementById('tt-headline').textContent = ev.headline;
  document.getElementById('tt-desc').innerHTML       = linkify(ev.description || '');
  const dateStr = ev.end > ev.start
    ? `${fmtDate(ev.start)} – ${fmtDate(ev.end)}`
    : fmtDate(ev.start);
  document.getElementById('tt-date').textContent = dateStr;
  tooltip.style.display = 'block';
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  tooltip.style.left = (x + 14 + tw > window.innerWidth ? x - tw - 10 : x + 14) + 'px';
  tooltip.style.top  = (y + 14 + th > window.innerHeight ? y - th - 6  : y + 14) + 'px';
}
function hideTooltip() { _scheduleHide(); }

tooltip.addEventListener('mouseenter', _cancelHide);
tooltip.addEventListener('mouseleave', _scheduleHide);

