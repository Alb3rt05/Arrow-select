/* ============================================================
   ArrowSelect — app logic
   ============================================================ */
'use strict';

/* ---------- Storage ---------- */
const DB = {
  KEY: 'arrowselect_v1',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; } },
  save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { UI.toast('Memoria piena: impossibile salvare', 'error'); } },
  upsert(s) { const a = this.load(), i = a.findIndex(x => x.id === s.id); if (i < 0) a.push(s); else a[i] = s; this.save(a); },
  del(id) { this.save(this.load().filter(s => s.id !== id)); }
};

/* ---------- Target color zones (outer→inner) ---------- */
const ZONES = [
  { fill: '#f7f7f7', stroke: '#c4c4c4' }, // 1
  { fill: '#efefef', stroke: '#c4c4c4' }, // 2
  { fill: '#1c1c1c', stroke: '#3a3a3a' }, // 3
  { fill: '#282828', stroke: '#3a3a3a' }, // 4
  { fill: '#2e5fcc', stroke: '#2146a0' }, // 5
  { fill: '#3a6fe0', stroke: '#2146a0' }, // 6
  { fill: '#d42020', stroke: '#a01010' }, // 7
  { fill: '#e83535', stroke: '#a01010' }, // 8
  { fill: '#f5c200', stroke: '#c09000' }, // 9
  { fill: '#ffe033', stroke: '#c09000' }, // 10 / X
];
const ZONE_TEXT = ['#555','#555','#ccc','#ccc','#c8d8ff','#c8d8ff','#ffc8c8','#ffc8c8','#5a3800','#5a3800'];
/* High-contrast colours for the zone numbers + an opposite halo for legibility on every ring */
const ZONE_NUM  = ['#141414','#141414','#ffffff','#ffffff','#ffffff','#ffffff','#ffffff','#ffffff','#3a2400','#3a2400'];
const ZONE_HALO = ['rgba(255,255,255,.92)','rgba(255,255,255,.92)','rgba(0,0,0,.6)','rgba(0,0,0,.6)','rgba(0,0,0,.5)','rgba(0,0,0,.5)','rgba(0,0,0,.5)','rgba(0,0,0,.5)','rgba(255,255,255,.92)','rgba(255,255,255,.92)'];

/* Radius (cm) of each target for physical σ conversion */
const TARGET_RADIUS_CM = { 122: 61, 80: 40, 40: 20 };

/* ---------- Retina-crisp canvas ---------- */
function fitCanvas(canvas, cssSize) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (cssSize) { canvas.style.width = cssSize + 'px'; canvas.style.height = cssSize + 'px'; }
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || cssSize || canvas.width;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, size: w };
}

/* ---------- Main target ----------
   `view` (optional) enlarges the target while aiming:
   { tcx, tcy, RR }  → target centre/radius in px (zoomed & panned)
   { aim, aimX, aimY, color, label } → precision crosshair + pending preview */
function drawTarget(canvas, historic, current, colors, view) {
  const { ctx, size } = fitCanvas(canvas);
  const W = size, H = size, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 4;
  ctx.clearRect(0, 0, W, H);

  const tcx = view ? view.tcx : cx;
  const tcy = view ? view.tcy : cy;
  const RR  = view ? view.RR  : R;
  const xR = RR * 0.05;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = ZONES[0].fill; ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 10; i++) {
    const outerR = RR * (10 - i) / 10;
    ctx.beginPath(); ctx.arc(tcx, tcy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = ZONES[i].fill; ctx.fill();
    ctx.strokeStyle = ZONES[i].stroke; ctx.lineWidth = i % 2 === 0 ? 0.5 : 1.1; ctx.stroke();
  }

  // X ring
  ctx.beginPath(); ctx.arc(tcx, tcy, xR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(80,60,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

  if (!view) {
    // crosshair
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6; ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke(); ctx.restore();

    // zone numbers along the horizontal axis — bold, high-contrast, haloed
    ctx.save();
    const fs = Math.max(10, Math.round(R * 0.062));
    ctx.font = `800 ${fs}px Inter, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2.5, fs * 0.22);
    // 10 → 1 laid out along the +x axis with even gaps (measured, so "10" never crowds "9")
    const widths = [];
    for (let z = 10; z >= 1; z--) widths.push(ctx.measureText(String(z)).width);
    const span = R * 0.86, totalW = widths.reduce((a, b) => a + b, 0);
    const gap = Math.max(fs * 0.38, (span - totalW) / 9);
    let x = cx + R * 0.12;
    for (let k = 0; k < 10; k++) {
      const z = 10 - k, txt = String(z);
      ctx.strokeStyle = ZONE_HALO[z - 1]; ctx.strokeText(txt, x, cy);
      ctx.fillStyle = ZONE_NUM[z - 1];   ctx.fillText(txt, x, cy);
      x += widths[k] + gap;
    }
    ctx.restore();

    // X — centred on the bullseye, bold and clearly visible
    ctx.save();
    const xfs = Math.max(13, Math.round(R * 0.08));
    ctx.font = `800 ${xfs}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, xfs * 0.24);
    ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText('X', cx, cy);
    ctx.fillStyle = '#3a2400'; ctx.fillText('X', cx, cy);
    ctx.restore();
  }

  for (const s of historic) _dot(ctx, tcx + s.nx * RR, tcy + s.ny * RR, s.arrowId, colors[s.arrowId] || '#888', 0.26, RR);
  for (const s of current)  _dot(ctx, tcx + s.nx * RR, tcy + s.ny * RR, s.arrowId, colors[s.arrowId] || '#222', 1, RR);
  ctx.restore();

  // precision crosshair + pending arrow preview (zoom/aim mode)
  if (view && view.aim) {
    _dot(ctx, view.aimX, view.aimY, view.label, view.color, 0.92, R);
    const cs = Math.max(15, R * 0.16);
    ctx.save();
    ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(view.aimX - cs, view.aimY); ctx.lineTo(view.aimX - cs * 0.34, view.aimY);
    ctx.moveTo(view.aimX + cs * 0.34, view.aimY); ctx.lineTo(view.aimX + cs, view.aimY);
    ctx.moveTo(view.aimX, view.aimY - cs); ctx.lineTo(view.aimX, view.aimY - cs * 0.34);
    ctx.moveTo(view.aimX, view.aimY + cs * 0.34); ctx.lineTo(view.aimX, view.aimY + cs);
    ctx.stroke(); ctx.restore();
  }
}

function _dot(ctx, x, y, label, color, alpha, R) {
  ctx.save();
  const r = Math.max(8, R * 0.028);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(7, r * 0.92)}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(label), x, y + 0.5);
  ctx.restore();
}

/* ---------- Rosata mini-canvas (zoomed) ---------- */
function drawRosata(canvas, shots, color, spreadNorm) {
  const { ctx, size } = fitCanvas(canvas, 130);
  const W = size, H = size, cx = W / 2, cy = H / 2, pad = 5, half = cx - pad;
  ctx.clearRect(0, 0, W, H);

  if (!shots || !shots.length) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2); ctx.clip();
    _miniRings(ctx, cx, cy, half); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    return;
  }

  const mx = shots.reduce((s, p) => s + p.nx, 0) / shots.length;
  const my = shots.reduce((s, p) => s + p.ny, 0) / shots.length;
  const maxDist = shots.reduce((m, s) => Math.max(m, Math.hypot(s.nx - mx, s.ny - my)), 0);
  const viewR = Math.max(spreadNorm * 2.8, maxDist * 1.5, 0.04);
  const scale = half / viewR;
  const tcx = cx - mx * scale, tcy = cy - my * scale;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = ZONES[0].fill; ctx.fillRect(0, 0, W, H);
  _miniRings(ctx, tcx, tcy, scale);
  ctx.restore();

  if (spreadNorm > 0 && shots.length >= 2) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, spreadNorm * scale, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3.5]);
    ctx.stroke(); ctx.restore();
  }

  for (const s of shots) {
    ctx.beginPath(); ctx.arc(cx + (s.nx - mx) * scale, cy + (s.ny - my) * scale, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  const cs = 7;
  ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - cs, cy); ctx.lineTo(cx + cs, cy);
  ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ff8c00'; ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, half, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
}

function _miniRings(ctx, tcx, tcy, scale) {
  for (let i = 0; i < 10; i++) {
    const r = (10 - i) / 10 * scale;
    if (r < 0.3) break;
    ctx.beginPath(); ctx.arc(tcx, tcy, r, 0, Math.PI * 2);
    ctx.fillStyle = ZONES[i].fill; ctx.fill();
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = i % 2 === 0 ? 0.3 : 0.8; ctx.stroke();
  }
}

/* ---------- Scoring ---------- */
function getScore(nx, ny) { const d = Math.hypot(nx, ny); return d > 1 ? 0 : Math.max(1, Math.ceil(10 - d * 10)); }
function isX(nx, ny) { return Math.hypot(nx, ny) < 0.05; }

function canvasCoords(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  let ex = e.clientX, ey = e.clientY;
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
  if (t) { ex = t.clientX; ey = t.clientY; }
  const px = ex - rect.left, py = ey - rect.top;
  const cx = rect.width / 2, cy = rect.height / 2;
  // Must match the R used in drawTarget (size/2 - 4, in CSS px)
  const R = Math.min(rect.width, rect.height) / 2 - 4;
  return { nx: (px - cx) / R, ny: (py - cy) / R };
}

/* ---------- Palette ---------- */
const PALETTE = [
  '#e63946','#457b9d','#2a9d8f','#e9a010','#8e44ad','#16a085','#c0392b','#1565c0',
  '#558b2f','#6d4c41','#ff6f00','#ad1457','#00838f','#4527a0','#00695c','#ef6c00',
  '#5d4037','#283593','#827717','#37474f','#00acc1','#7b1fa2','#f4511e','#546e7a',
  '#2e7d32','#c2185b','#0277bd','#9e6d00','#4e342e','#3949ab','#00897b','#d81b60',
  '#5e35b1','#43a047','#e53935','#1e88e5'
];

/* ---------- Analytics ---------- */
function computeStats(session) {
  const map = {};
  for (const a of session.arrowNumbers) map[a] = { shots: [], score: 0, x: 0 };
  for (const v of session.volleys)
    for (const s of v.shots)
      if (map[s.arrowId]) {
        map[s.arrowId].shots.push({ nx: s.nx, ny: s.ny });
        map[s.arrowId].score += s.score;
        if (s.xRing) map[s.arrowId].x++;
      }

  const rcm = TARGET_RADIUS_CM[session.targetType] || 61;

  return session.arrowNumbers.map(a => {
    const d = map[a], n = d.shots.length;
    if (n === 0) return { arrowId: a, n: 0, avg: 0, spread: Infinity, spreadCm: null, xCount: 0, shots: [], cx: 0, cy: 0 };
    const avg = d.score / n;
    const mx = d.shots.reduce((s, p) => s + p.nx, 0) / n;
    const my = d.shots.reduce((s, p) => s + p.ny, 0) / n;
    const spread = d.shots.reduce((s, p) => s + Math.hypot(p.nx - mx, p.ny - my), 0) / n;
    return { arrowId: a, n, avg, spread, spreadCm: (spread * rcm).toFixed(1), xCount: d.x, shots: d.shots, cx: mx, cy: my };
  }).sort((a, b) => {
    if (a.n === 0 && b.n === 0) return 0;
    if (a.n === 0) return 1; if (b.n === 0) return -1;
    if (Math.abs(a.spread - b.spread) < 0.00005) return b.avg - a.avg;
    return a.spread - b.spread;
  });
}

/* ---------- UI helpers: toast + modal + theme ---------- */
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
};

const UI = {
  toast(msg, type = 'success', ms = 2400) {
    const wrap = document.getElementById('toast-wrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const ic = type === 'error' ? ICON.x : type === 'info' ? ICON.info : ICON.check;
    el.innerHTML = `<span class="ic">${ic}</span><span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, ms);
  },

  confirm({ title, message, confirmText = 'Conferma', danger = true }) {
    return new Promise(resolve => {
      const root = document.getElementById('modal-root');
      root.innerHTML = `
        <div class="modal-scrim" id="_scrim">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-icon">${ICON.trash}</div>
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="modal-actions">
              <button class="btn btn-outline" id="_cancel">Annulla</button>
              <button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" id="_ok"
                style="${danger ? 'background:var(--danger);box-shadow:0 3px 12px -2px color-mix(in srgb,var(--danger) 55%,transparent)' : ''}">${confirmText}</button>
            </div>
          </div>
        </div>`;
      const close = v => { root.innerHTML = ''; resolve(v); };
      document.getElementById('_ok').onclick = () => close(true);
      document.getElementById('_cancel').onclick = () => close(false);
      document.getElementById('_scrim').onclick = e => { if (e.target.id === '_scrim') close(false); };
      document.addEventListener('keydown', function esc(ev) {
        if (ev.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); }
      });
    });
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('arrowselect_theme', next); } catch {}
    // repaint canvases in view
    if (App.session && document.getElementById('view-session').classList.contains('active')) App._target();
    if (document.getElementById('view-results').classList.contains('active')) App._results();
  }
};

/* ---------- App ---------- */
const App = {
  session: null, currentShots: [], activeArrow: null, colors: {}, targetType: '122',

  init() {
    console.log('%cArrowSelect build: zoom-touch v8', 'color:#fb923c;font-weight:bold');
    const c = document.getElementById('target-canvas');
    // Touch (mobile) — universal support, no reliance on Pointer Events
    c.addEventListener('touchstart', e => this.onAimStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this.onAimMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this.onAimEnd(e),   { passive: false });
    c.addEventListener('touchcancel', () => this._endAim(), { passive: false });
    // Mouse (desktop)
    c.addEventListener('mousedown', e => this.onAimStart(e));
    c.addEventListener('mousemove', e => this.onAimMove(e));
    c.addEventListener('mouseup',   e => this.onAimEnd(e));
    document.getElementById('s-count').addEventListener('input', () => this._autoArrows());
    document.getElementById('theme-toggle').addEventListener('click', () => UI.toggleTheme());
    window.addEventListener('resize', this._debounce(() => {
      if (this.session && document.getElementById('view-session').classList.contains('active')) this._target();
    }, 150));
    this.renderHome();
    this._registerSW();
  },

  _debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

  _registerSW() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
      // When a new service worker takes control, reload once to pick up fresh code
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true; location.reload();
      });
    }
  },

  _autoArrows() {
    const n = parseInt(document.getElementById('s-count').value) || 0;
    if (n >= 1 && n <= 36) document.getElementById('s-arrows').value = Array.from({ length: n }, (_, i) => i + 1).join(',');
  },

  stepCount(delta) {
    const el = document.getElementById('s-count');
    let v = (parseInt(el.value) || 0) + delta;
    v = Math.max(1, Math.min(36, v));
    el.value = v; this._autoArrows();
  },

  pickTarget(val) {
    this.targetType = val;
    document.querySelectorAll('#s-target-seg button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.val === val)));
  },

  _show(id, title, back) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + id).classList.add('active');
    document.getElementById('hdr-title').innerHTML = title;
    const b = document.getElementById('hdr-back');
    if (back) { b.style.display = 'grid'; b.onclick = back; } else b.style.display = 'none';
    document.getElementById('hdr-actions').innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  },

  // ── HOME ──
  goHome() { this._show('home', 'Arrow<span class="accent">Select</span>', null); this.renderHome(); },

  renderHome() {
    const sessions = DB.load();
    const el = document.getElementById('home-list');
    if (!sessions.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg></div>
          <h3>Ancora nessuna sessione</h3>
          <p>Crea la prima per iniziare a confrontare le tue frecce.</p>
        </div>`;
      return;
    }
    const fmt = d => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    el.innerHTML = `
      <div class="section-label">Sessioni recenti <span class="count">${sessions.length}</span></div>` +
      sessions.slice().reverse().map(s => `
        <div class="session-item">
          <div class="session-body" onclick="App.openSession('${s.id}')">
            <div class="session-title">${this._esc(s.name) || 'Sessione senza nome'}</div>
            <div class="session-sub">
              <span class="meta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>${fmt(s.createdAt)}</span>
              <span class="meta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 22 1-1M15 5l4 4M13 3l8 8"/></svg>${s.arrowNumbers.length} frecce</span>
              <span class="meta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>${s.targetType} cm</span>
              <span class="meta">${s.volleys.length} voleè</span>
            </div>
          </div>
          <button class="del-btn" onclick="App.delSession('${s.id}')" aria-label="Elimina sessione">${ICON.trash}</button>
          <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
        </div>`).join('');
  },

  openSession(id) { const s = DB.load().find(x => x.id === id); if (s) this._startSession(s); },

  async delSession(id) {
    const s = DB.load().find(x => x.id === id);
    const ok = await UI.confirm({
      title: 'Eliminare la sessione?',
      message: `«${this._esc(s && s.name) || 'Sessione senza nome'}» e tutte le sue voleè verranno rimosse. L'azione non è reversibile.`,
      confirmText: 'Elimina'
    });
    if (ok) { DB.del(id); this.renderHome(); UI.toast('Sessione eliminata', 'info'); }
  },

  // ── SETUP ──
  goSetup() {
    this._show('setup', 'Nuova sessione', () => this.goHome());
    this.targetType = '122';
    document.querySelectorAll('#s-target-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.val === '122')));
    this._autoArrows();
  },

  createSession() {
    const name = document.getElementById('s-name').value.trim();
    const n = parseInt(document.getElementById('s-count').value);
    const targetType = parseInt(this.targetType);
    const raw = document.getElementById('s-arrows').value.trim();
    if (!n || n < 1 || n > 36) { UI.toast('Inserisci un numero di frecce tra 1 e 36', 'error'); return; }
    let arrowNumbers = raw ? raw.split(',').map(x => x.trim()).filter(Boolean)
      : Array.from({ length: n }, (_, i) => String(i + 1));
    // dedupe preserving order
    arrowNumbers = [...new Set(arrowNumbers)];
    if (!arrowNumbers.length) { UI.toast('Inserisci almeno una freccia', 'error'); return; }
    const session = { id: Date.now().toString(), name, targetType, arrowNumbers, volleys: [], createdAt: new Date().toISOString() };
    DB.upsert(session);
    this._startSession(session);
    UI.toast('Sessione creata — buon allenamento!', 'success');
  },

  // ── SESSION ──
  _startSession(s) {
    this.session = s; this.currentShots = []; this.activeArrow = null; this.colors = {};
    s.arrowNumbers.forEach((a, i) => { this.colors[a] = PALETTE[i % PALETTE.length]; });
    this._sessionHeader();
    this.renderSession();
  },

  _sessionHeader() {
    const s = this.session;
    this._show('session', this._esc(s.name) || 'Sessione', async () => {
      if (this.currentShots.length) {
        const ok = await UI.confirm({ title: 'Uscire dalla sessione?', message: 'Ci sono tiri non salvati in questa volata. Verranno persi.', confirmText: 'Esci', danger: true });
        if (!ok) return;
      }
      this.goHome();
    });
    document.getElementById('hdr-actions').innerHTML =
      `<button class="header-action" onclick="App.goResults()">Classifica</button>`;
  },

  renderSession() { this._grid(); this._target(); this._stats(); this._history(); this._steps(); },

  _steps() {
    document.getElementById('step-1').classList.toggle('on', !this.activeArrow);
    document.getElementById('step-2').classList.toggle('on', !!this.activeArrow);
  },

  _grid() {
    const placed = new Set(this.currentShots.map(s => s.arrowId));
    document.getElementById('arrows-grid').innerHTML = this.session.arrowNumbers.map(a => {
      const active = this.activeArrow === a, done = placed.has(a);
      const c = this.colors[a];
      let style = `--dot:${c}`, cls = 'arrow-btn';
      if (active) { style += `;background:${c};color:#fff;border-color:${c}`; cls += ' active'; }
      else if (done) { style += `;background:${c}14;color:${c};border-color:${c}66`; cls += ' done'; }
      const shot = this.currentShots.find(s => s.arrowId === a);
      const badge = shot ? `<span class="arrow-score" style="color:${active ? '#fff' : c}">${shot.xRing ? 'X' : shot.score}</span>` : '';
      return `<button class="${cls}" style="${style}" onclick="App.selectArrow('${this._attr(a)}')">${badge}${this._esc(a)}</button>`;
    }).join('');
    document.getElementById('volley-label').textContent = `Volata ${this.session.volleys.length + 1}`;
  },

  selectArrow(a) {
    this.activeArrow = this.activeArrow === a ? null : a;
    this._grid(); this._steps();
    this._hint(this.activeArrow ? `Freccia ${a} · tocca dove ha colpito` : null);
  },

  _hint(msg) {
    const h = document.getElementById('target-hint');
    if (msg) { h.textContent = msg; h.style.opacity = '1'; }
    else { h.textContent = 'Seleziona una freccia, poi tocca il bersaglio'; h.style.opacity = '.7'; }
  },

  // Extract client x/y from a touch or mouse event
  _pt(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  },

  onAimStart(e) {
    // ignore synthetic mouse events that follow a touch
    if (e.type === 'mousedown' && this._touchActive) return;
    if (e.type.startsWith('touch')) this._touchActive = true;
    if (!this.activeArrow) {
      this._hint('Prima seleziona una freccia ☝');
      UI.toast('Seleziona prima una freccia', 'info', 1600);
      return;
    }
    if (e.cancelable) e.preventDefault();
    this._aiming = true;
    this._updateAim(e);
  },

  onAimMove(e) {
    if (!this._aiming) return;
    if (e.cancelable) e.preventDefault();
    this._updateAim(e);
  },

  onAimEnd(e) {
    if (e.type === 'mouseup' && this._touchActive) { this._touchActive = false; return; }
    if (!this._aiming) { this._touchActive = false; return; }
    if (e.cancelable) e.preventDefault();
    this._aiming = false;
    this._touchActive = false;
    const { nx, ny } = this._aimAt(e);
    this._target();                 // redraw at normal zoom
    this._placeShot(nx, ny);
  },

  _endAim() { this._aiming = false; this._touchActive = false; this._target(); },

  // Geometry of the zoomed aim view (all in CSS px, matching drawTarget)
  _aimGeom(e) {
    const canvas = document.getElementById('target-canvas');
    const rect = canvas.getBoundingClientRect();
    const p = this._pt(e);
    const px = p.x - rect.left, py = p.y - rect.top;              // finger, CSS px
    const cx = rect.width / 2, cy = rect.height / 2;
    const R = Math.min(rect.width, rect.height) / 2 - 4;
    const Z = 2.7;                                                 // zoom factor
    const RR = R * Z;
    // anchor the finger's target point under the finger, then zoom around it
    const nfx = (px - cx) / R, nfy = (py - cy) / R;
    const tcx = px - nfx * RR, tcy = py - nfy * RR;
    // aim point sits above the finger so the finger never covers it
    const dy = Math.min(52, R * 0.5);
    const aimX = px, aimY = py - dy;
    return { canvas, cx, cy, R, RR, tcx, tcy, aimX, aimY };
  },

  _aimAt(e) {
    const g = this._aimGeom(e);
    return { nx: (g.aimX - g.tcx) / g.RR, ny: (g.aimY - g.tcy) / g.RR };
  },

  // Enlarge the whole target under the finger while aiming
  _updateAim(e) {
    const g = this._aimGeom(e);
    drawTarget(g.canvas,
      this.session.volleys.flatMap(v => v.shots), this.currentShots, this.colors,
      { tcx: g.tcx, tcy: g.tcy, RR: g.RR, aim: true, aimX: g.aimX, aimY: g.aimY,
        color: this.colors[this.activeArrow] || '#222', label: this.activeArrow });
    this._hint(`Freccia ${this.activeArrow} · muovi e rilascia per confermare`);
  },

  _placeShot(nx, ny) {
    if (Math.hypot(nx, ny) > 1.15) { this._hint('Tocca dentro il bersaglio'); return; }
    const arrow = this.activeArrow;
    this.currentShots = this.currentShots.filter(s => s.arrowId !== arrow);
    this.currentShots.push({ arrowId: arrow, nx, ny, score: getScore(nx, ny), xRing: isX(nx, ny) });
    const placed = new Set(this.currentShots.map(s => s.arrowId));
    this.activeArrow = this.session.arrowNumbers.find(a => !placed.has(a)) || null;
    this._target(); this._grid(); this._steps();
    if (this.activeArrow) this._hint(`Freccia ${this.activeArrow} · tocca dove ha colpito`);
    else this._hint('Tutte posizionate — salva la volata ✓');
  },

  _target() {
    drawTarget(document.getElementById('target-canvas'),
      this.session.volleys.flatMap(v => v.shots), this.currentShots, this.colors);
  },

  undoShot() {
    if (!this.currentShots.length) { UI.toast('Niente da annullare', 'info', 1400); return; }
    const last = this.currentShots.pop();
    this.activeArrow = last.arrowId;
    this._target(); this._grid(); this._steps();
    this._hint(`Freccia ${this.activeArrow} · tocca dove ha colpito`);
  },

  saveVolley() {
    if (!this.currentShots.length) { UI.toast('Nessun tiro da salvare', 'error'); return; }
    this.session.volleys.push({ id: Date.now().toString(), shots: [...this.currentShots], at: new Date().toISOString() });
    DB.upsert(this.session);
    const n = this.currentShots.length;
    this.currentShots = []; this.activeArrow = null;
    this._hint(null);
    this.renderSession();
    UI.toast(`Volata salvata (${n} ${n === 1 ? 'tiro' : 'tiri'})`, 'success');
  },

  _stats() {
    const vs = this.session.volleys;
    const n = vs.reduce((s, v) => s + v.shots.length, 0);
    const tot = vs.reduce((s, v) => s + v.shots.reduce((ss, sh) => ss + sh.score, 0), 0);
    document.getElementById('st-volleys').textContent = vs.length;
    document.getElementById('st-shots').textContent = n;
    document.getElementById('st-avg').textContent = n ? (tot / n).toFixed(1) : '–';
  },

  _history() {
    const el = document.getElementById('volley-hist');
    const vs = this.session.volleys;
    if (!vs.length) {
      el.innerHTML = `<p style="color:var(--muted);font-size:0.86rem;padding:0.4rem 0">Nessuna volata ancora. Posiziona le frecce e salva.</p>`;
      return;
    }
    el.innerHTML = vs.slice().reverse().map((v, i) => {
      const tot = v.shots.reduce((s, sh) => s + sh.score, 0);
      const pills = v.shots.map(sh => {
        const c = this.colors[sh.arrowId] || '#666';
        return `<span class="pill" style="background:${c}15;color:${c};border-color:${c}44">${this._esc(sh.arrowId)}:${sh.xRing ? 'X' : sh.score}</span>`;
      }).join('');
      return `<div class="volley-item">
        <div class="volley-head"><strong>Volata ${vs.length - i}</strong><span class="volley-tot">Tot. ${tot}</span></div>
        <div class="pills">${pills}</div></div>`;
    }).join('');
  },

  // ── RESULTS ──
  _backToSession() { this._sessionHeader(); this.renderSession(); },

  goResults() {
    if (!this.session) return;
    this._show('results', `Classifica`, () => this._backToSession());
    document.getElementById('hdr-actions').innerHTML =
      `<button class="header-action" onclick="App.exportSession()" aria-label="Esporta">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M12 15V3M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
       </button>
       <button class="header-action" onclick="App._backToSession()">Sessione</button>`;
    this._results();
  },

  _results() {
    const list = document.getElementById('results-list');
    const overview = document.getElementById('results-overview');
    if (!this.session.volleys.length) {
      overview.innerHTML = '';
      list.innerHTML = `<div class="empty">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/></svg></div>
        <h3>Nessun dato da mostrare</h3><p>Salva almeno una volata per vedere la classifica.</p></div>`;
      return;
    }

    const stats = computeStats(this.session);
    const withShots = stats.filter(s => s.n > 1);
    const maxSpread = withShots.length ? Math.max(...withShots.map(s => s.spread)) : 1;

    // overview / winner
    const best = stats.find(s => s.n >= 2) || stats.find(s => s.n >= 1);
    if (best) {
      overview.innerHTML = `<div class="overview-card">
        <div class="overview-title">Freccia consigliata</div>
        <div class="overview-winner">
          <span class="winner-medal">🥇</span>
          <div>
            <div class="winner-name">Freccia ${this._esc(best.arrowId)}</div>
            <div class="winner-sub">${best.n >= 2 ? `rosata σ ${best.spreadCm} cm · media ${best.avg.toFixed(1)} pt` : `${best.n} tiro registrato`}</div>
          </div>
        </div>
      </div>`;
    }

    list.innerHTML = stats.map((s, i) => {
      const rankCls = ['rank-1','rank-2','rank-3'][i] || 'rank-n';
      const color = this.colors[s.arrowId] || '#666';
      const cid = `rc-${this._safeId(s.arrowId)}`;
      const spreadLabel = s.n === 0 ? '–' : s.n === 1 ? 'N/D' : `${s.spreadCm} cm`;
      const spreadSub = s.n >= 2 ? `${s.n} tiri · σ ${s.spreadCm} cm${s.xCount ? ` · ${s.xCount}× X` : ''}`
        : s.n === 1 ? '1 tiro registrato' : 'Nessun tiro';
      const barW = (s.n >= 2 && maxSpread > 0) ? Math.round((s.spread / maxSpread) * 100) : 0;
      const avgLabel = s.n ? s.avg.toFixed(2) : '–';

      return `<div class="result-card ${i === 0 ? 'top' : ''}" style="border-top:4px solid ${color}">
        <div class="result-header">
          <div class="rank-badge ${rankCls}">${i + 1}</div>
          <div>
            <div class="result-arrow-label" style="color:${color}">Freccia ${this._esc(s.arrowId)}</div>
            <div class="result-sub">${spreadSub}</div>
          </div>
          <div class="result-avg-pill" style="background:${color}">${avgLabel} pt</div>
        </div>
        <div class="result-body">
          <div class="rosata-section">
            ${s.n > 0 ? `<canvas id="${cid}" width="130" height="130" class="rosata-canvas"></canvas>`
                      : `<div class="no-data-rosata">Nessun<br>tiro</div>`}
            <div class="rosata-cap">
              <div class="rosata-label">Rosata σ</div>
              <div class="rosata-sigma" style="color:${color}">${spreadLabel}</div>
            </div>
          </div>
          <div class="result-divider"></div>
          <div class="result-stats-section">
            <div class="stat-row-item"><div class="stat-row-label">Punteggio medio</div><div class="stat-row-value">${avgLabel} <span style="font-size:0.7rem;color:var(--muted);font-weight:600">pt</span></div></div>
            <div class="stat-row-item"><div class="stat-row-label">Tiri · centri X</div><div class="stat-row-value">${s.n} · ${s.xCount}</div></div>
            ${s.n >= 2 ? `<div class="stat-row-item">
              <div class="stat-row-label">Ampiezza rosata</div>
              <div class="spread-bar-track"><div class="spread-bar-fill" style="width:${barW}%;background:${color}"></div></div>
              <div class="spread-legend"><span>più stretta</span><span>più larga</span></div>
            </div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    requestAnimationFrame(() => {
      stats.forEach(s => {
        if (s.n === 0) return;
        const c = document.getElementById(`rc-${this._safeId(s.arrowId)}`);
        if (c) drawRosata(c, s.shots, this.colors[s.arrowId] || '#333', s.spread);
      });
    });
  },

  exportSession() {
    if (!this.session) return;
    const blob = new Blob([JSON.stringify(this.session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (this.session.name || 'sessione').replace(/[^\w\-]+/g, '_').slice(0, 40);
    a.href = url; a.download = `arrowselect_${safe}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('Dati esportati in JSON', 'success');
  },

  // ── utils ──
  _esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _attr(v) { return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); },
  _safeId(v) { return String(v).replace(/[^a-z0-9]/gi, '_'); }
};

document.addEventListener('DOMContentLoaded', () => App.init());
