import { getSpendingLog, getSpendingSummary, isLocked, getLockoutRemaining } from './responsibleGambling.js';

let modalEl      = null;
let pollId       = null;

export function openSpendingChart() {
  if (modalEl) { refresh(); return; }

  modalEl = document.createElement('div');
  modalEl.className = 'chart-modal-overlay';
  modalEl.innerHTML = `
    <div class="chart-modal">
      <div class="chart-modal-header">
        <span class="chart-modal-title">📊 MY SESSION</span>
        <button class="btn btn-ghost chart-close-btn" id="chart-close">✕</button>
      </div>
      <div class="cooling-off-banner hidden" id="cooling-banner">
        🛑 COOLING OFF <span id="cooling-countdown" class="cooling-countdown"></span>
      </div>
      <div class="chart-section">
        <div class="chart-label muted">BALANCE OVER TIME</div>
        <canvas id="canvas-balance" width="520" height="180"></canvas>
      </div>
      <div class="chart-section">
        <div class="chart-label muted">WAGERED vs RETURNED</div>
        <canvas id="canvas-wager" width="520" height="100"></canvas>
      </div>
      <div class="stats-row" id="stats-row">—</div>
    </div>
  `;

  document.body.appendChild(modalEl);

  document.getElementById('chart-close').addEventListener('click', () => {
    if (!isLocked()) closeSpendingChart();
  });

  modalEl.addEventListener('click', e => {
    if (e.target === modalEl && !isLocked()) closeSpendingChart();
  });

  refresh();
  startPoll();
}

export function closeSpendingChart() {
  if (isLocked()) return;
  if (pollId) { clearInterval(pollId); pollId = null; }
  modalEl?.remove();
  modalEl = null;
}

function refresh() {
  if (!modalEl) return;
  drawBalance(document.getElementById('canvas-balance'), getSpendingLog());
  drawWager(document.getElementById('canvas-wager'), getSpendingSummary());
  drawStats(document.getElementById('stats-row'), getSpendingSummary());
  updateLockUI();
}

function startPoll() {
  if (pollId) return;
  pollId = setInterval(() => {
    updateLockUI();
    if (!isLocked() && pollId) { clearInterval(pollId); pollId = null; }
  }, 500);
}

function updateLockUI() {
  if (!modalEl) return;
  const banner    = document.getElementById('cooling-banner');
  const countdown = document.getElementById('cooling-countdown');
  const closeBtn  = document.getElementById('chart-close');
  if (isLocked()) {
    banner.classList.remove('hidden');
    countdown.textContent = `${getLockoutRemaining()}s remaining`;
    closeBtn.disabled = true; closeBtn.style.opacity = '0.3';
  } else {
    banner.classList.add('hidden');
    closeBtn.disabled = false; closeBtn.style.opacity = '';
  }
}

function drawBalance(canvas, log) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const P = { top: 16, right: 16, bottom: 28, left: 56 };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12121a'; ctx.fillRect(0, 0, W, H);

  if (!log.length) {
    ctx.fillStyle = '#6b7280'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('No rounds yet', W/2, H/2); return;
  }

  const vals = log.map(r => r.runningBalance);
  const min  = Math.min(0, ...vals), max = Math.max(0, ...vals), range = max - min || 1;
  const cW = W - P.left - P.right, cH = H - P.top - P.bottom;
  const toX = i => P.left + (i / Math.max(1, log.length-1)) * cW;
  const toY = v => P.top + ((max - v) / range) * cH;

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = toY(min + range * g / 4);
    ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(W-P.right, y); ctx.stroke();
    ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText((min + range * g / 4).toFixed(0), P.left - 6, y + 4);
  }

  // zero line
  if (min <= 0 && max >= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(P.left, toY(0)); ctx.lineTo(W-P.right, toY(0)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // fill
  ctx.beginPath();
  log.forEach((r, i) => i === 0 ? ctx.moveTo(toX(i), toY(r.runningBalance)) : ctx.lineTo(toX(i), toY(r.runningBalance)));
  ctx.lineTo(toX(log.length-1), toY(0)); ctx.lineTo(toX(0), toY(0)); ctx.closePath();
  const g = ctx.createLinearGradient(0, P.top, 0, H-P.bottom);
  g.addColorStop(0, 'rgba(34,197,94,0.3)'); g.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = g; ctx.fill();

  // line
  ctx.beginPath();
  log.forEach((r, i) => i === 0 ? ctx.moveTo(toX(i), toY(r.runningBalance)) : ctx.lineTo(toX(i), toY(r.runningBalance)));
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  if (log.length <= 40) {
    log.forEach((r, i) => {
      ctx.beginPath(); ctx.arc(toX(i), toY(r.runningBalance), 3, 0, Math.PI*2);
      ctx.fillStyle = r.runningBalance >= 0 ? '#22c55e' : '#ef4444'; ctx.fill();
    });
  }
}

function drawWager(canvas, { totalWagered, totalReturned }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const P = { top: 14, right: 16, bottom: 14, left: 110 };
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#12121a'; ctx.fillRect(0, 0, W, H);

  const max = Math.max(totalWagered, totalReturned, 1);
  const cW  = W - P.left - P.right;
  const toW = v => (v / max) * cW;
  const bars = [{ label: 'WAGERED', value: totalWagered, color: '#a855f7' }, { label: 'RETURNED', value: totalReturned, color: '#22c55e' }];

  bars.forEach(({ label, value, color }, i) => {
    const y = P.top + i * 34;
    ctx.fillStyle = '#6b7280'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText(label, P.left - 8, y + 14);

    // track
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); roundRect(ctx, P.left, y, cW, 20, 4); ctx.fill();

    // fill
    const fw = toW(value);
    if (fw > 0) { ctx.fillStyle = color; ctx.beginPath(); roundRect(ctx, P.left, y, fw, 20, 4); ctx.fill(); }

    ctx.fillStyle = '#e5e7eb'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(value.toLocaleString(), P.left + fw + 6, y + 14);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
}

function drawStats(el, { roundsPlayed, totalWagered, netProfit, sessionRTP }) {
  const netStr   = netProfit >= 0 ? `+${netProfit}` : `${netProfit}`;
  const netColor = netProfit >= 0 ? '#22c55e' : '#ef4444';
  el.innerHTML = `<span>Rounds: <strong>${roundsPlayed}</strong></span> · <span>Wagered: <strong>${totalWagered.toLocaleString()}</strong></span> · <span>Net: <strong style="color:${netColor}">${netStr}</strong></span> · <span>RTP: <strong>${sessionRTP.toFixed(1)}%</strong></span>`;
}

window.addEventListener('voyanabet:open-chart', openSpendingChart);
