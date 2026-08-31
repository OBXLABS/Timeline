// ── Shared color palette ────────────────────────────────────────────────
// Central place for every color re-used across the JS files (timeline
// canvas, print/export SVG, status messages, etc). Change a value here
// and it updates everywhere that color is used.
// Note: this is separate from the PALETTE array in config.js, which is
// the per-category event-color rotation, not repeated UI chrome.
const COLORS = {
  bgDark:      '#f0f3f5',  // main dark background (canvas, print background)
  panelBg:     '#f0f3f5',  // header / row-label panel background
  stripeDark:  '#dde0e1',  // darker alternating row stripe
  stripeLight: '#f0f3f5',  // lighter alternating row stripe / fine gridlines
  border:      '#dde0e1',  // panel borders, dividers, default gridlines/ticks
  textDim:     '#4b5563',  // dim label text
  textMuted:   '#6b7280',  // muted text, month-axis mid ticks
  textSubtle:  '#ffffff',  // subtle text, month-axis year ticks
  textLight:   '#000000',  // light label text
  white:       '#000000',  // white text / strokes
  accent:      '#6366f1',  // primary accent (links, buttons, highlights)
  watermark:   '#fbab1b',  // past/future watermark text
  success:     '#22c55e',  // success status text
  error:       '#ef4444',  // error status text
};
