// main.js — full game logic with two-layer tiled ruins background, auth, PBKDF2,
// world/scrolling/platforms, and a one-time per-player story intro overlay.

const particlesCanvas = document.getElementById('bg');
const gameCanvas = document.getElementById('game');
const pctx = particlesCanvas.getContext('2d', { alpha: true });
const gctx = gameCanvas.getContext('2d', { alpha: true });

let W = 0, H = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
let inGame = false;

let ruinsImg = null;
let ruinsLoaded = false;

let gasImg = null;
let gasPattern = null;
const GAS_TILE = 512;      // on-screen tile size for the poison-gas texture

// cave background state (levels 2 & 3)
let caveImg = null;
let caveLoaded = false;
let cavePattern = null;
let cavePatternWidth = 0;
const CAVE_BG_PARALLAX = 0.5;  // background scrolls slightly slower than the foreground (1.0)

// Two-layer pattern state (far / near)
let farPattern = null, nearPattern = null;
let farPatternWidth = 0, nearPatternWidth = 0;
let farParallax = 0.12, nearParallax = 0.55;
let farVerticalOffset = -80;
let nearVerticalOffset = 40;
let farScaleFactor = 0.56;
let nearScaleFactor = 1.05;

function resizeCanvases() {
  dpr = Math.max(1, window.devicePixelRatio || 1);
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);

  particlesCanvas.width = W * dpr;
  particlesCanvas.height = H * dpr;
  particlesCanvas.style.width = W + 'px';
  particlesCanvas.style.height = H + 'px';
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gameCanvas.width = W * dpr;
  gameCanvas.height = H * dpr;
  gameCanvas.style.width = W + 'px';
  gameCanvas.style.height = H + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (ruinsLoaded) createTwoLayerPatterns();
  if (caveLoaded) createCavePattern();
}
window.addEventListener('resize', () => {
  resizeCanvases();
  initParticles();
}, { passive: true });
resizeCanvases();

// Load ruins image (place your provided image at assets/ruins.png)
function loadRuinsImage() {
  ruinsImg = new Image();
  ruinsImg.src = 'assets/ruins.png';
  ruinsImg.onload = () => { ruinsLoaded = true; createTwoLayerPatterns(); console.log('Ruins image loaded.'); };
  ruinsImg.onerror = (e) => { ruinsLoaded = false; console.warn('Could not load assets/ruins.png', e); };
}
loadRuinsImage();

// Load the poison-gas image (renders the gas wall as a tiled texture instead of a gradient).
function loadGasImage() {
  gasImg = new Image();
  gasImg.src = encodeURI('assets/posioned gas.png'); // filename contains a space
  gasImg.onload = () => {
    const tile = document.createElement('canvas');
    tile.width = GAS_TILE;
    tile.height = GAS_TILE;
    const tc = tile.getContext('2d');
    tc.drawImage(gasImg, 0, 0, GAS_TILE, GAS_TILE);
    gasPattern = gctx.createPattern(tile, 'repeat');
    console.log('Gas image loaded.');
  };
  gasImg.onerror = (e) => { gasPattern = null; console.warn('Could not load assets/posioned gas.png', e); };
}
loadGasImage();

// Load the cave background image (used for levels 2 & 3: cave + level2).
function loadCaveImage() {
  caveImg = new Image();
  caveImg.src = 'assets/cave.png';
  caveImg.onload = () => { caveLoaded = true; createCavePattern(); console.log('Cave image loaded.'); };
  caveImg.onerror = () => { caveLoaded = false; cavePattern = null; console.warn('Could not load assets/cave.png'); };
}
loadCaveImage();

// Build a horizontally-seamless (mirrored) cave tile scaled to the screen height.
function createCavePattern() {
  if (!caveLoaded || !caveImg) { cavePattern = null; cavePatternWidth = 0; return; }
  const scale = H / caveImg.height;
  const imgW = Math.max(1, Math.round(caveImg.width * scale));
  const imgH = Math.max(1, Math.round(caveImg.height * scale));
  const y = Math.round((H - imgH) / 2);
  cavePattern = pctx.createPattern(makeSeamlessTile(caveImg, imgW, imgH, y), 'repeat-x');
  cavePatternWidth = imgW * 2;
}

function createTwoLayerPatterns() {
  if (!ruinsLoaded || !ruinsImg) { farPattern = nearPattern = null; farPatternWidth = nearPatternWidth = 0; return; }

  // FAR layer (distant)
  const farScale = (H * farScaleFactor) / ruinsImg.height;
  const farImgW = Math.max(1, Math.round(ruinsImg.width * farScale));
  const farImgH = Math.max(1, Math.round(ruinsImg.height * farScale));
  const farY = Math.round((H - farImgH) / 2 + farVerticalOffset);
  farPattern = pctx.createPattern(makeSeamlessTile(ruinsImg, farImgW, farImgH, farY), 'repeat-x');
  farPatternWidth = farImgW * 2;

  // NEAR layer (closer)
  const nearScale = (H * nearScaleFactor) / ruinsImg.height;
  const nearImgW = Math.max(1, Math.round(ruinsImg.width * nearScale));
  const nearImgH = Math.max(1, Math.round(ruinsImg.height * nearScale));
  const nearY = Math.round((H - nearImgH) / 2 + nearVerticalOffset);
  nearPattern = pctx.createPattern(makeSeamlessTile(ruinsImg, nearImgW, nearImgH, nearY), 'repeat-x');
  nearPatternWidth = nearImgW * 2;
}

// Build a horizontally-seamless tile: [normal image] + [horizontally-mirrored image].
// Both outer edges are the image's own left edge, so repeated tiles always match
// and the black seam between repeats disappears.
function makeSeamlessTile(img, imgW, imgH, y) {
  const c = document.createElement('canvas');
  c.width = imgW * 2;
  c.height = H;
  const cc = c.getContext('2d');
  // normal copy
  cc.drawImage(img, 0, 0, img.width, img.height, 0, y, imgW, imgH);
  // mirrored copy
  cc.save();
  cc.translate(imgW * 2, 0);
  cc.scale(-1, 1);
  cc.drawImage(img, 0, 0, img.width, img.height, 0, y, imgW, imgH);
  cc.restore();
  return c;
}

function drawFallbackRuins(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0a10');
  g.addColorStop(1, '#050505');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,12,16,0.92)';
  ctx.fillRect(0, Math.floor(H * 0.6), W, Math.floor(H * 0.25));
}

function drawTwoLayerBackground(ctx, cameraX) {
  if (!farPattern || !nearPattern) {
    drawFallbackRuins(ctx);
    return;
  }

  // FAR layer (behind)
  const farOffset = -Math.round(cameraX * farParallax) % farPatternWidth;
  let ftx = farOffset;
  if (ftx > 0) ftx -= farPatternWidth;
  ctx.save();
  ctx.translate(ftx, 0);
  ctx.globalAlpha = 0.48;
  ctx.fillStyle = farPattern;
  ctx.fillRect(-farPatternWidth, 0, W + farPatternWidth * 2, H);
  ctx.restore();

  // subtle dark band to separate layers
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, H * 0.42, W, H * 0.2);
  ctx.restore();

  // NEAR layer (in front)
  const nearOffset = -Math.round(cameraX * nearParallax) % nearPatternWidth;
  let ntx = nearOffset;
  if (ntx > 0) ntx -= nearPatternWidth;
  ctx.save();
  ctx.translate(ntx, 0);
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = nearPattern;
  ctx.fillRect(-nearPatternWidth, 0, W + nearPatternWidth * 2, H);
  ctx.restore();

  // top fog to blend
  const fog = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  fog.addColorStop(0, 'rgba(10,10,12,0.85)');
  fog.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, W, H * 0.45);
}

function drawBlackBackground(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
}

// Plain interior background for the cave scene (no ruins; will be customized later).
function drawCaveBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c0c12');
  g.addColorStop(1, '#050507');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Draw the cave/level2 background as a parallax layer that scrolls slightly slower than the foreground.
function drawCaveParallax(ctx) {
  if (!cavePattern) { drawCaveBackground(ctx); return; }
  const cameraX = (window.DeepestGame && window.DeepestGame.cameraX) || 0;
  const offset = -Math.round(cameraX * CAVE_BG_PARALLAX) % cavePatternWidth;
  let tx = offset;
  if (tx > 0) tx -= cavePatternWidth;
  ctx.save();
  ctx.translate(tx, 0);
  ctx.fillStyle = cavePattern;
  ctx.fillRect(-cavePatternWidth, 0, W + cavePatternWidth * 2, H);
  ctx.restore();
}

// ----------------- Particles (pre-game only) -----------------
function rand(min, max) { return Math.random() * (max - min) + min; }
let particles = [];
function createParticle() {
  return {
    x: rand(0, W),
    y: rand(0, H),
    size: rand(0.6, 2.6),
    speed: rand(0.2, 0.9),
    drift: rand(-0.15, 0.15),
    life: rand(0, Math.PI * 2),
    alpha: rand(0.2, 0.95)
  };
}
function initParticles() {
  particles = [];
  const baseCount = Math.round(Math.min(220, Math.max(60, (W * H) / 120000)));
  for (let i = 0; i < baseCount; i++) particles.push(createParticle());
}
initParticles();

let plast = performance.now();
function particlesLoop(now) {
  const dt = (now - plast) / 16.6667; plast = now;

  if (inGame) {
    // in-game: ruins background in the chase scene, plain background in the cave
    const scene = (window.DeepestGame && window.DeepestGame.scene) || 'chase';
    if (scene === 'cave' || scene === 'level2') {
      drawCaveParallax(pctx);
    } else {
      const cameraX = (window.DeepestGame && window.DeepestGame.cameraX) || 0;
      drawTwoLayerBackground(pctx, cameraX);
    }
  } else {
    // pre-game: black + particles
    drawBlackBackground(pctx);
    for (let p of particles) {
      p.y -= p.speed * dt;
      p.x += p.drift * dt + Math.sin((p.y + p.life) * 0.01) * 0.05;
      p.life += 0.02 * dt;
      if (p.y < -10) {
        p.y = H + rand(0, 20);
        p.x = rand(0, W);
        p.size = rand(0.6, 2.6);
        p.speed = rand(0.2, 0.9);
        p.drift = rand(-0.15, 0.15);
        p.alpha = rand(0.2, 0.95);
      }
      const twinkle = 0.5 + Math.sin(p.life) * 0.5;
      pctx.beginPath();
      pctx.fillStyle = 'rgba(255,255,255,' + (p.alpha * twinkle) + ')';
      pctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pctx.fill();
    }
  }

  requestAnimationFrame(particlesLoop);
}
requestAnimationFrame(particlesLoop);

// ----------------- Intro story overlay (one-time per player) -----------------
function introStorageKeyFor(name) {
  return 'deepest_seen_intro_' + (name ? (name.trim().toLowerCase()) : 'anonymous');
}
function hasSeenIntro(name) {
  try {
    return !!localStorage.getItem(introStorageKeyFor(name));
  } catch (e) {
    return false;
  }
}
function setSeenIntro(name) {
  try {
    localStorage.setItem(introStorageKeyFor(name), '1');
  } catch (e) { }
}

// create and show the intro overlay, return a Promise resolved when user continues
// Replace the old showIntroOverlay(...) with this function.
function showIntroOverlay(playerName) {
  return new Promise((resolve) => {
    const sentences = [
      'The year 3058 saw a great disaster sweeping across the Earth.',
      'A monster appeared.',
      'It used a mysterious gas to kill and infect thousands of people.',
      'Some survivors began to escape, and you were one of them...'
    ];

    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.78)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.padding = '24px';
    overlay.style.boxSizing = 'border-box';

    const card = document.createElement('div');
    card.style.maxWidth = '860px';
    card.style.width = '100%';
    card.style.background = 'linear-gradient(180deg, rgba(18,18,20,0.98), rgba(12,12,14,0.98))';
    card.style.border = '1px solid rgba(255,255,255,0.04)';
    card.style.borderRadius = '12px';
    card.style.padding = '28px';
    card.style.color = '#fff';
    card.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    card.style.boxShadow = '0 10px 40px rgba(0,0,0,0.6)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Prologue';
    title.style.margin = '0';
    title.style.fontSize = '20px';
    title.style.letterSpacing = '0.02em';

    // Sentence container
    const storyWrap = document.createElement('div');
    storyWrap.style.minHeight = '120px';
    storyWrap.style.display = 'flex';
    storyWrap.style.flexDirection = 'column';
    storyWrap.style.justifyContent = 'center';
    storyWrap.style.fontSize = '18px';
    storyWrap.style.lineHeight = '1.6';
    storyWrap.style.color = '#e8e8e8';
    storyWrap.style.padding = '8px 2px';

    // one sentence element (we reuse and animate it)
    const sentenceEl = document.createElement('div');
    sentenceEl.style.opacity = '0';
    sentenceEl.style.transition = 'opacity 420ms ease, transform 420ms cubic-bezier(.2,.9,.2,1)';
    sentenceEl.style.transform = 'translateY(8px)';
    sentenceEl.style.textAlign = 'left';
    storyWrap.appendChild(sentenceEl);

    // hint / small note
    const note = document.createElement('div');
    note.style.fontSize = '13px';
    note.style.color = '#cfcfcf';
    note.textContent = 'Click / tap to fast-forward, Enter to advance, or Esc to skip.';

    // buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '12px';
    btnRow.style.justifyContent = 'flex-end';

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.background = 'transparent';
    skipBtn.style.color = '#ddd';
    skipBtn.style.border = '1px solid rgba(255,255,255,0.06)';
    skipBtn.style.padding = '10px 14px';
    skipBtn.style.borderRadius = '8px';
    skipBtn.style.cursor = 'pointer';
    skipBtn.style.fontSize = '14px';

    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue';
    continueBtn.style.background = '#6e6e6e';
    continueBtn.style.color = '#fff';
    continueBtn.style.border = 'none';
    continueBtn.style.padding = '10px 14px';
    continueBtn.style.borderRadius = '8px';
    continueBtn.style.cursor = 'pointer';
    continueBtn.style.fontSize = '14px';
    continueBtn.disabled = true;
    continueBtn.style.opacity = '0.6';

    btnRow.appendChild(skipBtn);
    btnRow.appendChild(continueBtn);

    card.appendChild(title);
    card.appendChild(storyWrap);
    card.appendChild(note);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // state
    let idx = 0;
    let timer = null;
    let autoAdvanceDelay = 1700; // ms per sentence
    let finished = false;

    function showSentence(i, immediate = false) {
      if (i < 0 || i >= sentences.length) return;
      sentenceEl.style.transition = immediate ? 'none' : 'opacity 420ms ease, transform 420ms cubic-bezier(.2,.9,.2,1)';
      sentenceEl.style.opacity = '0';
      sentenceEl.style.transform = 'translateY(8px)';
      // small timeout to allow transition removal to apply (for immediate)
      setTimeout(() => {
        sentenceEl.textContent = sentences[i];
        // trigger entrance
        requestAnimationFrame(() => {
          sentenceEl.style.opacity = '1';
          sentenceEl.style.transform = 'translateY(0)';
        });
      }, 8);

      // clear existing timer
      if (timer) { clearTimeout(timer); timer = null; }

      // schedule auto-advance to next sentence or enable Continue if last
      if (i < sentences.length - 1) {
        timer = setTimeout(() => {
          idx++;
          showSentence(idx);
        }, immediate ? 300 : autoAdvanceDelay);
      } else {
        // last sentence: enable Continue after a short pause
        timer = setTimeout(() => {
          continueBtn.disabled = false;
          continueBtn.style.opacity = '1';
          finished = true;
          continueBtn.focus();
        }, immediate ? 300 : 900);
      }
    }

    // advance to next (user triggered)
    function advance() {
      if (idx < sentences.length - 1) {
        idx++;
        showSentence(idx, true);
      } else {
        // last -> same as continue
        onContinue();
      }
    }

    function onSkip() {
      cleanup(false);
    }
    function onContinue() {
      cleanup(true);
    }

    function cleanup(saveSeen) {
      // stop timers and listeners
      if (timer) { clearTimeout(timer); timer = null; }
      window.removeEventListener('keydown', keyHandler);
      overlay.remove();
      if (saveSeen) setSeenIntro(playerName);
      resolve();
    }

    // keyboard handlers
    const keyHandler = (e) => {
      if (e.key === 'Enter') {
        // if Continue enabled, accept; otherwise advance
        if (finished) onContinue();
        else advance();
      } else if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === ' ') {
        // prevent page scroll when overlay active
        e.preventDefault();
        if (finished) onContinue();
        else advance();
      }
    };
    window.addEventListener('keydown', keyHandler, { passive: false });

    // click/tap to advance quickly
    overlay.addEventListener('click', (ev) => {
      // don't trigger when clicking buttons
      if (ev.target === continueBtn || ev.target === skipBtn) return;
      if (finished) return; // wait for continue
      advance();
    }, { passive: true });

    // button handlers
    skipBtn.addEventListener('click', onSkip);
    continueBtn.addEventListener('click', onContinue);

    // start sequence
    showSentence(0);
  });
}

// ----------------- Auth (PBKDF2) and UI (unchanged structure) -----------------
const startOverlay = document.getElementById('startOverlay');
const authPanel = document.getElementById('authPanel');
const authContent = document.getElementById('authContent');

let started = false;
function showAuthMenu() {
  authContent.innerHTML = `
    <h2 id="authTitle" style="margin:0">Welcome</h2>
    <div class="row">
      <div class="note">Choose an option to continue</div>
      <div class="btn-row" style="margin-top:14px">
        <button id="btnLogin" class="gray">Login</button>
        <button id="btnRegister" class="gray">Register</button>
      </div>
    </div>
  `;
  authPanel.classList.remove('hidden');
  authPanel.setAttribute('aria-hidden', 'false');

  document.getElementById('btnLogin').addEventListener('click', showLoginForm);
  document.getElementById('btnRegister').addEventListener('click', showRegisterForm);
}

function fadeOutStartOverlay() {
  startOverlay.classList.add('fade-out');
  startOverlay.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    if (startOverlay.parentNode) startOverlay.parentNode.removeChild(startOverlay);
  }, 700);
}

async function startPressed() {
  if (started) return;
  started = true;
  fadeOutStartOverlay();
  const saved = localStorage.getItem(CURRENT_KEY);
  if (saved) {
    // 已登录：拉取云端装备/进度后直接进入游戏，保持登录状态。
    if (authPanel && authPanel.parentNode) authPanel.parentNode.removeChild(authPanel);
    const prog = await loadServerProgress(saved);
    applyServerProgress(saved, prog);
    await loadAdminStatus(saved);
    initGame(saved);
    showLogoutButton();
  } else {
    showAuthMenu();
  }
}
window.addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Space' || e.key === ' ' || e.keyCode === 32)) {
    e.preventDefault();
    startPressed();
  }
}, { passive: false });
startOverlay.addEventListener('click', startPressed);
startOverlay.addEventListener('touchstart', (ev) => { ev.preventDefault(); startPressed(); }, { passive: false });

// storage & PBKDF2 helpers
const STORAGE_KEY = 'deepest_players';
const CURRENT_KEY = 'deepest_current';
const DEFAULT_PBKDF2_ITERATIONS = 100000;

function loadPlayers() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { console.warn(e); return {}; } }
function savePlayers(map) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (e) { console.error(e); } }
function setCurrentPlayer(name) { try { localStorage.setItem(CURRENT_KEY, name); } catch (e) { } }

// 退出登录：清除当前账号并刷新回登录界面（需重新登录）。
function logout() {
  try { if (typeof gameState !== 'undefined' && gameState) savePlayerInfo(gameState); } catch (e) {}
  try { localStorage.removeItem(CURRENT_KEY); } catch (e) {}
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.remove();
  const ab = document.getElementById('adminBtn');
  if (ab) ab.remove();
  location.reload();
}

// ----------------- Admin panel (managers only) -----------------
function showAdminButton() {
  if (!gameState || !gameState.isAdmin) return;
  let btn = document.getElementById('adminBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'adminBtn';
    btn.textContent = '管理面板';
    btn.style.cssText = 'position:fixed;top:12px;right:116px;z-index:9999;padding:8px 14px;border:none;border-radius:8px;background:#2c3e50;color:#fff;font:14px sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)';
    btn.addEventListener('click', openAdminPanel);
    document.body.appendChild(btn);
  }
  btn.style.display = 'block';
}

// 以管理员身份调用 /api/admin。
async function adminApi(action, payload) {
  const body = Object.assign({ caller: normalizeName(gameState.player.name), hash: _sessionHash, action }, payload || {});
  try {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json().catch(() => ({}));
  } catch (e) { return { error: String(e) }; }
}

async function openAdminPanel() {
  if (!gameState || !gameState.isAdmin) return;
  if (!(await backendAvailable())) { alert('需要后端服务才能管理用户。'); return; }
  let overlay = document.getElementById('adminOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adminOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
    overlay.innerHTML = '<div style="background:#fff;color:#111;border-radius:12px;width:min(460px,92vw);max-height:86vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.35)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #eee">' +
      '<h3 style="margin:0">用户管理</h3>' +
      '<button id="adminClose" style="border:none;background:#eee;border-radius:8px;padding:6px 12px;cursor:pointer">关闭</button></div>' +
      '<div id="adminUserList" style="padding:6px 18px 18px"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAdminPanel(); });
    document.getElementById('adminClose').addEventListener('click', closeAdminPanel);
  }
  overlay.style.display = 'flex';
  const listEl = document.getElementById('adminUserList');
  listEl.innerHTML = '<div style="padding:18px;color:#666">加载中…</div>';
  const data = await adminApi('list', {});
  if (!data.users) { listEl.innerHTML = '<div style="padding:18px;color:#c0392b">加载失败：' + (data.error || '未知错误') + '</div>'; return; }
  renderAdminList(data.users);
}

function renderAdminList(users) {
  const listEl = document.getElementById('adminUserList');
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const u of users) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid #eee';
    const name = document.createElement('div');
    name.style.cssText = 'flex:1;font-weight:600';
    name.textContent = u.displayName + (u.isAdmin ? ' （管理员）' : '');
    const adminToggle = document.createElement('button');
    adminToggle.textContent = u.isAdmin ? '取消管理员' : '设为管理员';
    adminToggle.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:' + (u.isAdmin ? '#7f8c8d' : '#27ae60') + ';color:#fff;cursor:pointer';
    adminToggle.addEventListener('click', async () => {
      const r = await adminApi('setAdmin', { target: u.name, value: u.isAdmin ? 0 : 1 });
      if (r.ok) renderAdminListAfterRefresh(); else alert('操作失败：' + (r.error || '未知错误'));
    });
    const reset = document.createElement('button');
    reset.textContent = '重置密码';
    reset.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:#2980b9;color:#fff;cursor:pointer';
    reset.addEventListener('click', async () => {
      const np = prompt('为 “' + u.displayName + '” 设置新密码：');
      if (!np) return;
      const salt = generateSalt();
      const iterations = DEFAULT_PBKDF2_ITERATIONS;
      const hash = await derivePasswordHash(np, salt, iterations);
      const r = await adminApi('reset', { target: u.name, salt: salt, hash: hash, iterations: iterations });
      if (r.ok) alert('密码已重置。'); else alert('重置失败：' + (r.error || '未知错误'));
    });
    const del = document.createElement('button');
    del.textContent = '删除';
    del.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:#c0392b;color:#fff;cursor:pointer';
    del.addEventListener('click', async () => {
      if (!confirm('确定删除用户 “' + u.displayName + '” 吗？该操作不可恢复（含其云端进度）。')) return;
      const r = await adminApi('delete', { target: u.name });
      if (r.ok) renderAdminListAfterRefresh(); else alert('删除失败：' + (r.error || '未知错误'));
    });
    row.appendChild(name); row.appendChild(adminToggle); row.appendChild(reset); row.appendChild(del);
    listEl.appendChild(row);
  }
}

async function renderAdminListAfterRefresh() {
  const data = await adminApi('list', {});
  if (data.users) renderAdminList(data.users);
}

function closeAdminPanel() {
  const overlay = document.getElementById('adminOverlay');
  if (overlay) overlay.style.display = 'none';
}

// 游戏内右上角的「退出登录」按钮，点击才会退出登录。
function showLogoutButton() {
  let btn = document.getElementById('logoutBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.textContent = '退出登录';
    btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;padding:8px 14px;border:none;border-radius:8px;background:#c0392b;color:#fff;font:14px sans-serif;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3)';
    btn.addEventListener('click', logout);
    document.body.appendChild(btn);
  }
  btn.style.display = 'block';
}
function normalizeName(n) { return (n || '').trim().toLowerCase(); }
function arrayBufferToBase64(buffer) { const bytes = new Uint8Array(buffer); let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]); return btoa(binary); }
function base64ToUint8Array(base64) { const binary = atob(base64); const len = binary.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
function generateSalt(length = 16) { const s = new Uint8Array(length); crypto.getRandomValues(s); return arrayBufferToBase64(s.buffer); }
async function derivePasswordHash(password, saltBase64, iterations = DEFAULT_PBKDF2_ITERATIONS) { const enc = new TextEncoder(); const passKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']); const salt = base64ToUint8Array(saltBase64); const params = { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }; const derivedBits = await crypto.subtle.deriveBits(params, passKey, 256); return arrayBufferToBase64(derivedBits); }
function constantTimeEqual(a, b) { if (a.length !== b.length) return false; let res = 0; for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i); return res === 0; }

// UI forms (Register/Login) with spinner helpers (unchanged content) ...
// (For brevity copy the previous implementations you already have for showRegisterForm, showLoginForm, showBusyOnButtons, clearBusyOnButtons, handleRegister, handleLogin)
// I'll include them below exactly as before so file remains self-contained.

function showRegisterForm() {
  authContent.innerHTML = `
    <h2 id="authTitle" style="margin:0">Register</h2>
    <div class="row">
      <label>
        <div class="label-line">The new survivor is called:</div>
        <input id="regName" type="text" autocomplete="name" />
      </label>
      <label>
        <div class="label-line">Your Password:</div>
        <input id="regPass" type="password" autocomplete="new-password" />
      </label>
      <div class="note">Choose a unique name and a password.</div>
      <div class="error" id="regError" aria-live="polite"></div>
      <div class="btn-row">
        <button id="regStart" class="gray">Start</button>
        <button id="regBack" class="secondary">Back</button>
      </div>
    </div>
  `;
  document.getElementById('regStart').addEventListener('click', handleRegister);
  document.getElementById('regBack').addEventListener('click', showAuthMenu);
  const nameInput = document.getElementById('regName');
  const passInput = document.getElementById('regPass');
  [nameInput, passInput].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); }));
  nameInput.focus();
}
function showLoginForm() {
  authContent.innerHTML = `
    <h2 id="authTitle" style="margin:0">Login</h2>
    <div class="row">
      <label>
        <div class="label-line">Name:</div>
        <input id="loginName" type="text" autocomplete="username" />
      </label>
      <label>
        <div class="label-line">Password:</div>
        <input id="loginPass" type="password" autocomplete="current-password" />
      </label>
      <div class="error" id="loginError" aria-live="polite"></div>
      <div class="btn-row">
        <button id="loginGo" class="gray">Login</button>
        <button id="loginBack" class="secondary">Back</button>
      </div>
    </div>
  `;
  document.getElementById('loginGo').addEventListener('click', handleLogin);
  document.getElementById('loginBack').addEventListener('click', showAuthMenu);
  const nameInput = document.getElementById('loginName');
  const passInput = document.getElementById('loginPass');
  [nameInput, passInput].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); }));
  nameInput.focus();
}
function showBusyOnButtons(primaryButton, otherButton, text) {
  if (primaryButton) {
    primaryButton.disabled = true;
    primaryButton.dataset.orig = primaryButton.innerHTML;
    primaryButton.innerHTML = `<span class="spinner"></span> ${text}`;
  }
  if (otherButton) otherButton.disabled = true;
}
function clearBusyOnButtons(primaryButton, otherButton) {
  if (primaryButton) {
    primaryButton.disabled = false;
    if (primaryButton.dataset.orig) primaryButton.innerHTML = primaryButton.dataset.orig;
  }
  if (otherButton) otherButton.disabled = false;
}

// Detect whether an account backend is reachable by probing a lightweight
// health endpoint. This works for the local Node server AND Cloudflare Pages
// Functions (both answer /api/health with 200). When there is no backend
// (e.g. a plain file:// open, or a static host without Functions) we fall
// back to browser-local (localStorage) accounts. The result is cached.
let _backendProbe = null;
function backendAvailable() {
  if (_backendProbe === null) {
    _backendProbe = fetch('/api/health', { method: 'GET', cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false);
  }
  return _backendProbe;
}

async function handleRegister() {
  const nameEl = document.getElementById('regName');
  const passEl = document.getElementById('regPass');
  const errEl = document.getElementById('regError');
  const startBtn = document.getElementById('regStart');
  const backBtn = document.getElementById('regBack');

  const name = (nameEl.value || '').trim();
  const pass = (passEl.value || '');
  errEl.textContent = '';

  if (!name) { errEl.textContent = 'Please enter a name.'; nameEl.focus(); return; }
  if (!pass || pass.length < 1) { errEl.textContent = 'Please enter a password.'; passEl.focus(); return; }

  showBusyOnButtons(startBtn, backBtn, 'Registering...');

  const salt = generateSalt();
  const iterations = DEFAULT_PBKDF2_ITERATIONS;
  try {
    // Derive the password hash locally (plaintext never leaves the browser)…
    const hash = await derivePasswordHash(pass, salt, iterations);
    _sessionHash = hash;

    if (await backendAvailable()) {
      // …then store it in the Turso-backed database via the backend API.
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, salt: salt, hash: hash, iterations: iterations })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = data.error || 'Registration failed. Please try again.';
        clearBusyOnButtons(startBtn, backBtn);
        return;
      }
      setCurrentPlayer(name);
      onAuthSuccess(name, false);
    } else {
      // No server (e.g. GitHub Pages) → fall back to local browser storage.
      const players = loadPlayers();
      const key = normalizeName(name);
      if (players[key]) {
        errEl.textContent = 'That name is already taken — please choose another name.';
        clearBusyOnButtons(startBtn, backBtn);
        return;
      }
      players[key] = { name: name, salt: salt, hash: hash, iterations: iterations };
      savePlayers(players);
      setCurrentPlayer(name);
      onAuthSuccess(name, false);
    }
  } catch (err) {
    console.error('Error during registration', err);
    errEl.textContent = 'Could not reach the server. Please try again.';
    clearBusyOnButtons(startBtn, backBtn);
  }
}

async function handleLogin() {
  const nameEl = document.getElementById('loginName');
  const passEl = document.getElementById('loginPass');
  const errEl = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginGo');
  const backBtn = document.getElementById('loginBack');

  const name = (nameEl.value || '').trim();
  const pass = (passEl.value || '');

  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Please enter your name.'; nameEl.focus(); return; }
  if (!pass) { errEl.textContent = 'Please enter your password.'; passEl.focus(); return; }

  showBusyOnButtons(loginBtn, backBtn, 'Checking...');

  try {
    if (await backendAvailable()) {
      // Fetch this user's stored salt/iterations so we can derive the hash locally.
      const userRes = await fetch('/api/user/' + encodeURIComponent(normalizeName(name)));
      if (!userRes.ok) {
        errEl.textContent = 'Name not found. Please register first.';
        clearBusyOnButtons(loginBtn, backBtn);
        return;
      }
      const user = await userRes.json();
      const recomputed = await derivePasswordHash(pass, user.salt, user.iterations || DEFAULT_PBKDF2_ITERATIONS);
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizeName(name), hash: recomputed })
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok || !loginData.ok) {
        errEl.textContent = 'Password incorrect. Please try again.';
        passEl.focus();
        clearBusyOnButtons(loginBtn, backBtn);
        return;
      }
      setCurrentPlayer(name);
      _sessionHash = recomputed;
      // pull cloud progress so this account plays the same game on any device
      const prog = await loadServerProgress(name);
      applyServerProgress(name, prog);
      await loadAdminStatus(name);
      onAuthSuccess(name, true);
    } else {
      // No server (e.g. GitHub Pages) → read from local browser storage.
      const players = loadPlayers();
      const key = normalizeName(name);
      const record = players[key];
      if (!record) {
        errEl.textContent = 'Name not found. Please register first.';
        clearBusyOnButtons(loginBtn, backBtn);
        return;
      }
      const recomputed = await derivePasswordHash(pass, record.salt, record.iterations || DEFAULT_PBKDF2_ITERATIONS);
      if (!constantTimeEqual(recomputed, record.hash)) {
        errEl.textContent = 'Password incorrect. Please try again.';
        passEl.focus();
        clearBusyOnButtons(loginBtn, backBtn);
        return;
      }
      setCurrentPlayer(record.name);
      onAuthSuccess(record.name, true);
    }
  } catch (err) {
    console.error('Error during login', err);
    errEl.textContent = 'Could not reach the server. Please try again.';
    clearBusyOnButtons(loginBtn, backBtn);
  }
}

function onAuthSuccess(playerName, wasLogin) {
  authContent.innerHTML = `
    <h2 style="margin:0">${wasLogin ? 'Welcome back' : 'Welcome'} ${escapeHtml(playerName)}</h2>
    <div class="row">
      <div class="note">Loading your game...</div>
    </div>
  `;
  setTimeout(() => {
    authPanel.classList.add('fade-out');
    authPanel.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (authPanel && authPanel.parentNode) authPanel.parentNode.removeChild(authPanel); }, 700);
    // start the game (initGame handles intro overlay)
    initGame(playerName);
    showLogoutButton();
  }, 600);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

// ----------------- Game world, physics, collisions -----------------
let gameState = null;

// ----- Level tuning (all values in px; tweak freely) -----
const GAS_SPEED = 2.8;      // how fast the poison front chases the player
const GAS_START_X = -260;   // gas front starts off-screen to the left (gives a head start)
const GRAVITY = 0.85;
const MOVE_ACCEL = 1.4;
const MAX_SPEED = 6.5;
const FRICTION = 0.85;
const JUMP_IMPULSE = -15;
const JUMP_CUT = 0.4;      // releasing jump mid-ascent cuts upward speed (0–1; lower = snappier fall)
const PLAYER_RADIUS = 24;
const MAX_FALL_SPEED = 16; // terminal fall speed (below platform height, so the player can't tunnel through)
const ATTACK_DURATION = 14; // frames the equipped-weapon slash arc stays visible

// ----- Player health -----
const PLAYER_MAX_HP = 10;
const PLAYER_INVULN = 45;   // frames of invulnerability after a hit (so bats don't drain every frame)
const SHAKE_DURATION = 14;  // frames of screen shake after being hurt
const SHAKE_MAGNITUDE = 7;  // max shake offset in px
const HEAL_SPEED = 0.2;     // HP restored per frame while healing at the campfire (~1s to full)

// ----- Mutant bat enemy (level 3) -----
const ENEMY_BAT_HP = 10;
const ENEMY_BAT_RADIUS = 30;
const ENEMY_FLY_SPEED = 1.8;      // slow flight toward the player
const ENEMY_KNOCKBACK = 6;        // impulse away from the player when hit
const ENEMY_KNOCKBACK_DECAY = 0.85;
const ENEMY_BAT_DAMAGE = 5;       // contact damage the bat deals to the player
const ENEMY_DROP_RATE = 0.2;      // 20% chance to drop a small fang on death
const LEVEL2_BAT_COUNT = 3;

// ----- Crocodile enemy (level 4) -----
const ENEMY_CROC_HP = 30;
const ENEMY_CROC_RADIUS = 38;
const ENEMY_CROC_SPEED = 1.6;      // ground-crawl speed toward the player
const ENEMY_CROC_DAMAGE = 4;       // contact damage the crocodile deals

// ----- Cave boss tuning -----
const BOSS_RADIUS = PLAYER_RADIUS * 3; // 3x the player's diameter
const BOSS_CHARGE_SPEED = 14;
const BOSS_FLY_UP_SPEED = 9;     // straight-up ascent after a charge
const BOSS_DYING_DRIFT = 4.5;    // wobble speed toward the wall when dying
const BOSS_CHARGE_INTERVAL = 60; // frames between charges (~1s at 60fps)
const BOSS_MAX_CHARGE = 900;      // px travelled before a charge fizzles out
const BOSS_HP = 5;
const ROCK_COUNT = 8;
const WALL_THICKNESS = 90;       // right-hand gray stone wall
const WALL_HOLE_H = 80;          // height of the exit hole at the wall's base

// ----- Items & inventory -----
const ITEM_CATEGORIES = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '护甲' },
  { key: 'rune', label: '铭文' },
  { key: 'consumable', label: '消耗品' },
  { key: 'material', label: '材料' }
];
const ITEM_DEFS = {
  'bat-fang': { name: '巨型蝙蝠尖牙', category: 'weapon', range: 96, damage: 5 },
  'small-bat-fang': { name: '小型蝙蝠尖牙', category: 'material' },
  'crocodile-scale': { name: '鳄鱼鳞片', category: 'weapon', range: 112, damage: 8 }
};

// ----- 融合：对方的新世界（遗忘的山洞村庄 / 深渊 / 上层 / 爬行领主）所需常量 -----
const HOLE_X = 2000;             // 地面上的洞口 x（从村庄掉入）
const HOLE_WIDTH = 80;
const VILLAGE_ENTER_X = 2600;    // 进入村庄后跨过此 x 显示标题
const VILLAGE_BAT_COUNT = 3;
const VILLAGE_RETURN_X = 4480;   // 村庄右端的洞口，通往深渊
const DEPTHS_RETURN_X = 60;      // 深渊左端洞口，返回村庄
const DEPTHS_PIT_X = 3320;       // 深渊右端大坑（掉入传送至上层）
const DEPTHS_PIT_W = 300;
const DEPTHS_CRAWLER_COUNT = 5;
const ENEMY_CRAWLER_HP = 15;
const ENEMY_CRAWLER_RADIUS = 26;
const ENEMY_CRAWLER_SPEED = 6.0;
const ENEMY_CRAWLER_DAMAGE = 10;
const ENEMY_CRAWLER_DIR_INTERVAL = 300;
const UPPER_CRAWLER_MAX = 10;
const UPPER_BAT_MAX = 15;
const ENEMY_SPAWN_INTERVAL = 600;
const UPPER_CRAWLER_INITIAL = 3;
const UPPER_BAT_INITIAL = 3;
const OVERLORD_HP = 50;
const OVERLORD_DAMAGE = 10;
const OVERLORD_RADIUS = 52;
const OVERLORD_RX = 60;
const OVERLORD_RY = 24;
const OVERLORD_CHARGE_SPEED = MAX_SPEED * 1.5;
const OVERLORD_SPAWN_CHANCE = 0.05;
const OVERLORD_WINDUP_FRAMES = 180;
const OVERLORD_CHARGE_FRAMES = 180;
const OVERLORD_BURROW_FRAMES = 300;
const OVERLORD_EMERGE_FRAMES = 30;
const CATEGORY_COLORS = {
  weapon: '#d9a441', armor: '#6fb3d9', rune: '#9b7bd9', consumable: '#7bd97b', material: '#b08d6a'
};
function itemCategoryLabel(key) {
  const c = ITEM_CATEGORIES.find(c => c.key === key);
  return c ? c.label : key;
}

// Build the level's platforms: a spawn pad, a sine-wave climb going right,
// then a wide "cave floor" at the bottom-right that leads into the cave.
function buildLevelPlatforms(worldWidth, caveX) {
  const plats = [];
  const midY = H * 0.55;   // vertical center the climb weaves around
  const amp = H * 0.16;    // how high/low the climb goes

  // spawn platform (where the player starts)
  plats.push({ x: 30, y: Math.round(midY), width: 200, height: 20 });

  // climb platforms, weaving up and down toward the right
  let prev = plats[0];
  let i = 0;
  while (true) {
    i++;
    const x = prev.x + prev.width + 150 + (i % 3) * 15; // gap 150–180
    if (x > caveX - 450) break;
    const y = Math.round(midY + Math.sin(i * 0.5) * amp);
    const w = 140 + (i % 3) * 20; // width 140/160/180
    plats.push({ x, y, width: w, height: 18 });
    prev = plats[plats.length - 1];
  }

  // cave floor: wide platform at the bottom-right leading into the cave
  plats.push({ x: caveX - 320, y: H - 150, width: 480, height: 20 });
  return plats;
}

// ----- Cave-entry persistence (saved to localStorage) -----
function caveFlagKeyFor(name) {
  return 'deepest_entered_cave_' + (name ? (name.trim().toLowerCase()) : 'anonymous');
}
function hasEnteredCave(name) {
  try { return !!localStorage.getItem(caveFlagKeyFor(name)); } catch (e) { return false; }
}
function setEnteredCave(name) {
  try { localStorage.setItem(caveFlagKeyFor(name), '1'); } catch (e) { }
}
function level2FlagKeyFor(name) {
  return 'deepest_entered_level2_' + (name ? (name.trim().toLowerCase()) : 'anonymous');
}
function hasEnteredLevel2(name) {
  try { return !!localStorage.getItem(level2FlagKeyFor(name)); } catch (e) { return false; }
}
function setEnteredLevel2(name) {
  try { localStorage.setItem(level2FlagKeyFor(name), '1'); } catch (e) { }
}
function level4FlagKeyFor(name) {
  return 'deepest_entered_level4_' + (name ? (name.trim().toLowerCase()) : 'anonymous');
}
function hasEnteredLevel4(name) {
  try { return !!localStorage.getItem(level4FlagKeyFor(name)); } catch (e) { return false; }
}
function setEnteredLevel4(name) {
  try { localStorage.setItem(level4FlagKeyFor(name), '1'); } catch (e) { }
}
function inventoryKeyFor(name) {
  return 'deepest_inventory_' + (name ? name.trim().toLowerCase() : 'anonymous');
}
function saveInventory(name, data) {
  try { localStorage.setItem(inventoryKeyFor(name), JSON.stringify(data)); } catch (e) { }
}
function loadInventory(name) {
  try {
    const raw = localStorage.getItem(inventoryKeyFor(name));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function savePlayerInfo(gs) {
  saveInventory(gs.player.name, {
    inventory: gs.inventory,
    weaponSlot: gs.weaponSlot,
    backpackUnlocked: gs.backpackUnlocked
  });
}

// ----- Cloud progress sync (Turso) -----
// The (locally-derived) password hash is kept so we can authenticate writes to
// the server without ever sending the plaintext password.
let _sessionHash = null;
let _isAdmin = false; // 当前账号是否为数据库中的管理员（由 /api/admin 读取）

// Furthest scene this player has reached, based on the local "entered" flags.
function currentReachedScene(name) {
  if (hasEnteredLevel4(name)) return 'level4';
  if (hasEnteredLevel2(name)) return 'level2';
  if (hasEnteredCave(name)) return 'cave';
  return 'chase';
}

// Pull saved progress from the cloud (returns null when offline / no backend).
async function loadServerProgress(name) {
  if (!(await backendAvailable())) return null;
  try {
    const res = await fetch('/api/progress?name=' + encodeURIComponent(normalizeName(name)));
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.progress || null;
  } catch (e) { console.warn('load progress failed', e); return null; }
}

// 从服务器读取当前账号是否为管理员，并设置模块级 _isAdmin（供 initGame 启用管理功能）。
async function loadAdminStatus(name) {
  if (!(await backendAvailable())) return false;
  try {
    const res = await fetch('/api/admin?caller=' + encodeURIComponent(normalizeName(name)) + '&hash=' + encodeURIComponent(_sessionHash || ''));
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    _isAdmin = !!data.isAdmin;
    return _isAdmin;
  } catch (e) { console.warn('load admin status failed', e); return false; }
}

// Seed the local store (inventory + reached-scene flags) from the cloud so the
// same account keeps the same progress on any device/browser.
function applyServerProgress(name, progress) {
  if (!progress) return;
  saveInventory(name, {
    inventory: progress.inventory || {},
    weaponSlot: progress.weaponSlot || null,
    backpackUnlocked: !!progress.backpackUnlocked
  });
  const reached = progress.reached || 'chase';
  if (reached === 'cave' || reached === 'level2' || reached === 'level4') setEnteredCave(name);
  if (reached === 'level2' || reached === 'level4') setEnteredLevel2(name);
  if (reached === 'level4') setEnteredLevel4(name);
}

// Push the current game progress to the cloud. Called whenever a level is cleared
// (or saved at a campfire) so the account's progress is mirrored on the server.
async function saveServerProgress() {
  const gs = gameState;
  if (!gs || !_sessionHash) return;
  if (!(await backendAvailable())) return; // local (no-backend) accounts stay local
  const name = gs.player.name;
  const progress = {
    inventory: gs.inventory || {},
    weaponSlot: gs.weaponSlot || null,
    backpackUnlocked: !!gs.backpackUnlocked,
    reached: currentReachedScene(name)
  };
  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizeName(name), hash: _sessionHash, progress })
    });
  } catch (e) { console.warn('save progress failed', e); }
}

const FADE_SPEED = 0.04; // scene-transition fade speed (per 60fps frame)

// Reconfigure the game for the cave scene: flat floor, floating rocks, and a boss.
function setupCaveScene(gs) {
  gs.scene = 'cave';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.campfire = null;
  gs.worldWidth = Math.max(W * 3, 3200);
  const groundY = H - 150;
  gs.platforms = [{ x: 0, y: groundY, width: gs.worldWidth, height: 20 }];
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.spawn = { x: 200, y: groundY - PLAYER_RADIUS };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;

  // cave inhabitants: rocks scattered across the whole cave, boss, and the end wall
  const bossHomeX = gs.worldWidth - 480;
  gs.bossTriggerX = Math.max(0, bossHomeX - W); // boss appears when it reaches the right edge
  gs.wallX = gs.worldWidth - WALL_THICKNESS;
  gs.wall = { holeOpen: false, shakeTimer: 0, crashed: false };
  gs.rocks = generateRocks(400, gs.wallX - 100);
  gs.boss = makeBoss(bossHomeX, H * 0.35);
}

// Reconfigure the game for the chase scene: the gas run toward the cave.
function setupChaseScene(gs) {
  gs.scene = 'chase';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.campfire = null;
  gs.worldWidth = Math.max(W * 6, 4800);
  gs.caveX = gs.worldWidth - 170;
  gs.platforms = buildLevelPlatforms(gs.worldWidth, gs.caveX);
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  gs.spawn = { x: 120, y: gs.platforms[0].y - PLAYER_RADIUS };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Reconfigure the game for the next level (currently just a flat floor placeholder).
function setupLevel2Scene(gs) {
  gs.scene = 'level2';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.worldWidth = Math.max(W * 2, 2400);
  // spawn mutant bats flying in the air
  for (let i = 0; i < LEVEL2_BAT_COUNT; i++) {
    const bx = 500 + (i * (gs.worldWidth - 900)) / Math.max(1, LEVEL2_BAT_COUNT - 1);
    const by = H * (0.32 + (i % 2) * 0.12);
    gs.enemies.push(makeBat(bx, by));
  }
  const groundY = H - 150;
  gs.platforms = [{ x: 0, y: groundY, width: gs.worldWidth, height: 20 }];
  gs.campfire = { x: 800, y: groundY };  // save point (press ↑ when nearby)
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  gs.spawn = { x: 200, y: groundY - PLAYER_RADIUS };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Reconfigure the game for level 4: a flat marsh where a ground-crawling
// crocodile guards the crocodile scale.
function setupLevel4Scene(gs) {
  gs.scene = 'level4';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.worldWidth = Math.max(W * 3, 3000);
  const groundY = H - 150;
  gs.platforms = [{ x: 0, y: groundY, width: gs.worldWidth, height: 20 }];
  gs.campfire = { x: 700, y: groundY };   // save / heal point
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  // spawn the crocodile on the ground, near the right edge
  gs.enemies.push(makeCrocodile(gs.worldWidth - 400, groundY - ENEMY_CROC_RADIUS));
  gs.spawn = { x: 200, y: groundY - PLAYER_RADIUS };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Restart the current scene from the beginning. Called at the midpoint of a
// fade transition, so it must NOT clear gs.fade — the fade caller manages that.
function resetLevel() {
  const gs = gameState;
  if (gs.scene === 'cave') setupCaveScene(gs);
  else if (gs.scene === 'level2') setupLevel2Scene(gs);
  else setupChaseScene(gs);
  gs.input.jump = false;
  gs.input.jumpHeld = false;
  gs.player.hp = gs.player.maxHp;
  gs.player.invTimer = 0;
  gs.healing = false;
  gs.status = 'playing';
  gs.statusTimer = 0;
}

function gameOver() {
  if (gameState.status !== 'playing') return;
  gameState.status = 'gameover';
  gameState.statusTimer = 0;
}

// Called when the player reaches the cave: save progress, then fade to the cave scene.
function enterCave() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  setEnteredCave(gs.player.name);
  saveServerProgress();
  gs.fade = { alpha: 0, dir: 1, action: 'to-cave' };
}

// Player pressed "Continue" after dying: fade out, respawn, then fade back in.
function continueRespawn() {
  const gs = gameState;
  if (gs.status !== 'gameover' || gs.fade) return;
  gs.fade = { alpha: 0, dir: 1, action: 'respawn' };
}

// Player pressed Enter/Space on the victory screen: replay from level 1.
function restartFromChase() {
  const gs = gameState;
  if (!gs || gs.fade) return;
  gs.fade = null;
  setupChaseScene(gs);
  gs.player.hp = PLAYER_MAX_HP;
  gs.status = 'playing';
  gs.statusTimer = 0;
}

// Player walked through the opened hole: save progress and fade to the next level.
function enterNextLevel() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  setEnteredLevel2(gs.player.name);
  saveServerProgress();
  gs.fade = { alpha: 0, dir: 1, action: 'to-level2' };
}

// Player cleared level 3 (all bats): save progress, then fade to the crocodile level.
function enterLevel4() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  setEnteredLevel4(gs.player.name);
  saveServerProgress();
  gs.fade = { alpha: 0, dir: 1, action: 'to-level4' };
}

function flashSaving(gs) {
  gs.savingTimer = 90; // show "Saving…" for ~1.5s
}

// ----- Campfire save point (level 3) -----
function isNearCampfire(gs) {
  return !!(gs.campfire && (gs.scene === 'level2' || gs.scene === 'level4') && Math.abs(gs.player.x - gs.campfire.x) < 90);
}
function saveAtCampfire() {
  const gs = gameState;
  if (!gs || gs.status !== 'playing' || gs.fade) return;
  if (!isNearCampfire(gs)) return;
  setEnteredLevel2(gs.player.name);
  savePlayerInfo(gs);
  saveServerProgress();
  flashSaving(gs);
  gs.pickups.push({ text: '已存档', timer: 90 });
  gs.healing = true;  // start refilling HP to full
}

// Admin helper: instantly jump to any scene without changing saved progress.
function teleportTo(scene) {
  const gs = gameState;
  if (!gs || gs.fade) return;
  if (scene === 'chase') setupChaseScene(gs);
  else if (scene === 'cave') setupCaveScene(gs);
  else if (scene === 'level2') setupLevel2Scene(gs);
  else if (scene === 'level4') setupLevel4Scene(gs);
  else if (scene === 'village') setupVillageScene(gs);
  else if (scene === 'depths') setupDepthsScene(gs);
  else if (scene === 'upper') setupUpperScene(gs);
  else return;
  gs.status = 'playing';
  gs.statusTimer = 0;
}

function updateFade(gs, dt) {
  const f = gs.fade;
  f.alpha += FADE_SPEED * f.dir * dt;
  if (f.dir === 1 && f.alpha >= 1) {
    f.alpha = 1;
    if (f.action === 'to-cave') setupCaveScene(gs);
    else if (f.action === 'to-level2') setupLevel2Scene(gs);
    else if (f.action === 'to-level4') setupLevel4Scene(gs);
    else if (f.action === 'to-village') setupVillageScene(gs);
    else if (f.action === 'to-depths') setupDepthsScene(gs);
    else if (f.action === 'to-upper') setupUpperScene(gs);
    else if (f.action === 'return-village') setupVillageScene(gs);
    else if (f.action === 'respawn') resetLevel();
    f.action = null;
    f.dir = -1; // now fade back in
  } else if (f.dir === -1 && f.alpha <= 0) {
    f.alpha = 0;
    gs.fade = null;
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function resolveCircleRectCollision(circle, rect) {
  const cx = circle.x, cy = circle.y, rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height;
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  let dx = cx - nearestX, dy = cy - nearestY;
  const distSq = dx * dx + dy * dy;
  const r = circle.radius;
  if (distSq >= r * r) return null;
  const dist = Math.sqrt(distSq) || 0.0001;
  const penetration = r - dist;
  const nx = dx / dist, ny = dy / dist;
  const normalX = isFinite(nx) ? nx : 0;
  const normalY = isFinite(ny) ? ny : -1;
  return { penetration, normalX, normalY };
}

// ----- Cave scene: floating rocks + boss ("巨型变异蝙蝠") -----
function makeRock(x, y) {
  const base = 34 + Math.random() * 26;          // collision radius
  const n = 6 + Math.floor(Math.random() * 3);   // 6–8 sides
  const verts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rad = base * (0.65 + Math.random() * 0.6);
    verts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
  }
  return { x, y, verts, r: base, alive: true, flashTimer: 0 };
}

// 8 rocks, roughly evenly spaced (with jitter) across the whole cave.
function generateRocks(startX, endX) {
  const rocks = [];
  for (let i = 0; i < ROCK_COUNT; i++) {
    const t = (i + 0.5 + (Math.random() * 0.6 - 0.3)) / ROCK_COUNT;
    const x = startX + Math.min(1, Math.max(0, t)) * (endX - startX);
    const y = H * 0.28 + Math.random() * (H * 0.27);
    rocks.push(makeRock(x, y));
  }
  return rocks;
}

function makeBoss(x, y) {
  return {
    x, y, homeX: x, homeY: y,
    r: BOSS_RADIUS,
    vx: 0, vy: 0,
    appeared: false, state: 'dormant', // dormant -> waiting -> charging -> flyup -> dying -> gone
    attackTimer: BOSS_CHARGE_INTERVAL,
    bobPhase: Math.random() * Math.PI * 2,
    flashTimer: 0,
    hp: BOSS_HP, maxHp: BOSS_HP,
    chargeDistance: 0,
    deadTimer: 0,
    dieBaseY: y, wobblePhase: 0
  };
}

function updateCaveScene(gs, dt) {
  for (let rock of gs.rocks) {
    if (rock.flashTimer > 0) rock.flashTimer -= dt;
  }
  updateBoss(gs, dt);
  updateWall(gs, dt);
  // walk through the opened hole -> next level
  if (gs.wall && gs.wall.holeOpen && gs.player.x >= gs.wallX + 60) {
    enterNextLevel();
  }
}

// Level 3 (plain): once every mutant bat is gone, advance to the crocodile level.
function updateLevel2Scene(gs, dt) {
  updateEnemies(gs, dt);
  if (gs.enemies.length === 0) enterLevel4();
}

// Level 4 (marsh): the crocodile is the final foe. Victory once its scale is collected.
function updateLevel4Scene(gs, dt) {
  updateEnemies(gs, dt);
  if (gs.enemies.length === 0 && gs.inventory['crocodile-scale'] && gs.status === 'playing' && !gs.fade) {
    saveServerProgress(); // persist the full clear (incl. the collected scale)
    enterVillage(); // 鳄鱼关作为倒数第二关，通关后进入新世界（村庄）
  }
}

function updateBoss(gs, dt) {
  const b = gs.boss;
  if (!b) return;
  if (b.flashTimer > 0) b.flashTimer -= dt;

  // the boss appears once the player walks far enough right
  if (!b.appeared) {
    if (gs.player.x >= gs.bossTriggerX) {
      b.appeared = true;
      b.state = 'waiting';
      b.attackTimer = BOSS_CHARGE_INTERVAL;
    } else {
      return;
    }
  }

  if (b.state === 'waiting') {
    // hover in place with a gentle bob
    b.bobPhase += dt * 0.05;
    b.x = b.homeX;
    b.y = b.homeY + Math.sin(b.bobPhase) * 10;
    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      // charge straight at the player's current position
      b.state = 'charging';
      b.chargeDistance = 0;
      const dx = gs.player.x - b.x;
      const dy = gs.player.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      b.vx = (dx / len) * BOSS_CHARGE_SPEED;
      b.vy = (dy / len) * BOSS_CHARGE_SPEED;
    }
    return;
  }

  if (b.state === 'charging') {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.chargeDistance += Math.hypot(b.vx, b.vy) * dt;

    // hit the player -> player dies
    const dpx = b.x - gs.player.x, dpy = b.y - gs.player.y;
    if (Math.hypot(dpx, dpy) < b.r + gs.player.radius) {
      gameOver();
      flyUp(b);
      return;
    }

    // hit a floating rock -> boss takes damage, rock disappears
    for (let rock of gs.rocks) {
      if (!rock.alive) continue;
      const drx = b.x - rock.x, dry = b.y - rock.y;
      if (Math.hypot(drx, dry) < b.r + rock.r) {
        hurtBoss(gs, b, rock);
        return;
      }
    }

    // hit the floor/ceiling/right wall or travelled too far -> end the charge
    const groundY = H - 150;
    if (b.x < b.r || b.x + b.r > gs.wallX ||
        b.y < b.r || b.y > groundY - b.r ||
        b.chargeDistance > BOSS_MAX_CHARGE) {
      flyUp(b);
    }
    return;
  }

  if (b.state === 'flyup') {
    // fly straight up (no rock collision), but the player can still be hit
    b.y += b.vy * dt;
    const dpx = b.x - gs.player.x, dpy = b.y - gs.player.y;
    if (Math.hypot(dpx, dpy) < b.r + gs.player.radius) {
      gameOver();
      b.vx = b.vy = 0;
      return;
    }
    if (b.y <= b.homeY) {
      // reached the on-screen hover height: hover and wait for the next charge
      b.x = b.homeX; b.y = b.homeY; b.vx = b.vy = 0;
      b.state = 'waiting';
      b.attackTimer = BOSS_CHARGE_INTERVAL;
    }
    return;
  }

  if (b.state === 'dying') {
    // wobble toward the stone wall, then crash into it
    b.deadTimer += dt;
    b.wobblePhase += dt * 0.25;
    b.x += BOSS_DYING_DRIFT * dt;
    b.y = b.dieBaseY + Math.sin(b.wobblePhase) * 24;
    if (b.x + b.r >= gs.wallX) {
      b.state = 'gone';
      gs.wall.shakeTimer = 30;
      gs.wall.crashed = true;
    }
    return;
  }

  if (b.state === 'gone') {
    // crashed into the wall; keep fading the health bar
    b.deadTimer += dt;
    return;
  }
}

function flyUp(b) {
  b.homeX = b.x; // new hover point sits directly above where the charge stopped
  b.vx = 0;
  b.vy = -BOSS_FLY_UP_SPEED;
  b.state = 'flyup';
}

function updateWall(gs, dt) {
  const w = gs.wall;
  if (!w) return;
  if (w.shakeTimer > 0) {
    w.shakeTimer -= dt;
    if (w.shakeTimer <= 0 && w.crashed && !w.holeOpen) {
      w.holeOpen = true;
    }
  }
}

function hurtBoss(gs, b, rock) {
  b.hp -= 1;
  b.flashTimer = 15;      // boss flashes when hurt
  rock.alive = false;
  rock.flashTimer = 15;   // rock flashes a few times, then disappears
  b.vx = b.vy = 0;
  if (b.hp <= 0) {
    b.state = 'dying';
    b.deadTimer = 0;
    b.dieBaseY = b.y;
    b.wobblePhase = 0;
    spawnDrop(gs, 'bat-fang', b.x, b.y); // boss drops the giant bat fang
  } else {
    flyUp(b);
  }
}

// Boss takes damage from the player's equipped weapon (e.g. the bat fang).
function damageBoss(gs, amount) {
  const b = gs.boss;
  if (!b || !b.appeared || b.state === 'dying' || b.state === 'gone') return;
  b.hp -= amount;
  b.flashTimer = 15; // enemy flashes when hit
  if (b.hp <= 0) {
    b.state = 'dying';
    b.deadTimer = 0;
    b.dieBaseY = b.y;
    b.wobblePhase = 0;
    spawnDrop(gs, 'bat-fang', b.x, b.y);
  }
}

// Resolve a weapon swing: any enemy in front of the player, within range, flashes + loses HP.
function attackHitEnemies(gs, range, damage, weaponId) {
  const p = gs.player;
  const b = gs.boss;
  const isScale = weaponId === 'crocodile-scale'; // 鳄鱼鳞片
  if (b && b.appeared && b.state !== 'dying' && b.state !== 'gone') {
    const dx = b.x - p.x;
    const inFront = (p.face > 0) ? dx >= -b.r : dx <= b.r;
    if (inFront && Math.hypot(dx, b.y - p.y) <= range + b.r) {
      damageBoss(gs, damage);
    }
  }
  // generic enemies (mutant bats)
  for (const e of gs.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const inFront = (p.face > 0) ? dx >= -e.r : dx <= e.r;
    if (!inFront) continue;
    if (Math.hypot(dx, e.y - p.y) <= range + e.r) {
      let dmg = damage;
      if (isScale && e.type === 'bat') dmg = e.hp; // 鳄鱼鳞片秒杀蝙蝠
      else if (isScale && e.type === 'crocodile') dmg = ENEMY_CROC_HP / 2; // 鳞片两次击杀鳄鱼(30HP)
      e.hp -= dmg;
      e.flashTimer = 15;
      const len = Math.hypot(dx, e.y - p.y) || 1;
      e.vx = (dx / len) * ENEMY_KNOCKBACK;
      e.vy = ((e.y - p.y) / len) * ENEMY_KNOCKBACK;
      if (e.hp <= 0) {
        e.alive = false;
        if (e.type === 'crawler-boss') {
          // 击败爬行领主（最终 Boss）即通关
          if (gs.scene === 'upper') gs.status = 'victory';
        } else if (e.type === 'crawler') {
          if (Math.random() < 0.70) spawnDrop(gs, 'crawler-scale', e.x, e.y);
          if (Math.random() < 0.20) spawnDrop(gs, 'crawler-spike', e.x, e.y);
        } else {
          const rate = (e.dropRate != null) ? e.dropRate : ENEMY_DROP_RATE;
          const item = e.dropItem || 'small-bat-fang';
          if (Math.random() < rate) spawnDrop(gs, item, e.x, e.y);
        }
      }
    }
  }
}

function makeBat(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,       // knockback impulse
    r: ENEMY_BAT_RADIUS,
    hp: ENEMY_BAT_HP, maxHp: ENEMY_BAT_HP,
    flashTimer: 0,
    alive: true,
    type: 'bat',
    dropItem: 'small-bat-fang',
    dropRate: ENEMY_DROP_RATE,
    bobPhase: Math.random() * Math.PI * 2
  };
}

function makeCrocodile(x, y) {
  return {
    x, y,
    vx: 0, vy: 0,       // knockback impulse
    r: ENEMY_CROC_RADIUS,
    hp: ENEMY_CROC_HP, maxHp: ENEMY_CROC_HP,
    flashTimer: 0,
    alive: true,
    type: 'crocodile',
    face: -1,           // 1 = facing right, -1 = facing left (for drawing the snout)
    dropItem: 'crocodile-scale',
    dropRate: 1,        // always drops a scale on death
    bobPhase: Math.random() * Math.PI * 2
  };
}

// ===== 融合：对方的新世界（村庄 / 深渊 / 上层 / 爬行领主） =====

// Reconfigure the game for the forgotten cave village (lower cavern).
function setupVillageScene(gs) {
  gs.scene = 'village';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.worldWidth = Math.max(W * 2, 4600);
  const groundY = H - 150;
  gs.platforms = [{ x: 0, y: groundY, width: gs.worldWidth, height: 20 }];
  // a few mutant bats on the walk toward the village
  for (let i = 0; i < VILLAGE_BAT_COUNT; i++) {
    gs.enemies.push(makeBat(2150 + i * 200, H * 0.34));
  }
  // bigger houses (decorative only, no collision)
  gs.houses = [
    { x: 2650, y: groundY - 120, width: 200, height: 120 },
    { x: 3500, y: groundY - 140, width: 220, height: 140 },
    { x: 3850, y: groundY - 110, width: 180, height: 110 },
    { x: 4200, y: groundY - 130, width: 210, height: 130 }
  ];
  gs.campfire = { x: 3200, y: groundY };  // save point at the village center
  gs.npc = { id: 'elder', name: '老者', x: 3370, y: groundY };  // village elder beside the campfire (talk with ↑)
  gs.dialogue = null;
  gs.villageTitleShown = false;
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  // spawn: fall from the air, directly below the hole
  gs.spawn = { x: HOLE_X, y: 30 };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Reconfigure the game for the forgotten depths (cave beyond the village, with mutant crawlers).
function setupDepthsScene(gs) {
  gs.scene = 'depths';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.worldWidth = Math.max(W * 2, 3900);
  const groundY = H - 150;
  // upward terrain: return ledge -> flat floor -> staircase -> plateau -> the big pit at the end
  gs.platforms = [
    { x: 0, y: groundY - 70, width: 150, height: 20 },     // low ledge for the return entrance (left)
    { x: 0, y: groundY, width: 3320, height: 20 },         // bottom floor (up to the pit)
    { x: 1900, y: groundY - 90, width: 190, height: 20 },  // stair 1
    { x: 2090, y: groundY - 180, width: 190, height: 20 }, // stair 2
    { x: 2280, y: groundY - 270, width: 190, height: 20 }, // stair 3
    { x: 2470, y: groundY - 300, width: 850, height: 20 }, // plateau (up to the pit's near edge)
    { x: 3620, y: groundY - 300, width: 280, height: 20 }  // pit's far rim
  ];
  // mutant crawlers wander the bottom floor, kept clear of the pit
  for (let i = 0; i < DEPTHS_CRAWLER_COUNT; i++) {
    gs.enemies.push(makeCrawler(400 + i * 500, groundY, 0, 3300));
  }
  gs.houses = [];
  gs.npc = { id: 'guard', name: '村庄守卫', x: 3200, y: groundY - 300 }; // guard beside the big pit (talk with ↑)
  gs.dialogue = null;
  gs.campfire = null;
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  gs.spawn = { x: 200, y: groundY - PLAYER_RADIUS };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Upper layer of the new map (reached by falling into the depths' big pit).
function setupUpperScene(gs) {
  gs.scene = 'upper';
  gs.drops = []; gs.backpackOpen = false; gs.dragState = null; gs.backpackItemRects = []; gs.enemies = [];
  gs.worldWidth = Math.max(W * 2, 7200);
  const groundY = H - 150;
  // flat ground plus floating platforms, evenly spaced across the doubled map
  gs.platforms = [{ x: 0, y: groundY, width: gs.worldWidth, height: 20 }];
  const airHeights = [120, 180, 150, 200, 130, 175, 160, 210, 125, 185, 145, 195, 135, 170];
  for (let i = 0; i < airHeights.length; i++) {
    gs.platforms.push({ x: 300 + i * 480, y: groundY - airHeights[i], width: 170, height: 18 });
  }
  // seed a few enemies, then keep respawning up to the caps
  for (let i = 0; i < UPPER_CRAWLER_INITIAL; i++) {
    gs.enemies.push(makeCrawler(400 + Math.random() * (gs.worldWidth - 800), groundY));
  }
  for (let i = 0; i < UPPER_BAT_INITIAL; i++) {
    gs.enemies.push(makeBat(400 + Math.random() * (gs.worldWidth - 800), H * 0.35));
  }
  gs.spawnTimer = ENEMY_SPAWN_INTERVAL;
  gs.houses = [];
  gs.npc = null;
  gs.dialogue = null;
  gs.campfire = null;
  gs.caveX = -1;
  gs.gasX = GAS_START_X;
  gs.rocks = [];
  gs.boss = null;
  gs.wall = null;
  gs.wallX = 0;
  // random teleport: land at a random x, falling from the air
  gs.spawn = { x: 250 + Math.random() * (gs.worldWidth - 500), y: 30 };
  gs.player.x = gs.spawn.x;
  gs.player.y = gs.spawn.y;
  gs.player.vx = 0;
  gs.player.vy = 0;
}

// Player fell through the hole: fade down into the forgotten cave village.
function enterVillage() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  gs.fade = { alpha: 0, dir: 1, action: 'to-village' };
}

// Player reached the cave entrance at the village's right end: enter the forgotten depths.
function enterDepths() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  gs.fade = { alpha: 0, dir: 1, action: 'to-depths' };
}

// Player fell into the depths' big pit: random-teleport to the new map's upper layer.
function enterUpper() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  gs.fade = { alpha: 0, dir: 1, action: 'to-upper' };
}

// Player walked back through the depths' left entrance: return to the village.
function returnToVillage() {
  const gs = gameState;
  if (gs.status !== 'playing' || gs.fade) return;
  gs.fade = { alpha: 0, dir: 1, action: 'return-village' };
}

function showTitle(gs, text) {
  gs.titleText = { text, alpha: 1, timer: 0 };
}

// Mutant crawler enemy (forgotten depths) — ground-crawling ellipse.
function makeCrawler(x, groundY, minX, maxX) {
  groundY = (groundY != null) ? groundY : (H - 150);
  return {
    type: 'crawler',
    x,
    y: groundY - 12,              // ellipse center, bottom sits on the ground
    vx: 0, vy: 0,
    r: ENEMY_CRAWLER_RADIUS,
    rx: 30, ry: 12,
    hp: ENEMY_CRAWLER_HP, maxHp: ENEMY_CRAWLER_HP,
    flashTimer: 0,
    alive: true,
    dir: Math.random() < 0.5 ? -1 : 1,
    dirTimer: ENEMY_CRAWLER_DIR_INTERVAL,
    groundY,
    minX: (minX != null) ? minX : 0,
    maxX: (maxX != null) ? maxX : -1,
    bobPhase: Math.random() * Math.PI * 2
  };
}

// The Crawler Overlord: a huge crawler that cycles windup -> charge -> burrow -> emerge.
function makeOverlord(x, groundY) {
  groundY = (groundY != null) ? groundY : (H - 150);
  return {
    type: 'crawler-boss',
    x,
    y: groundY - OVERLORD_RY,
    vx: 0, vy: 0,
    r: OVERLORD_RADIUS,
    rx: OVERLORD_RX, ry: OVERLORD_RY,
    hp: OVERLORD_HP, maxHp: OVERLORD_HP,
    flashTimer: 0,
    alive: true,
    groundY,
    state: 'windup',
    stateTimer: OVERLORD_WINDUP_FRAMES,
    chargeDir: 1,
    buried: false,
    windupPhase: Math.random() * Math.PI * 2,
    bobPhase: Math.random() * Math.PI * 2
  };
}

function updateOverlord(gs, e, dt) {
  const p = gs.player;
  e.windupPhase += dt * 0.15;
  e.stateTimer -= dt;
  if (e.state === 'windup') {
    if (e.stateTimer <= 0) {
      e.state = 'charge';
      e.stateTimer = OVERLORD_CHARGE_FRAMES;
      e.chargeDir = (p.x >= e.x) ? 1 : -1;
    }
  } else if (e.state === 'charge') {
    e.x += e.chargeDir * OVERLORD_CHARGE_SPEED * dt;
    e.x = Math.max(OVERLORD_RADIUS, Math.min(gs.worldWidth - OVERLORD_RADIUS, e.x));
    if (e.stateTimer <= 0) {
      e.state = 'burrow';
      e.stateTimer = OVERLORD_BURROW_FRAMES;
      e.buried = true;
    }
  } else if (e.state === 'burrow') {
    if (e.stateTimer <= 0) {
      e.state = 'emerge';
      e.stateTimer = OVERLORD_EMERGE_FRAMES;
      const half = W * 0.4;
      const lo = Math.max(OVERLORD_RADIUS, p.x - half);
      const hi = Math.min(gs.worldWidth - OVERLORD_RADIUS, p.x + half);
      e.x = lo + Math.random() * (hi - lo);
      e.y = e.groundY - OVERLORD_RY;
      e.buried = false;
    }
  } else if (e.state === 'emerge') {
    if (e.stateTimer <= 0) {
      e.state = 'windup';
      e.stateTimer = OVERLORD_WINDUP_FRAMES;
    }
  }
}

// Upper-layer enemy respawning (crawlers & bats), with the overlord occasionally spawning.
function updateEnemySpawning(gs, dt) {
  if (gs.scene !== 'upper') return;
  gs.spawnTimer -= dt;
  if (gs.spawnTimer > 0) return;
  gs.spawnTimer = ENEMY_SPAWN_INTERVAL;
  let crawlers = 0, bats = 0;
  for (const e of gs.enemies) {
    if (!e.alive) continue;
    if (e.type === 'crawler') crawlers++;
    else if (e.type === 'bat') bats++;
  }
  if (crawlers < UPPER_CRAWLER_MAX) {
    const hasBoss = gs.enemies.some(e => e.alive && e.type === 'crawler-boss');
    if (!hasBoss && Math.random() < OVERLORD_SPAWN_CHANCE) {
      gs.enemies.push(makeOverlord(200 + Math.random() * (gs.worldWidth - 400), H - 150));
    } else {
      gs.enemies.push(makeCrawler(200 + Math.random() * (gs.worldWidth - 400), H - 150));
    }
  }
  if (bats < UPPER_BAT_MAX) {
    gs.enemies.push(makeBat(200 + Math.random() * (gs.worldWidth - 400), H * 0.3 + Math.random() * H * 0.25));
  }
}

// ----- Village elder NPC (talk with ↑) -----
function isNearNpc(gs) {
  return !!(gs.npc && Math.abs(gs.player.x - gs.npc.x) < 60);
}
function talkToNpc() {
  const gs = gameState;
  if (!gs || gs.status !== 'playing' || gs.fade || gs.dialogue) return;
  if (!isNearNpc(gs)) return;
  const name = gs.player.name || '旅人';
  if (gs.npc && gs.npc.id === 'guard') {
    gs.dialogue = {
      speaker: '村庄守卫',
      lines: [
        '你好"' + name + '"，我在村长那里听说你了。',
        '最近我们地下发生了地震，这个大坑就是这样出现的。',
        '我的四个同伴掉进去了，出来的只有两人......（神色黯淡）',
        '出来的同伴说，这个大洞很诡异，虽然他们是从一个地方掉下去的，但最后掉的地方却天差地别。'
      ],
      index: 0,
      first: false
    };
  } else if (gs.npcTalked) {
    gs.dialogue = {
      speaker: '老者',
      lines: ['旁边的篝火可以休息，如果你累了，坐在旁边烤烤火吧'],
      index: 0,
      first: false
    };
  } else {
    gs.dialogue = {
      speaker: '老者',
      lines: [
        '你好啊"' + name + '"，欢迎来到我们的村落。我是村长。',
        '在之前，由于村庄过于隐蔽，几乎从未有过外来人到我们这里来。',
        '可是，最近却接二连三的出现了不少外来人，进来时就满脸惊恐。',
        '他们说地表涌出了许多毒气，似乎还有一个怪兽。于是他们就逃了下来。',
        '你也是跟他们类似的原因吧。我本来半信半疑，但最近出现了一些变异的蝙蝠，似乎与毒气有关。',
        '哎，也不知道世界发生了什么事，祝君一路好运......'
      ],
      index: 0,
      first: true
    };
  }
}
function advanceDialogue() {
  const gs = gameState;
  if (!gs || !gs.dialogue) return;
  gs.dialogue.index++;
  if (gs.dialogue.index >= gs.dialogue.lines.length) {
    if (gs.dialogue.first) gs.npcTalked = true;
    gs.dialogue = null;
  }
}

function damagePlayer(gs, amount) {
  const p = gs.player;
  if (p.invTimer > 0 || gs.status !== 'playing') return; // brief invulnerability after a hit
  p.hp -= amount;
  p.invTimer = PLAYER_INVULN;
  gs.shakeTimer = SHAKE_DURATION;
  gs.healing = false;  // taking damage interrupts the campfire heal
  if (p.hp <= 0) {
    p.hp = 0;
    gameOver();
  }
}

function updateEnemies(gs, dt) {
  const p = gs.player;
  for (let i = gs.enemies.length - 1; i >= 0; i--) {
    const e = gs.enemies[i];
    if (!e.alive) { gs.enemies.splice(i, 1); continue; }
    if (e.flashTimer > 0) e.flashTimer -= dt;
    // crocodiles crawl along the ground toward the player (no flying)
    if (e.type === 'crocodile') {
      const groundY = H - 150;
      const dir = (p.x >= e.x) ? 1 : -1;
      e.face = dir;
      e.x += dir * ENEMY_CROC_SPEED * dt;
      e.y = groundY - e.r;            // stay glued to the floor
      e.vx = 0; e.vy = 0;
      // contact: bite the player, then shove the croc back so it can't hit every frame
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.radius) {
        damagePlayer(gs, ENEMY_CROC_DAMAGE);
        const s = (e.x >= p.x) ? 1 : -1;
        e.x = p.x + s * (e.r + p.radius + 2);
        e.y = groundY - e.r;
      }
      continue;
    }
    // mutant crawlers wander the ground (forgotten depths)
    if (e.type === 'crawler') {
      e.dirTimer -= dt;
      if (e.dirTimer <= 0) {
        e.dirTimer = ENEMY_CRAWLER_DIR_INTERVAL;
        e.dir = Math.random() < 0.5 ? -1 : 1;
      }
      e.x += e.dir * ENEMY_CRAWLER_SPEED * dt;
      const lo = e.minX + e.r;
      const hi = (e.maxX >= 0 ? e.maxX : gs.worldWidth) - e.r;
      if (e.x < lo) { e.x = lo; e.dir = 1; }
      if (e.x > hi) { e.x = hi; e.dir = -1; }
      e.y = e.groundY - e.ry;
      // contact damage
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.radius) {
        damagePlayer(gs, ENEMY_CRAWLER_DAMAGE);
        const away = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        e.x = p.x + ((e.x - p.x) / away) * (e.r + p.radius + 2);
        e.y = p.y + ((e.y - p.y) / away) * (e.r + p.radius + 2);
      }
      continue;
    }
    // crawler overlord (final boss on the upper layer) — falls through to contact damage below
    if (e.type === 'crawler-boss') {
      updateOverlord(gs, e, dt);
    }
    // fly slowly toward the player
    let dx = p.x - e.x, dy = p.y - e.y;
    let len = Math.hypot(dx, dy);
    if (len > 1) {
      e.x += (dx / len) * ENEMY_FLY_SPEED * dt;
      e.y += (dy / len) * ENEMY_FLY_SPEED * dt;
    }
    // knockback impulse (decays)
    if (e.type !== 'crawler-boss') {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= ENEMY_KNOCKBACK_DECAY;
      e.vy *= ENEMY_KNOCKBACK_DECAY;
    }
    e.bobPhase += dt * 0.1;
    // contact: damage the player, then bounce the bat away so it can't hit every frame
    dx = p.x - e.x; dy = p.y - e.y;
    if (!e.buried && Math.hypot(dx, dy) < e.r + p.radius) {
      const dmg = e.type === 'crocodile' ? ENEMY_CROC_DAMAGE
                : e.type === 'crawler' ? ENEMY_CRAWLER_DAMAGE
                : e.type === 'crawler-boss' ? OVERLORD_DAMAGE
                : ENEMY_BAT_DAMAGE;
      damagePlayer(gs, dmg);
      if (e.type !== 'crawler-boss') {
        const away = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        e.vx = ((e.x - p.x) / away) * ENEMY_KNOCKBACK * 1.6;
        e.vy = ((e.y - p.y) / away) * ENEMY_KNOCKBACK * 1.6;
        e.x = p.x + ((e.x - p.x) / away) * (e.r + p.radius + 2);
        e.y = p.y + ((e.y - p.y) / away) * (e.r + p.radius + 2);
      }
    }
  }
}

// ----- Item drops & inventory -----
function spawnDrop(gs, itemId, x, y) {
  gs.drops.push({ itemId, x, y, vx: (Math.random() - 0.5) * 3, vy: -2, r: 16, onGround: false });
}

function updateDrops(gs, dt) {
  const groundY = H - 150;
  for (const d of gs.drops) {
    if (d.onGround) continue;
    d.vy += gs.gravity * dt;
    if (d.vy > gs.maxFallSpeed) d.vy = gs.maxFallSpeed;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= 0.98;
    if (d.y + d.r >= groundY) {
      d.y = groundY - d.r;
      d.vy = 0; d.vx = 0;
      d.onGround = true;
    }
  }
  // auto-pickup: items within the player's diameter
  const pickupR = PLAYER_RADIUS * 2;
  for (let i = gs.drops.length - 1; i >= 0; i--) {
    const d = gs.drops[i];
    if (Math.hypot(d.x - gs.player.x, d.y - gs.player.y) <= pickupR) {
      pickUpItem(gs, d.itemId);
      gs.drops.splice(i, 1);
    }
  }
  // fade out pickup notifications
  for (let i = gs.pickups.length - 1; i >= 0; i--) {
    gs.pickups[i].timer -= dt;
    if (gs.pickups[i].timer <= 0) gs.pickups.splice(i, 1);
  }
}

function pickUpItem(gs, itemId) {
  const def = ITEM_DEFS[itemId];
  if (!def) return;
  gs.inventory[itemId] = (gs.inventory[itemId] || 0) + 1;
  if (!gs.backpackUnlocked) gs.backpackUnlocked = true;
  gs.pickups.push({ text: def.name + '（' + itemCategoryLabel(def.category) + '）', timer: 150 });
  saveServerProgress(); // mirror the new gear to the cloud immediately
}

function toggleBackpack() {
  const gs = gameState;
  if (!gs || !gs.backpackUnlocked || gs.fade || gs.status !== 'playing') return;
  gs.backpackOpen = !gs.backpackOpen;
  gs.dragState = null;
}

function tryAttack() {
  const gs = gameState;
  if (!gs || gs.status !== 'playing' || gs.backpackOpen || gs.fade) return;
  const itemId = gs.weaponSlot;
  if (!itemId || !ITEM_DEFS[itemId]) return;
  if (gs.attack) return; // one slash at a time
  const def = ITEM_DEFS[itemId];
  const range = def.range || PLAYER_RADIUS * 2;
  const damage = def.damage || 0;
  gs.attack = { timer: ATTACK_DURATION, duration: ATTACK_DURATION, dir: gs.player.face, range };
  // resolve the hit immediately: enemies in front, within range, take damage + flash
  attackHitEnemies(gs, range, damage, itemId);
}

// ----- Cave drawing -----
function drawRocks(cam) {
  for (let rock of gameState.rocks) {
    if (!rock.alive && rock.flashTimer <= 0) continue;
    const sx = rock.x - cam, sy = rock.y;
    if (sx < -rock.r * 2 || sx > W + rock.r * 2) continue;

    let alpha = 1, fill = '#c8a24a';
    if (rock.flashTimer > 0) {
      const blink = (Math.floor(rock.flashTimer / 3) % 2) === 0;
      fill = blink ? '#ffffff' : '#c8a24a';
      alpha = blink ? 0.95 : 0.45;
    }
    gctx.save();
    gctx.globalAlpha = alpha;
    gctx.beginPath();
    const pts = rock.verts;
    gctx.moveTo(sx + pts[0][0], sy + pts[0][1]);
    for (let i = 1; i < pts.length; i++) gctx.lineTo(sx + pts[i][0], sy + pts[i][1]);
    gctx.closePath();
    gctx.fillStyle = fill;
    gctx.fill();
    gctx.strokeStyle = 'rgba(90,66,24,0.8)';
    gctx.lineWidth = 2;
    gctx.stroke();
    gctx.restore();
  }
}

function drawBoss(cam) {
  const b = gameState.boss;
  if (!b || !b.appeared || b.state === 'gone') return;

  const sx = b.x - cam, sy = b.y;
  let fill = '#4a3220'; // dark brown placeholder (image later)
  if (b.flashTimer > 0) {
    const blink = (Math.floor(b.flashTimer / 3) % 2) === 0;
    fill = blink ? '#ffffff' : '#4a3220';
  }
  gctx.beginPath();
  gctx.arc(sx, sy, b.r, 0, Math.PI * 2);
  gctx.fillStyle = fill;
  gctx.fill();
  gctx.strokeStyle = 'rgba(20,12,6,0.7)';
  gctx.lineWidth = 3;
  gctx.stroke();
}

function drawBossHealthBar() {
  const gs = gameState;
  const b = gs.boss;
  if (!b || !b.appeared) return;
  let alpha = 1;
  if (b.state === 'dying' || b.state === 'gone') alpha = Math.max(0, 1 - b.deadTimer / 90);
  if (alpha <= 0) return;

  const barW = Math.min(W * 0.6, 600);
  const barH = 20;
  const x = (W - barW) / 2;
  const y = 22;

  gctx.save();
  gctx.globalAlpha = alpha;
  // background
  gctx.fillStyle = 'rgba(0,0,0,0.55)';
  gctx.fillRect(x, y, barW, barH);
  // red health fill
  const frac = Math.max(0, b.hp / b.maxHp);
  gctx.fillStyle = '#e33b3b';
  gctx.fillRect(x, y, barW * frac, barH);
  // border
  gctx.strokeStyle = 'rgba(255,255,255,0.35)';
  gctx.lineWidth = 1;
  gctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);
  // name below the bar
  gctx.fillStyle = '#ffffff';
  gctx.font = '16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('巨型变异蝙蝠', W / 2, y + barH + 8);
  gctx.restore();
}

// Player HP bar (bottom-right): a white long bar representing current health out of max.
function drawPlayerHealthBar() {
  const gs = gameState;
  const p = gs.player;
  const barW = 200, barH = 16;
  const x = W - barW - 16;
  const y = H - barH - 16;
  // background
  gctx.fillStyle = 'rgba(0,0,0,0.55)';
  gctx.fillRect(x, y, barW, barH);
  // white health fill (shrinks as HP drops)
  const frac = Math.max(0, p.hp / p.maxHp);
  gctx.fillStyle = '#ffffff';
  gctx.fillRect(x, y, barW * frac, barH);
  // border
  gctx.strokeStyle = 'rgba(255,255,255,0.35)';
  gctx.lineWidth = 1;
  gctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);
}

function drawWall(cam) {
  const gs = gameState;
  if (!gs.wall) return;
  const groundY = H - 150;
  const holeH = gs.wall.holeOpen ? WALL_HOLE_H : 0;
  const wallBottom = groundY - holeH;

  let ox = 0, oy = 0;
  if (gs.wall.shakeTimer > 0) {
    ox = Math.sin(gs.wall.shakeTimer * 1.1) * 6;
    oy = Math.cos(gs.wall.shakeTimer * 0.9) * 3;
  }

  const left = gs.wallX - cam + ox;
  const right = gs.worldWidth - cam + ox;
  const top = oy;
  const bottom = wallBottom + oy;
  if (right < 0 || left > W || bottom <= top) return;

  gctx.save();
  // solid gray stone body
  gctx.fillStyle = '#6e6e6e';
  gctx.fillRect(left, top, right - left, bottom - top);

  // brick/stone joints
  gctx.strokeStyle = 'rgba(30,30,34,0.55)';
  gctx.lineWidth = 2;
  const blockH = 42, blockW = 46;
  let row = 0;
  for (let y = top; y < bottom; y += blockH) {
    gctx.beginPath();
    gctx.moveTo(left, y);
    gctx.lineTo(right, y);
    gctx.stroke();
    const offset = (row % 2) * (blockW / 2);
    for (let x = left - blockW + offset; x < right + blockW; x += blockW) {
      gctx.beginPath();
      gctx.moveTo(x, y);
      gctx.lineTo(x, Math.min(y + blockH, bottom));
      gctx.stroke();
    }
    row++;
  }

  // edge shading
  gctx.fillStyle = 'rgba(0,0,0,0.25)';
  gctx.fillRect(left, top, 6, bottom - top);
  gctx.fillStyle = 'rgba(255,255,255,0.10)';
  gctx.fillRect(right - 6, top, 6, bottom - top);
  gctx.restore();

  // exit hole at the base (through the wall to the next level)
  if (gs.wall.holeOpen) {
    gctx.fillStyle = '#030304';
    gctx.fillRect(left, bottom, right - left, holeH);
    gctx.strokeStyle = 'rgba(0,0,0,0.5)';
    gctx.lineWidth = 3;
    gctx.strokeRect(left, bottom, right - left, holeH);
  }
}

// Make initGame async so we can show the intro overlay before starting the loop.
async function initGame(playerName) {
  inGame = true;
  resizeCanvases();

  // Admin accounts get one-click level teleport buttons.
  // 管理员状态由数据库驱动（通过管理面板设置），硬编码种子账号作为兜底。
  const seedAdmins = ['renxt', 'yan', 'admin'];
  const isAdmin = _isAdmin || seedAdmins.includes((playerName || '').trim().toLowerCase());

  const player = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    radius: PLAYER_RADIUS,
    color: '#ffffff',
    name: playerName,
    face: 1, // 1 = facing right, -1 = facing left (for the weapon slash)
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    invTimer: 0 // invulnerability frames after taking a hit
  };

  const input = { left: false, right: false, jump: false, jumpHeld: false };

  function keyDown(e) {
    const k = e.key;
    // 对话进行中：空格/回车推进对话，屏蔽其他输入
    if (gameState && gameState.dialogue) {
      if (k === ' ' || e.code === 'Space' || k === 'Enter') {
        if (!e.repeat) advanceDialogue();
        e.preventDefault();
      }
      return;
    }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = true;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = true;
    // ↑ near NPC 对话（不跳跃）；↑ 在篝火旁存档；否则 ↑/Space/W 跳跃
    const talkingToNpc = (k === 'ArrowUp') && gameState && isNearNpc(gameState);
    const savingAtCampfire = (k === 'ArrowUp') && gameState && isNearCampfire(gameState);
    if (talkingToNpc) {
      if (!e.repeat) talkToNpc();
    } else if (savingAtCampfire) {
      if (!e.repeat) saveAtCampfire();
    } else if (e.code === 'Space' || k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      input.jump = true;
      input.jumpHeld = true;
      if (e.code === 'Space' || k === ' ') e.preventDefault();
    }
    // allow continuing from game-over with Space / Enter
    if (gameState && gameState.status === 'gameover' && (k === ' ' || k === 'Enter')) continueRespawn();
    if (gameState && gameState.status === 'victory' && (k === ' ' || k === 'Enter')) restartFromChase();
    // open/close the backpack (once unlocked)
    if (k === 'z' || k === 'Z') toggleBackpack();
    // attack with the equipped weapon
    if (k === 'f' || k === 'F') tryAttack();
  }
  function keyUp(e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') input.right = false;
    if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      input.jump = false;
      input.jumpHeld = false;
      // release jump early -> cut upward speed so the player falls sooner (shorter hop)
      if (player.vy < 0) player.vy *= JUMP_CUT;
    }
  }
  window.addEventListener('keydown', keyDown, { passive: false });
  window.addEventListener('keyup', keyUp, { passive: true });

  function touchStart(e) {
    const t = e.touches[0];
    if (!t) return;
    if (gameState && gameState.status === 'gameover') { continueRespawn(); return; }
    const tx = t.clientX, ty = t.clientY;
    // backpack button (bottom-left) opens the backpack
    if (gameState && gameState.backpackUnlocked && !gameState.backpackOpen && gameState.backpackBtnRect) {
      const b = gameState.backpackBtnRect;
      if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
        toggleBackpack();
        return;
      }
    }
    // admin teleport buttons (top-left)
    if (gameState && gameState.isAdmin && gameState.status === 'playing' && gameState.adminButtons) {
      for (const b of gameState.adminButtons) {
        if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
          teleportTo(b.scene);
          return;
        }
      }
    }
    if (ty < H * 0.4) { input.jump = true; input.jumpHeld = true; }
    else if (tx < W / 3) input.left = true;
    else if (tx > (W * 2) / 3) input.right = true;
  }
  function touchEnd(e) {
    if (input.jumpHeld && player.vy < 0) player.vy *= JUMP_CUT;
    input.left = false; input.right = false; input.jump = false; input.jumpHeld = false;
  }
  window.addEventListener('touchstart', touchStart, { passive: true });
  window.addEventListener('touchend', touchEnd, { passive: true });
  window.addEventListener('touchcancel', touchEnd, { passive: true });

  // backpack drag-and-drop (mouse): drag a weapon onto the weapon slot to equip
  function mouseDown(e) {
    const gs = gameState;
    if (!gs || !gs.backpackOpen || gs.fade) return;
    if (!gs.backpackItemRects) return;
    for (const it of gs.backpackItemRects) {
      if (it.category === 'weapon' &&
          e.clientX >= it.x && e.clientX <= it.x + it.w &&
          e.clientY >= it.y && e.clientY <= it.y + it.h) {
        gs.dragState = { itemId: it.itemId, x: e.clientX, y: e.clientY };
        return;
      }
    }
  }
  function mouseMove(e) {
    const gs = gameState;
    if (gs && gs.dragState) { gs.dragState.x = e.clientX; gs.dragState.y = e.clientY; }
  }
  function mouseUp(e) {
    const gs = gameState;
    if (!gs || !gs.dragState) return;
    const r = gs.weaponSlotRect;
    if (r && e.clientX >= r.x && e.clientX <= r.x + r.w &&
        e.clientY >= r.y && e.clientY <= r.y + r.h) {
      const newId = gs.dragState.itemId;
      // return the previously-equipped weapon to the backpack
      if (gs.weaponSlot) {
        gs.inventory[gs.weaponSlot] = (gs.inventory[gs.weaponSlot] || 0) + 1;
      }
      // consume one of the dragged weapon from the backpack
      gs.inventory[newId] = (gs.inventory[newId] || 0) - 1;
      if (gs.inventory[newId] <= 0) delete gs.inventory[newId];
      gs.weaponSlot = newId;
    }
    gs.dragState = null;
  }
  window.addEventListener('mousedown', mouseDown);
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('mouseup', mouseUp);

  // clicking the on-screen "Continue" button respawns after death
  function clickHandler(e) {
    const gs = gameState;
    if (!gs || gs.fade || gs.backpackOpen) return;
    // backpack button (bottom-left) opens the backpack
    if (gs.backpackUnlocked && gs.backpackBtnRect) {
      const b = gs.backpackBtnRect;
      if (e.clientX >= b.x && e.clientX <= b.x + b.w &&
          e.clientY >= b.y && e.clientY <= b.y + b.h) {
        toggleBackpack();
        return;
      }
    }
    // admin teleport buttons (top-left), available while playing
    if (gs.isAdmin && gs.status === 'playing' && gs.adminButtons) {
      for (const b of gs.adminButtons) {
        if (e.clientX >= b.x && e.clientX <= b.x + b.w &&
            e.clientY >= b.y && e.clientY <= b.y + b.h) {
          teleportTo(b.scene);
          return;
        }
      }
    }
    if (gs.status !== 'gameover') return;
    const rect = gs.continueRect;
    if (!rect) return;
    if (e.clientX >= rect.x && e.clientX <= rect.x + rect.w &&
        e.clientY >= rect.y && e.clientY <= rect.y + rect.h) {
      continueRespawn();
    }
  }
  window.addEventListener('click', clickHandler);

  gameState = {
    player, input, platforms: [],
    gravity: GRAVITY, moveAccel: MOVE_ACCEL, maxSpeed: MAX_SPEED, friction: FRICTION, jumpImpulse: JUMP_IMPULSE, maxFallSpeed: MAX_FALL_SPEED,
    worldWidth: W, caveX: -1,
    gasX: GAS_START_X, gasSpeed: GAS_SPEED,
    scene: 'chase',
    spawn: { x: 0, y: 0 },
    rocks: [], boss: null, bossTriggerX: 0, continueRect: null,
    wall: null, wallX: 0,
    isAdmin, adminButtons: [],
    drops: [], inventory: {}, weaponSlot: null,
    backpackUnlocked: true, backpackOpen: false,
    pickups: [], backpackBtnRect: null, weaponSlotRect: null, backpackItemRects: [], dragState: null,
    attack: null,
    enemies: [], campfire: null, healing: false,
    status: 'playing', statusTimer: 0, savingTimer: 0, shakeTimer: 0,
    fade: null,
    lastTime: performance.now(), running: true,
    cleanup() {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('touchstart', touchStart);
      window.removeEventListener('touchend', touchEnd);
      window.removeEventListener('touchcancel', touchEnd);
      window.removeEventListener('click', clickHandler);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', mouseUp);
      this.running = false;
    }
  };

  showAdminButton(); // 管理员账户显示「管理面板」按钮

  // restore saved inventory / backpack / equipped weapon
  const savedInfo = loadInventory(playerName);
  if (savedInfo) {
    gameState.inventory = savedInfo.inventory || {};
    gameState.weaponSlot = savedInfo.weaponSlot || null;
    gameState.backpackUnlocked = true;
  }

  // Start in the furthest scene this player already reached.
  if (hasEnteredLevel4(playerName)) setupLevel4Scene(gameState);
  else if (hasEnteredLevel2(playerName)) setupLevel2Scene(gameState);
  else if (hasEnteredCave(playerName)) setupCaveScene(gameState);
  else setupChaseScene(gameState);

  window.DeepestGame = window.DeepestGame || {};
  window.DeepestGame.lastPlayerX = player.x;
  window.DeepestGame.cameraX = clamp(player.x - W / 2, 0, gameState.worldWidth - W);
  window.DeepestGame.scene = gameState.scene;

  // Show the intro overlay if not seen before by this player. Wait for dismissal.
  try {
    if (!hasSeenIntro(playerName)) {
      await showIntroOverlay(playerName);
    }
  } catch (e) {
    console.warn('Intro overlay error:', e);
  }

  // start the game loop
  requestAnimationFrame(gameLoop);
}

// One step of gameplay physics + scene-specific win/lose checks.
function updatePlaying(gs, dt) {
  const p = gs.player;
  const inp = gs.input;

  // --- horizontal movement ---
  if (inp.left && !inp.right) p.vx -= gs.moveAccel * dt;
  if (inp.right && !inp.left) p.vx += gs.moveAccel * dt;
  if (inp.left && !inp.right) p.face = -1;
  if (inp.right && !inp.left) p.face = 1;
  if (p.vx > gs.maxSpeed) p.vx = gs.maxSpeed;
  if (p.vx < -gs.maxSpeed) p.vx = -gs.maxSpeed;
  if (!inp.left && !inp.right) p.vx *= gs.friction;

  // --- gravity + jump ---
  p.vy += gs.gravity * dt;
  if (p.vy > gs.maxFallSpeed) p.vy = gs.maxFallSpeed; // terminal velocity prevents tunneling through platforms
  const wasOn = isPlayerOnAnyPlatform(p, gs.platforms);
  if (wasOn && inp.jump) {
    p.vy = gs.jumpImpulse;
    inp.jump = false;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // world horizontal bounds (the cave's stone wall blocks the right side until it opens)
  if (p.x - p.radius < 0) { p.x = p.radius; p.vx = 0; }
  let rightBound = gs.worldWidth;
  if (gs.scene === 'cave' && gs.wall && !gs.wall.holeOpen) rightBound = gs.wallX;
  if (p.x + p.radius > rightBound) { p.x = rightBound - p.radius; p.vx = 0; }

  // platform collisions
  for (let iter = 0; iter < 3; iter++) {
    let anyResolve = false;
    for (let plat of gs.platforms) {
      const result = resolveCircleRectCollision(p, plat);
      if (result) {
        anyResolve = true;
        p.x += result.normalX * result.penetration;
        p.y += result.normalY * result.penetration;
        const velAlongNormal = p.vx * result.normalX + p.vy * result.normalY;
        if (velAlongNormal < 0) {
          p.vx -= result.normalX * velAlongNormal;
          p.vy -= result.normalY * velAlongNormal;
        }
        if (result.normalY < -0.5) p.vy = 0;
        if (result.normalY > 0.5) p.vy = Math.max(0, p.vy);
      }
    }
    if (!anyResolve) break;
  }

  // item drops: physics + auto-pickup
  updateDrops(gs, dt);

  // enemies (mutant bats)
  updateEnemies(gs, dt);

  // equipped-weapon slash timer
  if (gs.attack) {
    gs.attack.timer -= dt;
    if (gs.attack.timer <= 0) gs.attack = null;
  }

  // player invulnerability timer
  if (p.invTimer > 0) p.invTimer -= dt;

  // heal at the campfire: quickly refill HP to full
  if (gs.healing) {
    p.hp = Math.min(p.maxHp, p.hp + HEAL_SPEED * dt);
    if (p.hp >= p.maxHp) gs.healing = false;
  }

  // --- scene-specific checks ---
  if (gs.scene === 'chase') {
    gs.gasX += gs.gasSpeed * dt;
    if (p.x - p.radius < gs.gasX + 2) {
      gameOver(); // caught by the gas
    } else if (p.y - p.radius > H + 40) {
      gameOver(); // fell into the abyss
    } else if (p.x >= gs.caveX) {
      enterCave(); // reached the cave -> fade into the next scene
    }
  } else if (gs.scene === 'cave') {
    updateCaveScene(gs, dt);
  } else if (gs.scene === 'level2') {
    updateLevel2Scene(gs, dt);
  } else if (gs.scene === 'level4') {
    updateLevel4Scene(gs, dt);
  } else if (gs.scene === 'village') {
    if (!gs.villageTitleShown && p.x >= VILLAGE_ENTER_X) {
      gs.villageTitleShown = true;
      showTitle(gs, '遗忘的山洞村庄');
    }
    if (p.x >= VILLAGE_RETURN_X) enterDepths();
  } else if (gs.scene === 'depths') {
    if (p.x <= DEPTHS_RETURN_X && p.y < (H - 150) - 40) returnToVillage();
    if (p.y - p.radius > H - 90) enterUpper();
  } else if (gs.scene === 'upper') {
    updateEnemySpawning(gs, dt);
  } else {
    updateCaveScene(gs, dt);
  }
}

function gameLoop(now) {
  if (!gameState || !gameState.running) return;
  const dt = Math.min(32, now - gameState.lastTime) / 16.6667;
  gameState.lastTime = now;

  const gs = gameState;

  if (gs.fade) {
    updateFade(gs, dt);
  } else if (gs.status === 'playing' && !gs.backpackOpen && !gs.dialogue) {
    updatePlaying(gs, dt);
  }
  // gameover: wait for the player to press "Continue" (no auto-restart)

  if (gs.savingTimer > 0) gs.savingTimer -= dt;
  if (gs.shakeTimer > 0) gs.shakeTimer -= dt;
  // 村庄标题文字：停留片刻后淡出
  if (gs.titleText) {
    gs.titleText.timer += dt;
    const hold = 60, fadeDur = 100;
    if (gs.titleText.timer > hold) {
      gs.titleText.alpha = Math.max(0, 1 - (gs.titleText.timer - hold) / fadeDur);
    }
    if (gs.titleText.timer > hold + fadeDur) gs.titleText = null;
  }

  // update camera (the background parallax reads window.DeepestGame)
  const p = gs.player;
  const cameraX = clamp(p.x - W / 2, 0, Math.max(0, gs.worldWidth - W));
  window.DeepestGame = window.DeepestGame || {};
  window.DeepestGame.lastPlayerX = p.x;
  window.DeepestGame.cameraX = cameraX;
  window.DeepestGame.scene = gs.scene;

  drawGameScene();
  requestAnimationFrame(gameLoop);
}

function isPlayerOnAnyPlatform(p, platforms) {
  const tol = 1.2;
  for (let plat of platforms) {
    const overlapX = (p.x + p.radius - 0.5) > plat.x && (p.x - p.radius + 0.5) < (plat.x + plat.width);
    const bottom = p.y + p.radius;
    if (overlapX && Math.abs(bottom - plat.y) <= tol && p.vy >= -1) return true;
  }
  return false;
}

function drawCampfire(cam) {
  const gs = gameState;
  if (!gs.campfire) return;
  const cx = gs.campfire.x - cam;
  const cy = gs.campfire.y;
  const t = performance.now() / 1000;
  // soft glow
  gctx.beginPath();
  gctx.fillStyle = 'rgba(255,150,50,0.14)';
  gctx.arc(cx, cy - 14, 26, 0, Math.PI * 2);
  gctx.fill();
  // logs
  gctx.fillStyle = '#5d3a1e';
  gctx.fillRect(cx - 16, cy - 7, 32, 7);
  gctx.fillRect(cx - 12, cy - 13, 24, 6);
  // outer flame (flickers)
  const f = Math.sin(t * 11) * 2 + Math.sin(t * 23) * 1.5;
  gctx.beginPath();
  gctx.moveTo(cx - 11, cy - 8);
  gctx.lineTo(cx, cy - 30 - f);
  gctx.lineTo(cx + 11, cy - 8);
  gctx.closePath();
  gctx.fillStyle = '#ff7a1a';
  gctx.fill();
  // inner flame
  gctx.beginPath();
  gctx.moveTo(cx - 5, cy - 8);
  gctx.lineTo(cx, cy - 18 - f * 0.6);
  gctx.lineTo(cx + 5, cy - 8);
  gctx.closePath();
  gctx.fillStyle = '#ffd54a';
  gctx.fill();
  // prompt when the player is close enough to save
  if (isNearCampfire(gs)) {
    gctx.font = '16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.fillStyle = '#ffd54a';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'bottom';
    gctx.fillText('按↑即可存档', cx, cy - 38);
  }
}

function drawVillage(cam) {
  const gs = gameState;
  if (gs.scene !== 'village' || !gs.houses) return;
  for (const h of gs.houses) {
    const hx = h.x - cam;
    // wall
    gctx.fillStyle = '#4a3a2c';
    gctx.fillRect(hx, h.y, h.width, h.height);
    // roof
    gctx.beginPath();
    gctx.moveTo(hx - 8, h.y);
    gctx.lineTo(hx + h.width / 2, h.y - 32);
    gctx.lineTo(hx + h.width + 8, h.y);
    gctx.closePath();
    gctx.fillStyle = '#2a201c';
    gctx.fill();
    // door (dark, cannot be entered)
    gctx.fillStyle = '#120d0a';
    gctx.fillRect(hx + h.width / 2 - 8, h.y + h.height - 26, 16, 26);
    // lit windows
    gctx.fillStyle = '#ffca5a';
    gctx.fillRect(hx + h.width * 0.2, h.y + 14, 14, 12);
    gctx.fillRect(hx + h.width * 0.75, h.y + 14, 14, 12);
  }
}

function drawStoneWall(cam, x, width, bottomY) {
  const left = x - cam;
  const right = left + width;
  if (right < -40 || left > W + 40) return;
  const top = 0;
  // solid gray stone body
  gctx.fillStyle = '#6e6e6e';
  gctx.fillRect(left, top, width, bottomY - top);
  // brick/stone joints
  gctx.strokeStyle = 'rgba(30,30,34,0.55)';
  gctx.lineWidth = 2;
  const blockH = 42, blockW = 46;
  let row = 0;
  for (let y = top; y < bottomY; y += blockH) {
    gctx.beginPath();
    gctx.moveTo(left, y);
    gctx.lineTo(right, y);
    gctx.stroke();
    const offset = (row % 2) * (blockW / 2);
    for (let x2 = left - blockW + offset; x2 < right + blockW; x2 += blockW) {
      gctx.beginPath();
      gctx.moveTo(x2, y);
      gctx.lineTo(x2, Math.min(y + blockH, bottomY));
      gctx.stroke();
    }
    row++;
  }
  // edge shading
  gctx.fillStyle = 'rgba(0,0,0,0.25)';
  gctx.fillRect(left, top, 6, bottomY - top);
  gctx.fillStyle = 'rgba(255,255,255,0.10)';
  gctx.fillRect(right - 6, top, 6, bottomY - top);
}

function drawVillageReturn(cam) {
  const groundY = H - 150;
  const wallW = 150;
  const mouthW = 100;
  const mouthTop = groundY - 140;
  const mouthX = VILLAGE_RETURN_X + (wallW - mouthW) / 2;
  // stone wall face rising above the entrance, to the top of the screen
  drawStoneWall(cam, VILLAGE_RETURN_X, wallW, groundY);
  // cave mouth set into the wall's base, at ground level
  gctx.fillStyle = '#030304';
  gctx.fillRect(mouthX - cam, mouthTop, mouthW, H - mouthTop);
  gctx.strokeStyle = 'rgba(0,0,0,0.6)';
  gctx.lineWidth = 2;
  gctx.strokeRect(mouthX - cam, mouthTop, mouthW, H - mouthTop);
}

function drawDepthsReturn(cam) {
  const groundY = H - 150;
  const ledgeY = groundY - 70;
  const wallW = 130;
  // stone wall face at the left edge, rising from the low ledge to the top of the screen
  drawStoneWall(cam, 0, wallW, groundY);
  // cave mouth set into the wall, sitting on the low ledge
  gctx.fillStyle = '#030304';
  gctx.fillRect(20 - cam, ledgeY - 90, 80, 90);
  gctx.strokeStyle = 'rgba(0,0,0,0.6)';
  gctx.lineWidth = 2;
  gctx.strokeRect(20 - cam, ledgeY - 90, 80, 90);
  // low stone ledge the player jumps onto
  gctx.fillStyle = '#7a7a7a';
  gctx.fillRect(0 - cam, ledgeY, wallW + 20, 18);
  gctx.strokeStyle = 'rgba(30,30,34,0.55)';
  gctx.lineWidth = 2;
  gctx.strokeRect(0 - cam, ledgeY, wallW + 20, 18);
}

function drawDepthsPit(cam) {
  const groundY = H - 150;
  const px = DEPTHS_PIT_X - cam;
  // dark pit shaft at the depths' right end (falling in teleports to the upper layer)
  gctx.fillStyle = '#030304';
  gctx.fillRect(px, groundY - 300, DEPTHS_PIT_W, H - (groundY - 300));
  gctx.strokeStyle = 'rgba(0,0,0,0.6)';
  gctx.lineWidth = 2;
  gctx.strokeRect(px, groundY - 300, DEPTHS_PIT_W, H - (groundY - 300));
}

function drawNpc(cam) {
  const gs = gameState;
  if (!gs.npc) return;
  const cx = gs.npc.x - cam;
  const groundY = gs.npc.y;
  const cy = groundY - PLAYER_RADIUS;   // 身体中心高度
  const r = PLAYER_RADIUS;
  // 地面阴影
  gctx.fillStyle = 'rgba(0,0,0,0.28)';
  gctx.beginPath();
  gctx.ellipse(cx, groundY - 2, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
  gctx.fill();
  // 长袍（暖棕）
  gctx.fillStyle = '#7a5c3e';
  gctx.beginPath();
  gctx.moveTo(cx - r * 0.72, groundY - 2);
  gctx.lineTo(cx - r * 0.42, cy - r * 0.15);
  gctx.lineTo(cx + r * 0.42, cy - r * 0.15);
  gctx.lineTo(cx + r * 0.72, groundY - 2);
  gctx.closePath();
  gctx.fill();
  // 衣领
  gctx.fillStyle = '#9c7a52';
  gctx.fillRect(cx - r * 0.42, cy - r * 0.18, r * 0.84, r * 0.16);
  // 头（肤色）
  gctx.fillStyle = '#f1c79b';
  gctx.beginPath();
  gctx.arc(cx, cy - r * 0.5, r * 0.5, 0, Math.PI * 2);
  gctx.fill();
  // 白胡子
  gctx.fillStyle = '#f3f1ea';
  gctx.beginPath();
  gctx.moveTo(cx - r * 0.42, cy - r * 0.28);
  gctx.quadraticCurveTo(cx, cy + r * 0.02, cx + r * 0.42, cy - r * 0.28);
  gctx.quadraticCurveTo(cx, cy - r * 0.62, cx - r * 0.42, cy - r * 0.28);
  gctx.closePath();
  gctx.fill();
  // 尖帽
  gctx.fillStyle = '#3b2f2a';
  gctx.beginPath();
  gctx.moveTo(cx - r * 0.55, cy - r * 0.72);
  gctx.lineTo(cx, cy - r * 1.3);
  gctx.lineTo(cx + r * 0.55, cy - r * 0.72);
  gctx.closePath();
  gctx.fill();
  gctx.fillStyle = '#5a4a40';
  gctx.fillRect(cx - r * 0.6, cy - r * 0.78, r * 1.2, r * 0.1);
  // 眼睛
  gctx.fillStyle = '#2a211b';
  gctx.beginPath(); gctx.arc(cx - r * 0.18, cy - r * 0.55, 2.2, 0, Math.PI * 2); gctx.fill();
  gctx.beginPath(); gctx.arc(cx + r * 0.18, cy - r * 0.55, 2.2, 0, Math.PI * 2); gctx.fill();

  // interaction prompt above the NPC when the player is close enough to talk
  if (isNearNpc(gs)) {
    gctx.font = '16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.fillStyle = '#ffd54a';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'bottom';
    gctx.fillText('按↑进行对话', cx, cy - r * 1.4);
  }
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let current = '';
  for (const ch of text) {
    if (current && ctx.measureText(current + ch).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawDialogue() {
  const gs = gameState;
  if (!gs.dialogue) return;
  const d = gs.dialogue;
  const line = d.lines[d.index];
  const boxX = 40, boxY = 20, boxW = W - 80, boxH = 110;
  gctx.fillStyle = 'rgba(10, 8, 14, 0.92)';
  gctx.fillRect(boxX, boxY, boxW, boxH);
  gctx.strokeStyle = '#ffffff';
  gctx.lineWidth = 2;
  gctx.strokeRect(boxX, boxY, boxW, boxH);
  // speaker name in the bottom-right corner
  gctx.font = 'bold 16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.fillStyle = '#ffd54a';
  gctx.textAlign = 'right';
  gctx.textBaseline = 'bottom';
  gctx.fillText(d.speaker || '老者', boxX + boxW - 16, boxY + boxH - 12);
  // dialogue text (wrapped)
  gctx.font = '18px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.fillStyle = '#ffffff';
  gctx.textAlign = 'left';
  gctx.textBaseline = 'top';
  const lines = wrapText(gctx, line, boxW - 40);
  let ty = boxY + 18;
  for (const ln of lines) {
    gctx.fillText(ln, boxX + 20, ty);
    ty += 26;
  }
}

function drawOverlord(e, sx) {
  if (e.buried) {
    // a faint dirt mound marks where it dug in
    gctx.beginPath();
    gctx.ellipse(sx, e.groundY - 5, 34, 8, 0, 0, Math.PI * 2);
    gctx.fillStyle = '#16110c';
    gctx.fill();
    return;
  }
  const sy = e.y + Math.sin(e.bobPhase) * 2;
  let fill = '#0c1f42';
  if (e.flashTimer > 0) {
    const blink = (Math.floor(e.flashTimer / 3) % 2) === 0;
    fill = blink ? '#ffffff' : '#0c1f42';
  }
  // swirling white airflow while winding up (stationary)
  if (e.state === 'windup') {
    for (let k = 0; k < 6; k++) {
      const a = e.windupPhase + k * (Math.PI * 2 / 6);
      const rr = e.r + 14 + Math.sin(e.windupPhase * 2 + k) * 7;
      const ax = sx + Math.cos(a) * rr;
      const ay = sy + Math.sin(a) * rr * 0.5;
      gctx.beginPath();
      gctx.arc(ax, ay, 5, 0, Math.PI * 2);
      gctx.fillStyle = 'rgba(255,255,255,0.35)';
      gctx.fill();
    }
  }
  // huge dark-blue ellipse, same colour as the small crawlers
  gctx.beginPath();
  gctx.ellipse(sx, sy, e.rx, e.ry, 0, 0, Math.PI * 2);
  gctx.fillStyle = fill;
  gctx.fill();
  gctx.strokeStyle = 'rgba(4,8,20,0.9)';
  gctx.lineWidth = 3;
  gctx.stroke();
}

// ----- Player appearance helpers -----
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// amt > 0 lightens toward white, amt < 0 darkens toward black
function shade(hex, amt) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const to2 = (v) => f(v).toString(16).padStart(2, '0');
  return '#' + to2(c.r) + to2(c.g) + to2(c.b);
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw the player as a small "survivor" character (glow, body, head, face).
// Keeps the original collision circle (p.radius) as its footprint.
function drawPlayer(cam, p) {
  const x = p.x - cam;
  const y = p.y;
  const r = p.radius;
  const face = (p.face >= 0) ? 1 : -1;
  const flashing = p.invTimer > 0 && (Math.floor(p.invTimer / 4) % 2) === 0;
  const base = flashing ? '#ff7a7a' : (p.color || '#ffffff');

  gctx.save();

  // ground shadow
  gctx.save();
  gctx.globalAlpha = 0.28;
  gctx.fillStyle = '#000';
  gctx.beginPath();
  gctx.ellipse(x, y + r - 2, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  gctx.fill();
  gctx.restore();

  // soft aura
  const glow = gctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.7);
  glow.addColorStop(0, flashing ? 'rgba(255,90,90,0.55)' : 'rgba(120,200,255,0.32)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  gctx.fillStyle = glow;
  gctx.beginPath();
  gctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
  gctx.fill();

  // body (rounded capsule) with vertical gradient shading
  const bodyTop = y - r * 0.55;
  const bodyBot = y + r;
  const bodyW = r * 0.92;
  const bodyGrad = gctx.createLinearGradient(0, bodyTop, 0, bodyBot);
  bodyGrad.addColorStop(0, shade(base, 0.22));
  bodyGrad.addColorStop(1, shade(base, -0.28));
  gctx.fillStyle = bodyGrad;
  gctx.beginPath();
  roundRectPath(gctx, x - bodyW, bodyTop, bodyW * 2, bodyBot - bodyTop, r * 0.5);
  gctx.fill();

  // glowing chest core (sci-fi survivor accent)
  gctx.fillStyle = flashing ? 'rgba(255,210,210,0.95)' : 'rgba(150,225,255,0.95)';
  gctx.beginPath();
  gctx.arc(x, y + r * 0.18, r * 0.16, 0, Math.PI * 2);
  gctx.fill();

  // head
  const headR = r * 0.6;
  const headY = bodyTop - headR * 0.15;
  gctx.fillStyle = shade(base, 0.12);
  gctx.beginPath();
  gctx.arc(x, headY, headR, 0, Math.PI * 2);
  gctx.fill();

  // hood / cloak shade on top of the head
  gctx.fillStyle = shade(base, -0.18);
  gctx.beginPath();
  gctx.arc(x, headY - headR * 0.15, headR * 0.95, Math.PI * 1.05, Math.PI * 1.95);
  gctx.fill();

  // eyes (look toward facing direction)
  const eyeY = headY - headR * 0.05;
  const eyeDX = headR * 0.36;
  const eyeR = headR * 0.17;
  const ex1 = x + face * eyeDX - eyeDX * 0.5;
  const ex2 = x + face * eyeDX + eyeDX * 0.5;
  gctx.fillStyle = '#1b1b22';
  gctx.beginPath();
  gctx.arc(ex1, eyeY, eyeR, 0, Math.PI * 2);
  gctx.arc(ex2, eyeY, eyeR, 0, Math.PI * 2);
  gctx.fill();
  // eye glints
  gctx.fillStyle = 'rgba(255,255,255,0.9)';
  gctx.beginPath();
  gctx.arc(ex1 + 1, eyeY - 1, eyeR * 0.4, 0, Math.PI * 2);
  gctx.arc(ex2 + 1, eyeY - 1, eyeR * 0.4, 0, Math.PI * 2);
  gctx.fill();

  // little smile
  gctx.strokeStyle = 'rgba(0,0,0,0.45)';
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.arc(x + face * headR * 0.1, headY + headR * 0.28, headR * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
  gctx.stroke();

  // outline
  gctx.strokeStyle = 'rgba(0,0,0,0.35)';
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.arc(x, headY, headR, 0, Math.PI * 2);
  gctx.stroke();

  gctx.restore();
}

function drawGameScene() {
  gctx.clearRect(0, 0, W, H);
  const gs = gameState;
  // screen shake after being hurt
  let shakeX = 0, shakeY = 0;
  if (gs.shakeTimer > 0) {
    const mag = SHAKE_MAGNITUDE * (gs.shakeTimer / SHAKE_DURATION);
    shakeX = (Math.random() - 0.5) * 2 * mag;
    shakeY = (Math.random() - 0.5) * 2 * mag;
  }
  gctx.save();
  gctx.translate(shakeX, shakeY);
  const cam = (window.DeepestGame && window.DeepestGame.cameraX) || 0;

  // platforms
  for (let plat of gs.platforms) {
    const sx = Math.round(plat.x - cam);
    const sy = Math.round(plat.y);
    gctx.fillStyle = '#2a2a2a';
    gctx.fillRect(sx, sy, plat.width, plat.height);
    gctx.fillStyle = 'rgba(255,255,255,0.05)';
    gctx.fillRect(sx, sy, plat.width, 3);
    gctx.strokeStyle = 'rgba(255,255,255,0.06)';
    gctx.lineWidth = 1;
    gctx.strokeRect(sx + 0.5, sy + 0.5, plat.width - 1, plat.height - 1);
  }

  // cave goal + poison gas only exist in the chase scene
  if (gs.scene === 'chase') {
    drawCave(cam);
    drawGas(cam);
  } else if (gs.scene === 'cave') {
    drawRocks(cam);
    drawWall(cam);
    drawBoss(cam);
  } else if (gs.scene === 'village') {
    drawVillage(cam);
    drawVillageReturn(cam);
  } else if (gs.scene === 'depths') {
    drawDepthsReturn(cam);
    drawDepthsPit(cam);
  }

  // dropped items (world-space)
  drawDrops(cam);

  // enemies (mutant bats)
  drawEnemies(cam);

  // campfire save point (level 3)
  drawCampfire(cam);
  drawNpc(cam);

  // player character (flashes red a few times while invulnerable after being hurt)
  const p = gs.player;
  drawPlayer(cam, p);

  // name label
  gctx.font = '15px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.fillStyle = '#ffffff';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'bottom';
  gctx.fillText(p.name, p.x - cam, p.y - p.radius - 6);

  // equipped-weapon slash effect (white arc)
  drawAttackEffect(cam);

  // boss health bar (cave scene, screen-space)
  if (gs.scene === 'cave') drawBossHealthBar();

  // player health bar (bottom-right, screen-space)
  drawPlayerHealthBar();

  // admin one-click level teleport buttons (top-left, screen-space)
  if (gs.isAdmin && gs.status === 'playing') drawAdminPanel();

  // picked-up item notifications (right side)
  drawPickupNotifications();

  // backpack: bottom-left button (when unlocked) or the open panel
  if (gs.backpackUnlocked) {
    if (gs.backpackOpen) drawBackpack();
    else drawBackpackButton();
  }

  // bottom-left controls hint (attack + backpack)
  if (gs.status === 'playing') {
    const hx = 14;
    const hy = (gs.backpackUnlocked && !gs.backpackOpen) ? H - 70 : H - 14;
    const weaponDef = gs.weaponSlot ? ITEM_DEFS[gs.weaponSlot] : null;
    const hint = weaponDef
      ? 'F 攻击（' + weaponDef.name + '）   ·   Z 背包'
      : 'F 攻击（未装备武器）   ·   Z 背包';
    gctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'bottom';
    gctx.fillStyle = 'rgba(255,255,255,0.82)';
    gctx.fillText(hint, hx, hy);
  }

  // status overlays
  if (gs.status === 'gameover') {
    drawCenterText('GAME OVER', '#ff5a5a', 48, -24);
    drawContinueButton();
  }

  if (gs.status === 'victory') {
    drawVictory();
  }

  // village title text (white, centered, fades out)
  if (gs.titleText) {
    gctx.save();
    gctx.globalAlpha = Math.max(0, Math.min(1, gs.titleText.alpha));
    gctx.fillStyle = '#ffffff';
    gctx.font = 'bold 42px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    gctx.fillText(gs.titleText.text, W / 2, H / 2);
    gctx.restore();
  }

  // dialogue box (top of screen) while talking to the village elder
  drawDialogue();

  // "Saving…" indicator (bottom-right) while writing to localStorage
  if (gs.savingTimer > 0) {
    gctx.font = '14px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.fillStyle = 'rgba(255,255,255,0.85)';
    gctx.textAlign = 'right';
    gctx.textBaseline = 'bottom';
    gctx.fillText('Saving…', W - 14, H - 40);
  }

  // fade overlay for scene transitions
  if (gs.fade) {
    gctx.fillStyle = 'rgba(0,0,0,' + Math.max(0, Math.min(1, gs.fade.alpha)) + ')';
    gctx.fillRect(0, 0, W, H);
  }

  gctx.restore();
}

function drawCave(cam) {
  const gs = gameState;
  const cx = gs.caveX - cam;
  if (cx > W) return;
  // cliff face on the right edge of the level
  gctx.fillStyle = '#16161c';
  gctx.fillRect(cx, 0, Math.max(0, W - cx), H);
  // cave mouth (dark opening) at the cave-floor height
  const mw = 80, mh = 120, my = H - 150 - mh;
  gctx.fillStyle = '#030304';
  gctx.fillRect(cx - mw / 2, my, mw, mh);
  gctx.strokeStyle = 'rgba(140,190,140,0.35)';
  gctx.lineWidth = 2;
  gctx.strokeRect(cx - mw / 2, my, mw, mh);
}

function drawGas(cam) {
  const gs = gameState;
  const gx = gs.gasX - cam; // screen x of the gas front
  if (gx <= 0) return;      // gas hasn't reached the screen yet
  const right = Math.min(gx, W);

  if (gasPattern) {
    // fill the gas area with the repeating poison-gas texture
    gctx.save();
    gctx.globalAlpha = 0.8;
    gctx.fillStyle = gasPattern;
    gctx.fillRect(0, 0, right, H);
    gctx.restore();
  } else {
    // fallback gradient until the image loads
    const grad = gctx.createLinearGradient(0, 0, right, 0);
    grad.addColorStop(0, 'rgba(120,190,60,0.08)');
    grad.addColorStop(0.8, 'rgba(130,200,70,0.45)');
    grad.addColorStop(1, 'rgba(170,230,100,0.85)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, right, H);
  }

  // bright leading edge
  gctx.fillStyle = 'rgba(200,255,140,0.9)';
  gctx.fillRect(right - 3, 0, 3, H);
}

function drawCenterText(text, color, size, offsetY) {
  gctx.font = 'bold ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.fillStyle = color;
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText(text, W / 2, H / 2 + offsetY);
}

function drawVictory() {
  gctx.save();
  gctx.fillStyle = 'rgba(0,0,0,0.55)';
  gctx.fillRect(0, 0, W, H);
  drawCenterText('通关！', '#9be36b', 56, -42);
  drawCenterText('你击败了鳄鱼，获得 鳄鱼鳞片', '#ffffff', 22, 10);
  drawCenterText('按 Enter / 空格 重新开始', 'rgba(255,255,255,0.8)', 18, 50);
  gctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContinueButton() {
  const gs = gameState;
  const w = 220, h = 58;
  const x = (W - w) / 2, y = H / 2 + 26;
  gs.continueRect = { x, y, w, h };

  gctx.fillStyle = '#3d3d46';
  roundRectPath(gctx, x, y, w, h, 10);
  gctx.fill();
  gctx.strokeStyle = 'rgba(255,255,255,0.4)';
  gctx.lineWidth = 2;
  roundRectPath(gctx, x, y, w, h, 10);
  gctx.stroke();

  gctx.fillStyle = '#ffffff';
  gctx.font = 'bold 22px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText('Continue', W / 2, y + h / 2);
}

function drawAdminPanel() {
  const gs = gameState;
  if (!gs.isAdmin) return;
  const entries = [
    { scene: 'chase', label: '关卡1 · 毒气' },
    { scene: 'cave', label: '关卡2 · 洞穴' },
    { scene: 'level2', label: '关卡3 · 平原' },
    { scene: 'level4', label: '关卡4 · 沼泽' },
    { scene: 'village', label: '关卡5 · 遗失的村庄' }
  ];
  const w = 192, h = 38, gap = 10, x = 14, startY = 14;
  gs.adminButtons = [];
  let y = startY;
  for (const e of entries) {
    const active = gs.scene === e.scene;
    gs.adminButtons.push({ scene: e.scene, x, y, w, h });
    gctx.fillStyle = active ? 'rgba(86,176,100,0.92)' : 'rgba(38,38,46,0.85)';
    roundRectPath(gctx, x, y, w, h, 8);
    gctx.fill();
    gctx.strokeStyle = 'rgba(255,255,255,0.4)';
    gctx.lineWidth = 1;
    roundRectPath(gctx, x, y, w, h, 8);
    gctx.stroke();
    gctx.fillStyle = '#ffffff';
    gctx.font = 'bold 16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    gctx.fillText(e.label, x + w / 2, y + h / 2);
    y += h + gap;
  }
}

function drawDrops(cam) {
  const gs = gameState;
  for (const d of gs.drops) {
    const sx = d.x - cam, sy = d.y;
    if (sx < -40 || sx > W + 40) continue;
    gctx.save();
    gctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 180);
    gctx.beginPath();
    gctx.arc(sx, sy, d.r + 8, 0, Math.PI * 2);
    gctx.fillStyle = '#e8d9a0';
    gctx.fill();
    gctx.restore();
    drawItemGlyph(sx, sy, d.itemId, d.r);
  }
}

function drawEnemies(cam) {
  const gs = gameState;
  for (const e of gs.enemies) {
    if (!e.alive) continue;
    const sx = e.x - cam;
    if (sx < -e.r * 2 || sx > W + e.r * 2) continue;
    const sy = e.y + Math.sin(e.bobPhase) * 4;
    let fill = '#5a3a28'; // dark brown placeholder (image later)
    if (e.flashTimer > 0) {
      const blink = (Math.floor(e.flashTimer / 3) % 2) === 0;
      fill = blink ? '#ffffff' : '#5a3a28';
    }
    if (e.type === 'crocodile') { drawCrocodile(sx, sy, e, fill); continue; }
    if (e.type === 'crawler') {
      let cfill = '#0c1f42';
      if (e.flashTimer > 0) {
        const blink = (Math.floor(e.flashTimer / 3) % 2) === 0;
        cfill = blink ? '#ffffff' : '#0c1f42';
      }
      gctx.beginPath();
      gctx.ellipse(sx, sy, e.rx, e.ry, 0, 0, Math.PI * 2);
      gctx.fillStyle = cfill;
      gctx.fill();
      gctx.strokeStyle = 'rgba(4,8,20,0.9)';
      gctx.lineWidth = 2;
      gctx.stroke();
      continue;
    }
    if (e.type === 'crawler-boss') { drawOverlord(e, sx); continue; }
    // ===== 变异蝙蝠（更精致的形象）=====
    const flap = Math.sin(e.bobPhase * 1.6) * e.r * 0.5;
    gctx.strokeStyle = 'rgba(10,6,4,0.85)';
    gctx.lineWidth = 1.5;
    // 左膜翼（带指骨与扇动）
    gctx.fillStyle = fill;
    gctx.beginPath();
    gctx.moveTo(sx - e.r * 0.2, sy - e.r * 0.2);
    gctx.quadraticCurveTo(sx - e.r * 1.1, sy - e.r * 0.95 + flap, sx - e.r * 1.55, sy - e.r * 0.1);
    gctx.quadraticCurveTo(sx - e.r * 1.15, sy + e.r * 0.05, sx - e.r * 0.95, sy + e.r * 0.25);
    gctx.quadraticCurveTo(sx - e.r * 1.25, sy + e.r * 0.5 + flap, sx - e.r * 1.55, sy + e.r * 0.55);
    gctx.quadraticCurveTo(sx - e.r * 0.95, sy + e.r * 0.4, sx - e.r * 0.2, sy + e.r * 0.2);
    gctx.closePath();
    gctx.fill();
    gctx.stroke();
    // 右膜翼（镜像）
    gctx.beginPath();
    gctx.moveTo(sx + e.r * 0.2, sy - e.r * 0.2);
    gctx.quadraticCurveTo(sx + e.r * 1.1, sy - e.r * 0.95 - flap, sx + e.r * 1.55, sy - e.r * 0.1);
    gctx.quadraticCurveTo(sx + e.r * 1.15, sy + e.r * 0.05, sx + e.r * 0.95, sy + e.r * 0.25);
    gctx.quadraticCurveTo(sx + e.r * 1.25, sy + e.r * 0.5 - flap, sx + e.r * 1.55, sy + e.r * 0.55);
    gctx.quadraticCurveTo(sx + e.r * 0.95, sy + e.r * 0.4, sx + e.r * 0.2, sy + e.r * 0.2);
    gctx.closePath();
    gctx.fill();
    gctx.stroke();
    // 毛皮身体
    gctx.beginPath();
    gctx.ellipse(sx, sy, e.r * 0.55, e.r * 0.7, 0, 0, Math.PI * 2);
    gctx.fillStyle = fill;
    gctx.fill();
    gctx.stroke();
    // 耳朵
    gctx.beginPath();
    gctx.moveTo(sx - e.r * 0.35, sy - e.r * 0.55);
    gctx.lineTo(sx - e.r * 0.5, sy - e.r * 0.98);
    gctx.lineTo(sx - e.r * 0.1, sy - e.r * 0.62);
    gctx.closePath();
    gctx.moveTo(sx + e.r * 0.35, sy - e.r * 0.55);
    gctx.lineTo(sx + e.r * 0.5, sy - e.r * 0.98);
    gctx.lineTo(sx + e.r * 0.1, sy - e.r * 0.62);
    gctx.closePath();
    gctx.fillStyle = fill;
    gctx.fill();
    // 红色眼睛
    gctx.fillStyle = '#ff3b30';
    gctx.beginPath(); gctx.arc(sx - e.r * 0.2, sy - e.r * 0.12, e.r * 0.13, 0, Math.PI * 2); gctx.fill();
    gctx.beginPath(); gctx.arc(sx + e.r * 0.2, sy - e.r * 0.12, e.r * 0.13, 0, Math.PI * 2); gctx.fill();
    // 尖牙
    gctx.fillStyle = '#fff';
    gctx.beginPath();
    gctx.moveTo(sx - e.r * 0.12, sy + e.r * 0.18);
    gctx.lineTo(sx - e.r * 0.04, sy + e.r * 0.45);
    gctx.lineTo(sx + e.r * 0.04, sy + e.r * 0.18);
    gctx.closePath();
    gctx.moveTo(sx + e.r * 0.12, sy + e.r * 0.18);
    gctx.lineTo(sx + e.r * 0.04, sy + e.r * 0.45);
    gctx.lineTo(sx + e.r * 0.2, sy + e.r * 0.18);
    gctx.closePath();
    gctx.fill();
  }
}

// Draw the ground-crawling crocodile (faces the direction it is moving via e.face).
function drawCrocodile(cx, cy, e, fill) {
  gctx.save();
  gctx.translate(cx, cy);
  gctx.scale(e.face >= 0 ? 1 : -1, 1);
  const r = e.r;
  // tail
  gctx.fillStyle = fill;
  gctx.beginPath();
  gctx.moveTo(-r * 0.8, 0);
  gctx.quadraticCurveTo(-r * 1.8, -r * 0.2, -r * 2.0, r * 0.2);
  gctx.quadraticCurveTo(-r * 1.5, r * 0.3, -r * 0.8, r * 0.2);
  gctx.closePath();
  gctx.fill();
  // body
  gctx.beginPath();
  gctx.ellipse(0, 0, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
  gctx.fillStyle = fill;
  gctx.fill();
  gctx.strokeStyle = 'rgba(15,40,20,0.8)';
  gctx.lineWidth = 2;
  gctx.stroke();
  // snout (points in +x after the dir scale)
  gctx.beginPath();
  gctx.moveTo(r * 0.9, -r * 0.1);
  gctx.lineTo(r * 1.7, -r * 0.05);
  gctx.lineTo(r * 1.7, r * 0.2);
  gctx.lineTo(r * 0.9, r * 0.25);
  gctx.closePath();
  gctx.fillStyle = fill;
  gctx.fill();
  gctx.stroke();
  // teeth
  gctx.fillStyle = '#f2ead8';
  for (let i = 0; i < 3; i++) {
    const tx = r * (1.0 + i * 0.22);
    gctx.beginPath();
    gctx.moveTo(tx, r * 0.22);
    gctx.lineTo(tx + r * 0.08, r * 0.42);
    gctx.lineTo(tx + r * 0.16, r * 0.22);
    gctx.closePath();
    gctx.fill();
  }
  // eye
  gctx.fillStyle = '#ffd23f';
  gctx.beginPath();
  gctx.arc(r * 0.45, -r * 0.25, r * 0.12, 0, Math.PI * 2);
  gctx.fill();
  gctx.fillStyle = '#111';
  gctx.beginPath();
  gctx.arc(r * 0.45, -r * 0.25, r * 0.05, 0, Math.PI * 2);
  gctx.fill();
  // legs
  gctx.fillStyle = fill;
  gctx.fillRect(-r * 0.3, r * 0.5, r * 0.25, r * 0.35);
  gctx.fillRect(r * 0.4, r * 0.5, r * 0.25, r * 0.35);
  gctx.restore();
}

function drawItemGlyph(x, y, itemId, r) {
  const def = ITEM_DEFS[itemId];
  const cat = def ? def.category : 'material';
  const color = CATEGORY_COLORS[cat] || '#888';
  gctx.save();
  gctx.translate(x, y);
  if (itemId === 'bat-fang' || itemId === 'small-bat-fang') {
    // bat fang: an ivory, downward-pointing tooth
    gctx.beginPath();
    gctx.moveTo(0, -r);
    gctx.lineTo(r * 0.7, r * 0.8);
    gctx.quadraticCurveTo(0, r, -r * 0.7, r * 0.8);
    gctx.closePath();
    gctx.fillStyle = '#f2ead8';
    gctx.fill();
    gctx.strokeStyle = '#6b6250';
    gctx.lineWidth = 2;
    gctx.stroke();
  } else {
    gctx.beginPath();
    gctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    gctx.fillStyle = color;
    gctx.fill();
    gctx.strokeStyle = 'rgba(0,0,0,0.4)';
    gctx.lineWidth = 2;
    gctx.stroke();
  }
  gctx.restore();
}

function drawAttackEffect(cam) {
  const gs = gameState;
  if (!gs.attack) return;
  const a = gs.attack;
  const p = gs.player;
  const progress = 1 - a.timer / a.duration; // 0 -> 1
  const fade = progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.35;
  const sx = p.x - cam, sy = p.y;
  const mid = a.dir > 0 ? 0 : Math.PI;   // facing angle
  const half = Math.PI * 0.55;           // ~99° arc
  const r = a.range;
  gctx.save();
  gctx.globalAlpha = Math.max(0, fade) * 0.9;
  gctx.strokeStyle = '#ffffff';
  gctx.shadowColor = '#ffffff';
  gctx.shadowBlur = 12;
  gctx.lineCap = 'round';
  gctx.lineWidth = 5;
  gctx.beginPath();
  gctx.arc(sx, sy, r, mid - half, mid + half);
  gctx.stroke();
  gctx.globalAlpha = Math.max(0, fade) * 0.45;
  gctx.lineWidth = 9;
  gctx.beginPath();
  gctx.arc(sx, sy, r * 0.82, mid - half, mid + half);
  gctx.stroke();
  gctx.restore();
}

function drawPickupNotifications() {
  const gs = gameState;
  if (!gs.pickups.length) return;
  gctx.save();
  gctx.textAlign = 'right';
  gctx.textBaseline = 'middle';
  let y = H * 0.3;
  for (const note of gs.pickups) {
    const a = Math.max(0, Math.min(1, note.timer / 30));
    gctx.globalAlpha = a;
    gctx.font = 'bold 18px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.fillStyle = 'rgba(0,0,0,0.55)';
    const tw = gctx.measureText(note.text).width;
    gctx.fillRect(W - tw - 34, y - 16, tw + 20, 32);
    gctx.fillStyle = '#ffe9a8';
    gctx.fillText(note.text, W - 24, y);
    y += 42;
  }
  gctx.restore();
}

function drawBackpackButton() {
  const gs = gameState;
  const w = 160, h = 50, x = 14, y = H - h - 14;
  gs.backpackBtnRect = { x, y, w, h };
  gctx.fillStyle = 'rgba(38,38,46,0.9)';
  roundRectPath(gctx, x, y, w, h, 10);
  gctx.fill();
  gctx.strokeStyle = 'rgba(255,255,255,0.4)';
  gctx.lineWidth = 2;
  roundRectPath(gctx, x, y, w, h, 10);
  gctx.stroke();
  gctx.fillStyle = '#ffffff';
  gctx.font = 'bold 20px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText('背包 (Z)', x + w / 2, y + h / 2);
}

function drawBackpack() {
  const gs = gameState;
  const pw = Math.min(W * 0.84, 760);
  const ph = Math.min(H * 0.84, 560);
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;

  gctx.fillStyle = 'rgba(0,0,0,0.62)';
  gctx.fillRect(0, 0, W, H);

  gctx.fillStyle = 'rgba(24,24,30,0.97)';
  roundRectPath(gctx, px, py, pw, ph, 14);
  gctx.fill();
  gctx.strokeStyle = 'rgba(255,255,255,0.3)';
  gctx.lineWidth = 2;
  roundRectPath(gctx, px, py, pw, ph, 14);
  gctx.stroke();

  // title
  gctx.fillStyle = '#ffffff';
  gctx.font = 'bold 26px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('背包', W / 2, py + 16);

  // weapon slot (left)
  const slot = 76;
  const slotX = px + 24, slotY = py + 60;
  gs.weaponSlotRect = { x: slotX, y: slotY, w: slot, h: slot };
  gctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRectPath(gctx, slotX, slotY, slot, slot, 8);
  gctx.fill();
  gctx.strokeStyle = gs.dragState ? 'rgba(255,230,150,0.9)' : 'rgba(255,255,255,0.35)';
  gctx.lineWidth = 2;
  roundRectPath(gctx, slotX, slotY, slot, slot, 8);
  gctx.stroke();
  gctx.fillStyle = '#aaa';
  gctx.font = '13px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('武器槽', slotX + slot / 2, slotY + slot + 6);
  if (gs.weaponSlot && ITEM_DEFS[gs.weaponSlot]) {
    drawItemGlyph(slotX + slot / 2, slotY + slot / 2, gs.weaponSlot, 26);
  }

  // item list (right of the slot), grouped by category
  gs.backpackItemRects = [];
  const listX = px + 130;
  const listW = px + pw - 30 - listX;
  let listY = py + 56;
  const rowH = 30;

  for (const cat of ITEM_CATEGORIES) {
    const items = Object.keys(gs.inventory).filter(id =>
      ITEM_DEFS[id] && ITEM_DEFS[id].category === cat.key && gs.inventory[id] > 0);
    if (!items.length) continue;

    gctx.fillStyle = CATEGORY_COLORS[cat.key] || '#ccc';
    gctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'top';
    gctx.fillText(cat.label, listX, listY);
    listY += 24;

    for (const id of items) {
      const def = ITEM_DEFS[id];
      const count = gs.inventory[id];
      const rect = { itemId: id, category: def.category, x: listX, y: listY, w: listW, h: rowH - 4 };
      gs.backpackItemRects.push(rect);
      gctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRectPath(gctx, rect.x, rect.y, rect.w, rect.h, 6);
      gctx.fill();
      drawItemGlyph(rect.x + 16, rect.y + rect.h / 2, id, 12);
      gctx.fillStyle = '#ffffff';
      gctx.font = '16px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
      gctx.textAlign = 'left';
      gctx.textBaseline = 'middle';
      gctx.fillText(def.name + (count > 1 ? ' ×' + count : ''), rect.x + 34, rect.y + rect.h / 2);
      listY += rowH;
    }
    listY += 8;
  }

  if (!gs.backpackItemRects.length) {
    gctx.fillStyle = '#888';
    gctx.font = '15px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'top';
    gctx.fillText('（空空如也）', listX, listY);
  }

  if (gs.dragState) {
    drawItemGlyph(gs.dragState.x, gs.dragState.y, gs.dragState.itemId, 24);
  }

  gctx.fillStyle = '#999';
  gctx.font = '13px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'bottom';
  gctx.fillText('按 Z 关闭', W / 2, py + ph - 10);
}

// expose helpers for debugging
window.DeepestAuth = { loadPlayers, savePlayers, setCurrentPlayer, derivePasswordHash };
window.DeepestGame = window.DeepestGame || { initGame };
