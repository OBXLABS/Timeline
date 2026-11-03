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

// ── File section (Data status / Export) collapse toggle ─────────────────────
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

// Mobile toolbar: call the same named functions as the sidebar controls
document.getElementById('mob-zoomin') .addEventListener('click', doZoomIn);
document.getElementById('mob-zoomout').addEventListener('click', doZoomOut);
document.getElementById('mob-fit')    .addEventListener('click', fitAll);
document.getElementById('mob-today')  .addEventListener('click', doToday);

