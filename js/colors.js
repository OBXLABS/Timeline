// ── Shared color palette ────────────────────────────────────────────────
// Every color re-used across the JS files (timeline canvas, PDF export,
// status messages, etc). Each color appears once, named for what it looks
// like; change a value here and it updates everywhere it is used.
// Note: this is separate from the PALETTE array in config.js, which is
// the per-category event-color rotation, not repeated UI chrome.
// The page's CSS colors live in the :root block at the top of styles.css;
// lightGray, red and yellow below match --color-light-gray, --color-red and --color-yellow.
const COLORS = {
  lightGray: '#f0f3f5',  // canvas, header & label-panel backgrounds, row backgrounds, fine gridlines
  slate:     '#384853',  // borders, row dividers, axis ticks, secondary / axis text
  black:     '#000000',  // event labels, category labels in export, crosshair
  indigo:    '#6366f1',  // links in the Storybox, PDF print button
  red:       '#FD1901',  // today marker (same red as the title & sidebar drag handle)
  yellow:    '#fbab1b',  // "the past / the future is Indigenous" watermarks
  success:   '#22c55e',  // "✓ Loaded" status text
  error:     '#ef4444',  // load-error status text
};
