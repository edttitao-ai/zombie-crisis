'use strict';
const { t, fmt } = window.I18N_API;
/* ================= 基础设置 ================= */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0;
let ground = null;                 // 预渲染地面纹理
const SPR = {};                    // 预渲染精灵（僵尸躯体 / 各色光晕）
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand  = (a, b) => a + Math.random() * (b - a);
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildGround();
  buildSprites();
}
window.addEventListener('resize', resize);
resize();

const elStart = document.getElementById('start');
const elOver  = document.getElementById('over');
const elPause = document.getElementById('pause');
const btnRetry = document.getElementById('btnRetry');
const bestStart = document.getElementById('bestStart');
const elCards = document.getElementById('cards');
const modeNormal = document.getElementById('modeNormal');
const modeVIP = document.getElementById('modeVIP');

/* ================= 视觉资源（预渲染，无外部素材） ================= */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
function rr(c, x, y, w, h, r) {
  if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, r); return; }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function makeGlow(size, inner, outer) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * dpr);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, c.width / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function buildGround() {
  const dpr = window.devicePixelRatio || 1;
  ground = document.createElement('canvas');
  ground.width = Math.ceil(W * dpr); ground.height = Math.ceil(H * dpr);
  const g = ground.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#141812';
  g.fillRect(0, 0, W, H);
  // 大块深浅色斑
  for (let i = 0; i < 30; i++) {
    g.fillStyle = Math.random() < 0.6
      ? 'rgba(0,0,0,' + rand(0.04, 0.10) + ')'
      : 'rgba(210,225,190,' + rand(0.012, 0.03) + ')';
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(60, 260), rand(40, 160), rand(0, 3.2), 0, 7);
    g.fill();
  }
  // 裂缝
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    let x = rand(0, W), y = rand(0, H), a = rand(0, 6.28);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      a += rand(-0.9, 0.9);
      x += Math.cos(a) * rand(14, 40); y += Math.sin(a) * rand(14, 40);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // 碎屑杂点
  for (let i = 0; i < 260; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(214,226,196,0.05)';
    const s = rand(1, 2.4);
    g.fillRect(rand(0, W), rand(0, H), s, s);
  }
  // 细网格
  g.strokeStyle = 'rgba(255,255,255,0.032)';
  g.beginPath();
  for (let x = 0; x <= W; x += 64) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 0; y <= H; y += 64) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
}

// 七种僵尸的俯视人形绘装：宽肩躯干 + 前伸抓臂 + 拖沓双腿 + 前倾头部
// 精灵面朝 -Y 绘制，渲染时整体旋向玩家
function buildSprites() {
  const dpr = window.devicePixelRatio || 1;
  for (const [type, d] of Object.entries(ZDEF)) {
    const R = d.r, col = d.col;
    const skin = shade(col, 0.3);        // 皮肤（手臂/头）
    const skinDark = shade(col, 0.08);
    const cloth = shade(col, -0.15);     // 破衣（躯干）
    const clothDark = shade(col, -0.42);
    const pad = 6;
    const S2 = R * 1.75 + pad;           // 覆盖手臂前伸的最大半径
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(S2 * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const cx = S2, cy = S2;
    const X = v => cx + v * R, Y = v => cy + v * R;

    // 体型参数（按类型）
    let torsoW = 0.72, torsoH = 0.62, armLen = 1.3, armW = 0.3, headR = 0.42, headY = -0.5;
    let aL = 0.32, aR = 0.44, fistR = 0.2;   // 左右手横向位置
    if (type === 'runner')   { torsoW = 0.5;  torsoH = 0.68; armLen = 0.55; headR = 0.46; headY = -0.64; aL = 0.56; aR = 0.6; }
    if (type === 'bloater')  { torsoW = 0.95; torsoH = 0.92; armLen = 0.75; armW = 0.34; headR = 0.32; headY = -0.42; aL = 0.42; aR = 0.5; }
    if (type === 'brute')    { torsoW = 0.95; torsoH = 0.72; armLen = 1.2;  armW = 0.44; headR = 0.34; headY = -0.46; aL = 0.4; aR = 0.5; fistR = 0.3; }
    if (type === 'screamer') { torsoW = 0.6;  headR = 0.48; headY = -0.56; aL = 0.62; aR = 0.62; }
    if (type === 'spitter')  { torsoW = 0.78; headR = 0.4; }
    if (type === 'shielder') { torsoW = 0.68; }

    // 1) 腿（后侧拖沓，一前一后）
    g.fillStyle = clothDark;
    g.beginPath(); g.ellipse(X(-0.3), Y(0.8), R * 0.16, R * 0.42, -0.2, 0, 7); g.fill();
    g.beginPath(); g.ellipse(X(0.32), Y(1.02), R * 0.16, R * 0.4, 0.25, 0, 7); g.fill();

    // 2) 躯干（肩宽椭圆破衣）
    g.fillStyle = cloth;
    g.beginPath(); g.ellipse(cx, Y(0.12), R * torsoW, R * torsoH, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.stroke();
    // 破洞与血污
    g.fillStyle = clothDark;
    g.beginPath(); g.ellipse(X(-torsoW * 0.55), Y(0.3), R * 0.15, R * 0.22, 0.4, 0, 7); g.fill();
    g.beginPath(); g.ellipse(X(torsoW * 0.5), Y(-0.22), R * 0.13, R * 0.2, -0.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(70,12,12,0.7)';
    g.beginPath(); g.ellipse(cx, Y(0.45), R * 0.2, R * 0.12, 0, 0, 7); g.fill();

    // 3) 双臂（不对称前伸抓握，僵尸标志性姿态）
    g.strokeStyle = skinDark;
    g.lineCap = 'round';
    g.lineWidth = R * armW;
    g.beginPath();
    g.moveTo(X(-torsoW * 0.6), Y(-0.02));
    g.quadraticCurveTo(X(-aL - 0.15), Y(-0.6), X(-aL), Y(-armLen));
    g.stroke();
    g.beginPath();
    g.moveTo(X(torsoW * 0.6), Y(0.06));
    g.quadraticCurveTo(X(aR + 0.12), Y(-0.5), X(aR), Y(-armLen * 0.9));
    g.stroke();
    // 拳头（带暗部指节）
    g.fillStyle = skin;
    g.beginPath(); g.arc(X(-aL), Y(-armLen), R * fistR, 0, 7); g.fill();
    g.beginPath(); g.arc(X(aR), Y(-armLen * 0.9), R * fistR, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(X(-aL) - R * fistR * 0.3, Y(-armLen), R * fistR * 0.4, 0, 7); g.fill();

    // 装甲者：右臂托举金属板（遮挡前方）
    if (type === 'shielder') {
      g.save();
      g.translate(X(0.3), Y(-0.9));
      g.rotate(-0.12);
      g.fillStyle = '#878f86';
      g.fillRect(-R * 0.55, -R * 0.16, R * 1.1, R * 0.42);
      g.strokeStyle = 'rgba(30,35,30,0.85)'; g.lineWidth = 1.5;
      g.strokeRect(-R * 0.55, -R * 0.16, R * 1.1, R * 0.42);
      g.fillStyle = '#565e56';
      for (const rv of [-0.32, 0, 0.32]) { g.beginPath(); g.arc(rv * R, 0, 1.6, 0, 7); g.fill(); }
      g.restore();
    }

    // 4) 头（前倾 + 脑后乱发 + 面部暗面 + 红眼 + 颈部创伤）
    const hx = cx, hy = Y(headY);
    g.fillStyle = skin;
    g.beginPath(); g.arc(hx, hy, R * headR, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.stroke();
    g.save();
    g.beginPath(); g.arc(hx, hy, R * headR, 0, 7); g.clip();
    // 脑后乱发
    g.fillStyle = 'rgba(22,17,10,0.92)';
    g.beginPath(); g.ellipse(hx, hy + R * headR * 0.42, R * headR * 0.78, R * headR * 0.6, 0, 0, 7); g.fill();
    // 面部暗面（朝向玩家）
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.beginPath(); g.ellipse(hx, hy - R * headR * 0.5, R * headR * 0.85, R * headR * 0.52, 0, 0, 7); g.fill();
    g.restore();
    // 红眼（面缘两點，正对玩家）
    g.fillStyle = '#ff4b38';
    g.beginPath(); g.arc(hx - R * headR * 0.4, hy - R * headR * 0.55, Math.max(1.1, R * 0.085), 0, 7); g.fill();
    g.beginPath(); g.arc(hx + R * headR * 0.4, hy - R * headR * 0.55, Math.max(1.1, R * 0.085), 0, 7); g.fill();
    // 颈部创伤
    g.fillStyle = 'rgba(80,12,12,0.85)';
    g.beginPath(); g.ellipse(hx, hy + R * headR * 0.85, R * headR * 0.5, R * headR * 0.3, 0, 0, 7); g.fill();

    // 5) 类型专属细节
    if (type === 'bloater') {
      for (let i = 0; i < 9; i++) {
        const bx = cx + rand(-R * 0.55, R * 0.55), by = Y(0.12) + rand(-R * 0.45, R * 0.45);
        const br = rand(R * 0.05, R * 0.11);
        const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, 'rgba(200,215,110,0.75)'); bg.addColorStop(0.7, 'rgba(130,150,60,0.5)'); bg.addColorStop(1, 'rgba(120,140,60,0)');
        g.fillStyle = bg;
        g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
      }
      // 腹部裂痕，打破圆形对称
      g.strokeStyle = 'rgba(40,25,10,0.5)'; g.lineWidth = R * 0.05;
      g.beginPath();
      g.moveTo(cx - R * 0.2, Y(0.3));
      g.quadraticCurveTo(cx + R * 0.05, Y(0.15), cx - R * 0.08, Y(-0.1));
      g.stroke();
    } else if (type === 'spitter') {
      g.fillStyle = 'rgba(150,210,60,0.55)';
      g.beginPath(); g.ellipse(cx, Y(-0.02), R * 0.4, R * 0.32, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(200,240,110,0.6)';
      g.beginPath(); g.ellipse(cx, Y(-0.08), R * 0.22, R * 0.17, 0, 0, 7); g.fill();
    } else if (type === 'screamer') {
      g.fillStyle = '#2b0d1c';
      g.beginPath(); g.ellipse(hx, hy - R * headR * 0.55, R * headR * 0.4, R * headR * 0.3, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,120,190,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(hx, hy - R * headR * 0.55, R * headR * 0.5, R * headR * 0.4, 0, 0, 7); g.stroke();
    } else if (type === 'brute') {
      g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = R * 0.09;
      g.beginPath(); g.arc(cx, Y(0.22), R * 0.55, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.beginPath(); g.arc(cx, Y(0.22), R * 0.8, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    } else if (type === 'normal') {
      g.fillStyle = 'rgba(70,12,12,0.8)';
      g.beginPath(); g.arc(X(-torsoW * 0.3), Y(0.05), R * 0.12, 0, 7); g.fill();
      g.fillStyle = '#3a0d0d';
      g.beginPath(); g.arc(X(-torsoW * 0.3), Y(0.05), R * 0.06, 0, 7); g.fill();
    }
    SPR[type] = { c, half: S2 };
  }
  SPR.glowWarm = makeGlow(96, 'rgba(255,236,180,0.9)', 'rgba(255,180,60,0)');
  SPR.glowRed  = makeGlow(48, 'rgba(255,90,60,0.9)', 'rgba(255,40,20,0)');
  SPR.glowSoft = makeGlow(64, 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)');
  SPR.glowCyan = makeGlow(64, 'rgba(126,200,255,0.75)', 'rgba(60,140,255,0)');
}

/* ================= 游戏状态 ================= */
let state = 'start';          // start | playing | gameover
let paused = false;
let player, bullets, zombies, parts, pickups, stains, corpses, casings, pops, nades, mols, fireZones, flashes, acidBolts, rings, teslaChains;
let upg, upgTaken, regenT = 0, cardOpen = false, cardPicks = [];
let vipMode = false;
let lastMode = localStorage.getItem('zc_lastmode') === 'vip';
let vipDropT = 0;
let wave, score, kills, toSpawn, spawnCd, nextWaveIn, waveActive;
let waveMsg, waveMsgT, shake, hurtT, rapidT, muzzleT;
let best = +(localStorage.getItem('zc_best') || 0);

function reset() {
  player = { x: W / 2, y: H / 2, r: 15, hp: 100, maxHp: 100, speed: 230,
             ang: 0, mag: 30, fireCd: 0, reloadT: 0, recoil: 0,
             walk: 0, moving: false, weapon: 'pistol', reserve: Infinity,
             grenades: 2, mols: 1, medkits: 1, nadeCd: 0,
             dashT: 0, dashCd: 0, invulnT: 0, ddx: 0, ddy: 0 };
  bullets = []; zombies = []; parts = []; pickups = []; stains = [];
  corpses = []; casings = []; pops = []; nades = []; mols = []; fireZones = []; flashes = [];
  acidBolts = []; rings = []; teslaChains = [];
  resetUpgrades();
  if (vipMode) { // VIP：开局自带火力强化 + 移速加成
    upg.speed += 0.1;
    upg.dmg += 0.15;
  }
  regenT = 0; cardOpen = false; cardPicks = []; vipDropT = 20;
  player.revives = vipMode ? 2 : 0;      // VIP：复活甲 ×2
  player.forceFieldCd = 0;               // VIP：紧急力场冷却
  player.dashCdMax = vipMode ? 1.75 : 2.5; // VIP：冲刺冷却 -30%
  wave = 0; score = 0; kills = 0;
  toSpawn = 0; spawnCd = 0; nextWaveIn = 2.2; waveActive = false;
  waveMsg = t('getReady'); waveMsgT = 2.2;
  shake = 0; hurtT = 0; rapidT = 0; muzzleT = 0;
}

function startGame(vip) {
  ensureAudio();
  vipMode = !!vip;
  lastMode = vipMode;
  try { localStorage.setItem('zc_lastmode', vipMode ? 'vip' : 'normal'); } catch (e) {}
  reset();
  if (vipMode) {
    // VIP 开局：特斯拉电枪 + 无限子弹 + 满载投掷物与医疗
    player.weapon = 'rail';
    player.mag = curMagSize();
    player.reserve = Infinity;
    player.grenades = 5; player.mols = 3; player.medkits = 3;
  }
  state = 'playing'; paused = false; cardOpen = false;
  elStart.classList.add('hidden');
  elOver.classList.add('hidden');
  elPause.classList.add('hidden');
  elCards.classList.add('hidden');
}

function addScore(n) {
  score += n * (vipMode ? 2 : 1); // VIP：得分 ×2
}

function gameOver() {
  state = 'gameover';
  S.over();
  best = Math.max(best, score);
  localStorage.setItem('zc_best', best);
  document.getElementById('ovScore').textContent = score;
  document.getElementById('ovWave').textContent = wave;
  document.getElementById('ovKills').textContent = kills;
  document.getElementById('ovBest').textContent = best;
  elOver.classList.remove('hidden');
}

function startWave(n) {
  toSpawn = 5 + n * 3;
  spawnCd = 0.6;
  waveActive = true;
  waveMsg = fmt(t('waveN'), n); waveMsgT = 2;
  if (vipMode) { // VIP：医疗顾问，每波开始回复 35
    player.hp = Math.min(player.maxHp, player.hp + 35);
    pops.push({ x: player.x, y: player.y - 30, txt: t('vipHeal'), t: 0, life: 1.2 });
  }
  S.wave();
}

/* ================= 僵尸 ================= */
function spawnZombie() {
  if (zombies.length >= 130) return;
  const type = pickZombieType();
  const d = ZDEF[type];
  const side = Math.floor(Math.random() * 4), m = 40;
  let x, y;
  if (side === 0)      { x = Math.random() * W; y = -m; }
  else if (side === 1) { x = W + m; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = H + m; }
  else                 { x = -m; y = Math.random() * H; }
  const hp = d.hp + wave * d.hpW;
  zombies.push({
    x, y, type, r: d.r, hp, maxHp: hp,
    speed: Math.min(d.spdCap, (d.spd + wave * d.spdW) * rand(0.9, 1.1)),
    dmg: d.dmg, col: d.col, sc: d.sc,
    flash: 0, atkCd: rand(0.2, 0.6), wob: rand(0, 6.28),
    spitCd: rand(1, 2), screamCd: rand(2, 4), screamT: 0, buffT: 0, fuseT: -1, boomed: false
  });
}

function blood(x, y, ang, n, col) {
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-1.2, 1.2), sp = rand(40, 240);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                 life: rand(0.25, 0.6), maxLife: 0.6, size: rand(1.5, 3.5),
                 col: col || (Math.random() < 0.7 ? '#a41f1f' : '#6d1414') });
  }
  if (parts.length > 400) parts.splice(0, parts.length - 400);
}

function killZombie(i) {
  if (i < 0 || i >= zombies.length) return; // 防御：索引失效（爆炸/放电连锁击杀后索引可能偏移）
  const z = zombies[i];
  if (z.type === 'bloater' && !z.boomed) {
    // 自爆者：死亡引爆，波及玩家与其他僵尸（可连环殉爆）
    z.boomed = true;
    zombies.splice(i, 1);
    kills++; addScore(z.sc);
    explode(z.x, z.y, 55, 115, 26);
    for (let g = 0; g < 14; g++) {
      const a = rand(0, 6.28), sp = rand(80, 300);
      parts.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                   life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4), col: '#9ab04a' });
    }
    S.die();
    return;
  }
  zombies.splice(i, 1);
  kills++; addScore(z.sc);
  blood(z.x, z.y, rand(0, 6.28), z.type === 'brute' ? 24 : 13);
  corpses.push({ x: z.x, y: z.y, r: z.r, col: z.col, ang: rand(0, 6.28), t: 0, life: 5 });
  if (corpses.length > 40) corpses.shift();
  stains.push({ x: z.x, y: z.y, r: z.r + rand(4, 10) });
  for (let k = 0; k < 3; k++) {
    stains.push({ x: z.x + rand(-z.r - 6, z.r + 6), y: z.y + rand(-z.r - 6, z.r + 6), r: rand(2.5, z.r * 0.45) });
  }
  if (stains.length > 200) stains.splice(0, stains.length - 200);
  pops.push({ x: z.x, y: z.y - z.r - 4, txt: '+' + z.sc, t: 0, life: 0.9 });
  if (pops.length > 30) pops.shift();
  if (z.type === 'brute') { shake = Math.max(shake, 6); if (Math.random() < 0.6) dropPickup(z.x, z.y); }
  else if (Math.random() < 0.17) dropPickup(z.x, z.y);
  S.die();
}

function dropPickup(x, y) {
  const r = Math.random();
  let type;
  if (r < 0.28) type = 'med';
  else if (r < 0.46) type = 'ammo';
  else if (r < 0.60) type = 'nade';
  else if (r < 0.72) type = 'mol';
  else {
    const w = Math.random();
    type = w < 0.30 ? 'wsmg' : (w < 0.52 ? 'wshot' : (w < 0.66 ? 'wrock' : (w < 0.82 ? 'wrail' : 'wmini')));
  }
  pickups.push({ x, y, type, t: rand(0, 6.28), life: type[0] === 'w' ? 14 : 12 });
}

/* ================= 输入 ================= */
const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyM') {
    muted = !muted;
    localStorage.setItem('zc_muted', muted ? '1' : '0');
  }
  if (e.code === 'KeyL') window.I18N_API.toggleLang();
  if (state === 'start') {
    if (e.code === 'Enter' || e.code === 'Space') { startGame(lastMode); return; }
    if (e.code === 'KeyV') { startGame(true); return; }
  }
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'KeyR')) { startGame(lastMode); return; }
  if (state === 'playing') {
    if (cardOpen && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4')) {
      const c = cardPicks[+e.code.slice(-1) - 1];
      if (c) pickCard(c);
      return;
    }
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') throwGrenade();
    if (e.code === 'KeyF') throwMolotov();
    if (e.code === 'KeyQ') useMedkit();
    if (e.code === 'KeyX') dropWeapon();
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      paused = !paused;
      elPause.classList.toggle('hidden', !paused);
    }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => {
  if (e.button === 2) { if (state === 'playing' && !paused) throwGrenade(); return; }
  if (e.button === 0) { mouse.down = true; ensureAudio(); }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) { mouse.down = false; mouse.semiHeld = false; }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => {
  if (state === 'playing' && !paused) { paused = true; elPause.classList.remove('hidden'); }
});
modeNormal.addEventListener('click', () => startGame(false));
modeVIP.addEventListener('click', () => startGame(true));
btnRetry.addEventListener('click', () => startGame(lastMode));
document.getElementById('btnLang').addEventListener('click', () => window.I18N_API.toggleLang());

/* ================= 射击与伤害 ================= */
function fallbackWeapon() { return vipMode ? 'rail' : 'pistol'; } // VIP 的默认武器是特斯拉电枪

function startReload() {
  const wd = WEAPONS[player.weapon];
  if (player.reloadT > 0 || player.mag === curMagSize()) return;
  if (player.reserve <= 0) { switchWeapon(fallbackWeapon(), true); return; }
  player.reloadT = wd.reloadT / upg.reload;
  S.reload();
}

function switchWeapon(key, fromEmpty) {
  const wd = WEAPONS[key];
  player.weapon = key;
  player.mag = curMagSize();
  player.reserve = wd.reserve;
  if (fromEmpty && vipMode) player.reserve = Infinity; // VIP 退回的默认加特林同样无限
  player.reloadT = 0;
  player.fireCd = Math.max(player.fireCd, 0.15);
  pops.push({ x: player.x, y: player.y - 26, txt: fromEmpty ? fmt(t('wEmpty'), t(wd.nameKey)) : t(wd.nameKey), t: 0, life: 1.1 });
  if (pops.length > 30) pops.shift();
}

function throwGrenade() {
  const p = player;
  if (p.grenades <= 0 || p.nadeCd > 0) return;
  p.grenades--;
  p.nadeCd = 0.5;
  const maxD = 380;
  let tx = mouse.x, ty = mouse.y;
  const d = Math.hypot(tx - p.x, ty - p.y);
  if (d > maxD) { tx = p.x + (tx - p.x) / d * maxD; ty = p.y + (ty - p.y) / d * maxD; }
  const T = 0.5;
  nades.push({ x: p.x, y: p.y, vx: (tx - p.x) / T, vy: (ty - p.y) / T, flightT: T, fuse: 1.15, t: 0 });
  S.pin();
}

function throwMolotov() {
  const p = player;
  if (p.mols <= 0 || p.nadeCd > 0) return;
  p.mols--;
  p.nadeCd = 0.5;
  const maxD = 360;
  let tx = mouse.x, ty = mouse.y;
  const d = Math.hypot(tx - p.x, ty - p.y);
  if (d > maxD) { tx = p.x + (tx - p.x) / d * maxD; ty = p.y + (ty - p.y) / d * maxD; }
  const T = 0.5;
  mols.push({ x: p.x, y: p.y, vx: (tx - p.x) / T, vy: (ty - p.y) / T, flightT: T, fuse: 0.9, t: 0 });
  S.pin();
}

function spawnFire(x, y) {
  fireZones.push({ x, y, r: 95, t: 0, life: 5, tick: 0 });
  stains.push({ x, y, r: 42, col: '#1c130d' });
  flashes.push({ x, y, r: 60, t: 0, life: 0.2 });
  for (let i = 0; i < 14; i++) {
    const a = rand(0, 6.28), sp = rand(40, 200);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.2, 0.5), maxLife: 0.5, size: rand(1.5, 3), col: '#9fd4e8' });
  }
  S.shatter();
}

function useMedkit() {
  const p = player;
  if (p.medkits <= 0 || p.hp >= p.maxHp) return;
  p.medkits--;
  p.hp = Math.min(p.maxHp, p.hp + 35);
  pops.push({ x: p.x, y: p.y - 26, txt: '+35', t: 0, life: 0.8 });
  S.pickup();
}

// 丢弃当前武器（默认武器不可丢弃），扔出后在原地变成可拾取的武器箱
function dropWeapon() {
  const key = player.weapon;
  if (key === fallbackWeapon()) return;
  const a = player.ang;
  pickups.push({ x: player.x + Math.cos(a) * 34, y: player.y + Math.sin(a) * 34,
                 type: 'w' + key, t: rand(0, 6.28), life: 14 });
  switchWeapon(fallbackWeapon(), false);
  S.pin();
}

function tryDash() {
  const p = player;
  if (p.dashCd > 0 || p.dashT > 0 || state !== 'playing') return;
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (!dx && !dy) { dx = Math.cos(p.ang); dy = Math.sin(p.ang); }
  const l = Math.hypot(dx, dy);
  p.ddx = dx / l; p.ddy = dy / l;
  p.dashT = 0.18;
  p.dashCd = p.dashCdMax;
  p.invulnT = 0.4;
  S.dash();
}

function explode(x, y, dmg, radius, playerDmg) {
  for (let j = zombies.length - 1; j >= 0; j--) {
    const z = zombies[j];
    const d = Math.hypot(z.x - x, z.y - y);
    if (d < radius + z.r) {
      const f = 1 - clamp((d - z.r) / radius, 0, 1);
      z.hp -= dmg * (0.35 + 0.65 * f);
      z.flash = 0.1;
      const ka = Math.atan2(z.y - y, z.x - x) || rand(0, 6.28);
      const kb = 16 * f;
      z.x += Math.cos(ka) * kb; z.y += Math.sin(ka) * kb;
      if (z.hp <= 0) killZombie(j);
    }
  }
  if (playerDmg && Math.hypot(player.x - x, player.y - y) < radius + player.r) {
    damagePlayer(playerDmg); // 自爆者的爆炸会波及玩家
  }
  flashes.push({ x, y, r: radius, t: 0, life: 0.3 });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, 6.28), sp = rand(60, 420);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.2, 0.55), maxLife: 0.55,
                 size: rand(1.5, 4), col: Math.random() < 0.6 ? '#ffb347' : '#ff6a3a' });
  }
  for (let i = 0; i < 10; i++) {
    const a = rand(0, 6.28), sp = rand(20, 90);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 0.9), maxLife: 0.9,
                 size: rand(3, 6), col: 'rgba(130,130,120,0.55)' });
  }
  if (parts.length > 420) parts.splice(0, parts.length - 420);
  stains.push({ x, y, r: radius * 0.42, col: '#191411' });
  if (stains.length > 200) stains.splice(0, stains.length - 200);
  shake = Math.max(shake, 13);
  S.boom();
}

function fireBullet() {
  const wd = WEAPONS[player.weapon];
  const tipX = player.x + Math.cos(player.ang) * (player.r + 14);
  const tipY = player.y + Math.sin(player.ang) * (player.r + 14);
  // 特斯拉电枪：不发射弹丸，改为锁定闪电链
  if (wd.tesla) {
    if (!fireTesla(wd)) { player.fireCd = 0.12; return; } // 附近无目标：空扣扳机不耗弹
    player.mag--;
    player.fireCd = wd.rate * upg.rate * (rapidT > 0 ? 0.5 : 1);
    player.recoil = 4;
    muzzleT = 0.05;
    shake = Math.max(shake, wd.shake);
    S.zap();
    mouse.semiHeld = true;
    if (player.mag === 0) startReload();
    return;
  }
  const crit = Math.random() < upg.crit;
  for (let i = 0; i < wd.pellets; i++) {
    const a = player.ang + rand(-wd.spread, wd.spread);
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(a) * wd.speed, vy: Math.sin(a) * wd.speed,
      life: wd.life || 1.2,
      dmg: wd.dmg * upg.dmg * (crit ? 2 : 1) * (rapidT > 0 ? 0.85 : 1),
      crit, knock: wd.knock || 0.6,
      type: wd.rocket ? 'rocket' : 'bullet', splash: wd.splash, splashDmg: wd.splashDmg,
      pierce: !!wd.pierce, hitIds: wd.pierce ? [] : null
    });
  }
  player.mag--;
  player.fireCd = wd.rate * upg.rate * (rapidT > 0 ? 0.5 : 1);
  player.recoil = wd.knock ? 9 : 6;
  muzzleT = 0.05;
  shake = Math.max(shake, wd.shake);
  if (!wd.rocket && !wd.tesla) {
    // 弹壳抛出（垂直于枪口方向）
    const pa = player.ang + Math.PI / 2, ev = rand(90, 150);
    casings.push({
      x: player.x + Math.cos(player.ang) * (player.r + 6),
      y: player.y + Math.sin(player.ang) * (player.r + 6),
      vx: Math.cos(pa) * ev * rand(0.6, 1) + Math.cos(player.ang) * rand(-20, 20),
      vy: Math.sin(pa) * ev * rand(0.6, 1) + Math.sin(player.ang) * rand(-20, 20),
      rot: rand(0, 6.28), vrot: rand(-14, 14), life: 1.6
    });
    if (casings.length > 80) casings.shift();
  }
  if (wd.rocket) S.launch();
  else if (wd.pellets > 1) S.shot();
  else S.shoot();
  if (wd.auto === false) mouse.semiHeld = true;
  if (player.mag === 0) startReload();
}

// 特斯拉闪电链：锁定准星附近的僵尸，逐跳连向邻近僵尸
function fireTesla(wd) {
  let first = null, best = 90;
  for (const z of zombies) {
    const d = Math.hypot(z.x - mouse.x, z.y - mouse.y);
    if (d < best) { best = d; first = z; }
  }
  if (!first) { // 准星没套住僵尸：沿枪口射线找最近目标
    const ca = Math.cos(player.ang), sa = Math.sin(player.ang);
    let bestAlong = 800;
    for (const z of zombies) {
      const dx = z.x - player.x, dy = z.y - player.y;
      const along = dx * ca + dy * sa;
      const perp = Math.abs(-dx * sa + dy * ca);
      if (along > 0 && perp < 60 && along < bestAlong) { bestAlong = along; first = z; }
    }
  }
  if (!first) return false;
  const nodes = [first];
  const inChain = new Set([first]);
  let cur = first;
  const maxHops = wd.maxHops + (vipMode ? 2 : 0);   // VIP：多连 2 跳
  const hopDist = wd.hopDist + (vipMode ? 60 : 0);  // VIP：跳跃距离更远
  for (let hop = 0; hop < maxHops; hop++) {
    let nxt = null, nd = hopDist;
    for (const z of zombies) {
      if (inChain.has(z)) continue;
      const d = Math.hypot(z.x - cur.x, z.y - cur.y);
      if (d < nd) { nd = d; nxt = z; }
    }
    if (!nxt) break;
    nodes.push(nxt);
    inChain.add(nxt);
    cur = nxt;
  }
  teslaChains.push({ nodes, t: 0, life: wd.teslaLife, dps: wd.dps * (vipMode ? 1.3 : 1) }); // VIP：放电 +30%
  return true;
}

// 锯齿闪电（双层：青色辉光 + 亮白芯）
function drawLightning(x1, y1, x2, y2, jitter) {
  const segs = 7;
  const pts = [[x1, y1]];
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    pts.push([x1 + (x2 - x1) * k + rand(-jitter, jitter), y1 + (y2 - y1) * k + rand(-jitter, jitter)]);
  }
  pts.push([x2, y2]);
  for (const [w, col] of [[5, 'rgba(126,200,255,0.4)'], [1.8, '#e8f8ff']]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
}

function damagePlayer(n) {
  if (state !== 'playing' || player.invulnT > 0) return;
  n *= 1 - upg.vest;
  player.hp -= n;
  hurtT = 0.55;
  shake = Math.max(shake, 9);
  blood(player.x, player.y, rand(0, 6.28), 6, '#c22');
  S.hurt();
  if (player.hp <= 0) {
    if (player.revives > 0) { // VIP：复活甲，原地半血复活
      player.revives--;
      player.hp = Math.ceil(player.maxHp * 0.5);
      player.invulnT = 2;
      pops.push({ x: player.x, y: player.y - 32, txt: t('vipRevive'), t: 0, life: 1.8 });
      S.clear();
      return;
    }
    player.hp = 0; gameOver();
  }
}

// VIP 空投：必出好货（武器箱 / 医疗 / 弹药 / 投掷物）
function vipAirdrop(x, y) {
  const r = Math.random();
  let type;
  if (r < 0.35) type = 'med';
  else if (r < 0.55) type = 'ammo';
  else if (r < 0.65) type = 'nade';
  else if (r < 0.75) type = 'mol';
  else {
    const w = Math.random();
    type = w < 0.3 ? 'wsmg' : (w < 0.5 ? 'wshot' : (w < 0.7 ? 'wrock' : (w < 0.85 ? 'wrail' : 'wmini')));
  }
  pickups.push({ x, y, type, t: rand(0, 6.28), life: type[0] === 'w' ? 14 : 12 });
}

/* ================= 更新 ================= */
function update(dt) {
  const p = player;
  p.fireCd -= dt;
  p.recoil = Math.max(0, p.recoil - dt * 40);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      const take = Math.min(curMagSize() - p.mag, p.reserve);
      p.mag += take;
      if (isFinite(p.reserve)) p.reserve -= take;
      if (p.mag === 0) switchWeapon(fallbackWeapon(), true);
    }
  }
  hurtT = Math.max(0, hurtT - dt);
  rapidT = Math.max(0, rapidT - dt);
  p.nadeCd = Math.max(0, p.nadeCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.forceFieldCd = Math.max(0, p.forceFieldCd - dt);
  muzzleT = Math.max(0, muzzleT - dt);
  shake -= shake * Math.min(1, dt * 7); if (shake < 0.1) shake = 0;
  waveMsgT = Math.max(0, waveMsgT - dt);

  // 玩家移动
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  p.moving = !!(dx || dy);
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.ddx * 900 * dt;
    p.y += p.ddy * 900 * dt;
    parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, size: 6, col: 'rgba(143,174,126,0.45)' });
  } else if (dx || dy) {
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    p.x += dx * p.speed * upg.speed * dt; p.y += dy * p.speed * upg.speed * dt;
  }
  if (p.moving && p.dashT <= 0) p.walk += dt * 11;
  p.x = clamp(p.x, p.r + 8, W - p.r - 8);
  p.y = clamp(p.y, p.r + 8, H - p.r - 8);
  p.ang = Math.atan2(mouse.y - p.y, mouse.x - p.x);

  // 射击（半自动武器需逐次点击）
  const cw = WEAPONS[p.weapon];
  if (mouse.down && p.reloadT <= 0 && p.fireCd <= 0 && (cw.auto !== false || !mouse.semiHeld)) {
    if (p.mag > 0) fireBullet();
    else startReload();
  }

  // 子弹 / 火箭
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.type === 'rocket' && parts.length < 420) {
      parts.push({ x: b.x, y: b.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, maxLife: 0.3, size: rand(2, 3.4), col: 'rgba(150,150,140,0.55)' });
    }
    if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) {
      if (b.type === 'rocket') explode(clamp(b.x, 0, W), clamp(b.y, 0, H), b.splashDmg, b.splash);
      bullets.splice(i, 1); continue;
    }
    let consumed = false;
    for (let j = zombies.length - 1; j >= 0; j--) {
      const z = zombies[j], rad = z.r + (b.type === 'rocket' ? 6 : 4);
      if (b.hitIds && b.hitIds.indexOf(z) >= 0) continue;
      if ((b.x - z.x) ** 2 + (b.y - z.y) ** 2 < rad * rad) {
        if (b.type === 'rocket') {
          explode(b.x, b.y, b.splashDmg, b.splash);
          bullets.splice(i, 1);
          consumed = true;
          break;
        }
        let dIn = b.dmg;
        if (z.type === 'shielder') dIn *= 0.45; // 装甲者：子弹减免，但爆炸与火焰全额
        z.hp -= dIn; z.flash = 0.07;
        z.x += b.vx * 0.004 * b.knock; z.y += b.vy * 0.004 * b.knock;
        blood(b.x, b.y, Math.atan2(b.vy, b.vx), 5, b.crit ? '#ff3b2f' : undefined);
        if (Math.random() < 0.22) {
          stains.push({ x: b.x + rand(-4, 4), y: b.y + rand(-4, 4), r: rand(2, 4.5) });
          if (stains.length > 200) stains.splice(0, stains.length - 200);
        }
        S.hit();
        if (z.hp <= 0) killZombie(j);
        if (b.pierce) {
          b.hitIds.push(z); // 磁轨枪穿透，继续命中后续目标
        } else {
          bullets.splice(i, 1);
          consumed = true;
          break;
        }
      }
    }
  }

  // 僵尸
  for (const z of zombies) {
    z.flash = Math.max(0, z.flash - dt);
    z.atkCd -= dt;
    z.buffT = Math.max(0, z.buffT - dt);
    z.screamT = Math.max(0, z.screamT - dt);
    const a = Math.atan2(p.y - z.y, p.x - z.x);
    const sp = z.speed * (z.buffT > 0 ? 1.5 : 1); // 被尖啸者狂化后加速
    z.x += Math.cos(a) * sp * dt;
    z.y += Math.sin(a) * sp * dt;
    if (z.type === 'runner') { // 疾跑者蛇形走位
      z.wob += dt * 6;
      z.x += Math.cos(a + Math.PI / 2) * Math.sin(z.wob) * 26 * dt;
      z.y += Math.sin(a + Math.PI / 2) * Math.sin(z.wob) * 26 * dt;
    }
    // 吐酸者：中距离定期喷吐酸弹
    if (z.type === 'spitter') {
      z.spitCd -= dt;
      if (z.spitCd <= 0) {
        const d2 = Math.hypot(p.x - z.x, p.y - z.y);
        if (d2 > 110 && d2 < 340) {
          z.spitCd = 2.2;
          const sa = a + rand(-0.06, 0.06);
          acidBolts.push({ x: z.x + Math.cos(sa) * z.r, y: z.y + Math.sin(sa) * z.r,
                           vx: Math.cos(sa) * 265, vy: Math.sin(sa) * 265, life: 2 });
          S.spit();
        } else z.spitCd = 0.5;
      }
    }
    // 尖啸者：周期性狂化周围尸群
    if (z.type === 'screamer') {
      z.screamCd -= dt;
      if (z.screamCd <= 0) {
        z.screamCd = 4; z.screamT = 0.7;
        rings.push({ x: z.x, y: z.y, t: 0, life: 0.8, col: 'rgba(255,110,180,0.75)' });
        for (const o of zombies) {
          if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 260) o.buffT = 3;
        }
        S.scream();
      }
    }
    // 自爆者：贴近玩家后起爆引信
    if (z.type === 'bloater') {
      if (z.fuseT < 0 && Math.hypot(p.x - z.x, p.y - z.y) < 95) z.fuseT = 0.6;
      if (z.fuseT > 0) {
        z.fuseT -= dt;
        if (z.fuseT <= 0) { killZombie(zombies.indexOf(z)); continue; }
      }
    }
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    if (z.dmg > 0 && d < z.r + p.r + 2 && z.atkCd <= 0) { z.atkCd = 0.9; damagePlayer(z.dmg); }
  }
  // 僵尸互相挤开
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i], b = zombies[j];
      let ddx = b.x - a.x, ddy = b.y - a.y;
      const rr = a.r + b.r, d2 = ddx * ddx + ddy * ddy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) / 2;
        ddx /= d; ddy /= d;
        a.x -= ddx * push; a.y -= ddy * push;
        b.x += ddx * push; b.y += ddy * push;
      }
    }
  }

  // 补给
  for (let i = pickups.length - 1; i >= 0; i--) {
    const k = pickups[i];
    k.t += dt; k.life -= dt;
    if (k.life <= 0) { pickups.splice(i, 1); continue; }
    if (Math.hypot(p.x - k.x, p.y - k.y) < p.r + 16) {
      if (k.type === 'med') {
        if (p.medkits < 5) { p.medkits++; pops.push({ x: p.x, y: p.y - 24, txt: t('wMed'), t: 0, life: 0.9 }); }
      } else if (k.type === 'ammo') {
        p.mag = curMagSize(); p.reloadT = 0; rapidT = 3;
        if (isFinite(p.reserve)) p.reserve += curMagSize();
      } else if (k.type === 'nade') {
        if (p.grenades < upg.throwCap) { p.grenades++; pops.push({ x: p.x, y: p.y - 24, txt: t('wNade'), t: 0, life: 0.9 }); }
      } else if (k.type === 'mol') {
        if (p.mols < upg.throwCap) { p.mols++; pops.push({ x: p.x, y: p.y - 24, txt: t('wMol'), t: 0, life: 0.9 }); }
      } else {
        switchWeapon(k.type.slice(1), false);
      }
      S.pickup();
      pickups.splice(i, 1);
    }
  }

  // 粒子
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx -= q.vx * Math.min(1, dt * 4);
    q.vy -= q.vy * Math.min(1, dt * 4);
    q.life -= dt;
    if (q.life <= 0) parts.splice(i, 1);
  }

  // 尸体 / 弹壳 / 击杀飘分
  for (let i = corpses.length - 1; i >= 0; i--) {
    const cp = corpses[i];
    cp.t += dt;
    if (cp.t >= cp.life) corpses.splice(i, 1);
  }
  for (let i = casings.length - 1; i >= 0; i--) {
    const c = casings[i];
    c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vrot * dt;
    c.vx -= c.vx * Math.min(1, dt * 5);
    c.vy -= c.vy * Math.min(1, dt * 5);
    c.life -= dt;
    if (c.life <= 0) casings.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i];
    q.t += dt; q.y -= 26 * dt;
    if (q.t >= q.life) pops.splice(i, 1);
  }

  // 手雷引信 / 爆炸闪光
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i];
    n.t += dt; n.fuse -= dt;
    if (n.flightT > 0) {
      n.flightT -= dt;
      n.x += n.vx * dt; n.y += n.vy * dt;
    } else {
      n.vx -= n.vx * Math.min(1, dt * 9);
      n.vy -= n.vy * Math.min(1, dt * 9);
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    n.x = clamp(n.x, 10, W - 10); n.y = clamp(n.y, 10, H - 10);
    if (n.fuse <= 0) {
      nades.splice(i, 1);
      explode(n.x, n.y, 80, 115);
    }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    if (f.t >= f.life) flashes.splice(i, 1);
  }

  // 燃烧瓶飞行 / 火焰地带 / 生命回复
  for (let i = mols.length - 1; i >= 0; i--) {
    const n = mols[i];
    n.t += dt; n.fuse -= dt;
    if (n.flightT > 0) {
      n.flightT -= dt;
      n.x += n.vx * dt; n.y += n.vy * dt;
    } else {
      n.vx -= n.vx * Math.min(1, dt * 9);
      n.vy -= n.vy * Math.min(1, dt * 9);
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    n.x = clamp(n.x, 10, W - 10); n.y = clamp(n.y, 10, H - 10);
    if (n.fuse <= 0) {
      mols.splice(i, 1);
      spawnFire(n.x, n.y);
    }
  }
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const f = fireZones[i];
    f.t += dt; f.tick -= dt;
    if (f.tick <= 0) {
      f.tick = 0.3;
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (Math.hypot(z.x - f.x, z.y - f.y) < f.r + z.r) {
          z.hp -= 4.5 * upg.fire;
          z.flash = 0.05;
          if (z.hp <= 0) killZombie(j);
        }
      }
    }
    if (Math.random() < 0.6 && parts.length < 420) {
      const a = rand(0, 6.28), d = rand(0, f.r * 0.85);
      parts.push({ x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d,
                   vx: rand(-14, 14), vy: rand(-46, -14),
                   life: rand(0.25, 0.55), maxLife: 0.55, size: rand(1.6, 4),
                   col: ['#ff9a3d', '#ffb347', '#ff6a3a', '#ffe08a'][Math.floor(rand(0, 4))] });
    }
    if (f.t >= f.life) fireZones.splice(i, 1);
  }
  // 酸弹（吐酸者）
  for (let i = acidBolts.length - 1; i >= 0; i--) {
    const b = acidBolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (parts.length < 420) {
      parts.push({ x: b.x, y: b.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.25, maxLife: 0.25, size: 2, col: 'rgba(170,220,80,0.5)' });
    }
    let gone = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!gone && Math.hypot(p.x - b.x, p.y - b.y) < p.r + 5) {
      damagePlayer(9);
      blood(b.x, b.y, rand(0, 6.28), 5, '#7ba32e');
      gone = true;
    }
    if (gone) acidBolts.splice(i, 1);
  }
  // 尖啸冲击环
  for (let i = rings.length - 1; i >= 0; i--) {
    const r0 = rings[i];
    r0.t += dt;
    if (r0.t >= r0.life) rings.splice(i, 1);
  }
  // 特斯拉闪电链：电弧持续放电
  for (let i = teslaChains.length - 1; i >= 0; i--) {
    const tc = teslaChains[i];
    tc.t += dt;
    tc.nodes = tc.nodes.filter(z => zombies.indexOf(z) >= 0); // 死亡节点断开
    for (const z of tc.nodes) {
      z.hp -= tc.dps * upg.dmg * dt; // 持续放电，逐渐扣血
      z.flash = Math.max(z.flash, 0.04);
      const zi = zombies.indexOf(z);
      if (z.hp <= 0 && zi >= 0) killZombie(zi); // 自爆者被电死会引发爆炸连锁，索引可能已被挪动
    }
    if (Math.random() < 0.6 && parts.length < 420 && tc.nodes.length) {
      const z = tc.nodes[Math.floor(rand(0, tc.nodes.length))];
      parts.push({ x: z.x + rand(-10, 10), y: z.y + rand(-10, 10),
                   vx: rand(-50, 50), vy: rand(-50, 50), life: 0.18, maxLife: 0.18,
                   size: rand(1, 2.6), col: '#bfe8ff' });
    }
    if (tc.t >= tc.life || tc.nodes.length === 0) teslaChains.splice(i, 1);
  }
  if (upg.regen > 0) {
    regenT += dt;
    if (regenT >= 5) {
      regenT -= 5;
      player.hp = Math.min(player.maxHp, player.hp + upg.regen);
    }
  }

  // VIP 空投：每 20 秒自动送达必出好货的补给
  if (vipMode) {
    vipDropT -= dt;
    if (vipDropT <= 0) {
      vipDropT = 20;
      vipAirdrop(p.x + rand(-70, 70), p.y + rand(-70, 70));
      pops.push({ x: p.x, y: p.y - 30, txt: t('vipAirdrop'), t: 0, life: 1.4 });
      S.pickup();
    }
  }
  // VIP 紧急力场：生命低于 30% 自动短暂无敌（30 秒一次）
  if (vipMode && p.forceFieldCd <= 0 && p.hp > 0 && p.hp < p.maxHp * 0.3) {
    p.forceFieldCd = 30;
    p.invulnT = Math.max(p.invulnT, 1.5);
    pops.push({ x: p.x, y: p.y - 30, txt: t('vipForceField'), t: 0, life: 1.5 });
    S.zap();
  }

  // 波次推进
  if (toSpawn > 0) {
    spawnCd -= dt;
    if (spawnCd <= 0) {
      spawnZombie();
      toSpawn--;
      spawnCd = Math.max(0.25, 0.9 - wave * 0.04);
    }
  } else if (waveActive && zombies.length === 0) {
    waveActive = false;
    addScore(wave * 50);
    waveMsg = fmt(t('waveCleared'), wave); waveMsgT = 2;
    S.clear();
    openCards(); // 三选一强化卡，选择后进入下一波倒计时
  }
  if (!waveActive && nextWaveIn > 0) {
    nextWaveIn -= dt;
    if (nextWaveIn <= 0) { wave++; startWave(wave); }
  }
}

/* ================= 渲染 ================= */
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

function render() {
  const t = performance.now() / 1000;

  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  ctx.save();
  ctx.translate(sx, sy);

  // 地面（预渲染纹理，轻微过绘覆盖抖动边缘）
  if (ground) ctx.drawImage(ground, -14, -14, W + 28, H + 28);
  else { ctx.fillStyle = '#141812'; ctx.fillRect(0, 0, W, H); }

  // 血迹 / 焦痕
  for (const s of stains) {
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = s.col || '#5c1010';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.72, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 火焰地带（燃烧瓶）
  for (const f of fireZones) {
    const k = f.t / f.life;
    const fade = k > 0.8 ? (1 - k) / 0.2 : 1;
    const flick = 0.75 + 0.25 * Math.sin(f.t * 13 + f.x);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22 * flick * fade;
    const fs = f.r * 2.4;
    ctx.drawImage(SPR.glowWarm, f.x - fs / 2, f.y - fs / 2, fs, fs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + f.t * 2;
      const fr = f.r * 0.55 * (0.8 + 0.3 * Math.sin(f.t * 9 + i * 2));
      ctx.globalAlpha = fade;
      ctx.fillStyle = i % 2 ? 'rgba(255,154,61,0.75)' : 'rgba(255,224,138,0.8)';
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * fr, f.y + Math.sin(a) * fr, 3 + Math.sin(f.t * 11 + i) * 1.2, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 尖啸冲击环
  for (const r0 of rings) {
    const k = r0.t / r0.life;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = r0.col;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r0.x, r0.y, 20 + k * 240, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 尸体（倒地渐隐）
  for (const cp of corpses) {
    const fade = cp.t < cp.life - 1 ? 1 : Math.max(0, (cp.life - cp.t) / 1);
    ctx.globalAlpha = fade * 0.9;
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(cp.ang);
    ctx.fillStyle = shade(cp.col, -0.28);
    ctx.beginPath(); ctx.ellipse(0, 0, cp.r, cp.r * 0.66, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = shade(cp.col, -0.38);
    ctx.beginPath(); ctx.arc(cp.r * 0.85, cp.r * 0.14, cp.r * 0.46, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(cp.col, -0.2);
    ctx.lineWidth = cp.r * 0.24;
    ctx.beginPath(); ctx.moveTo(-cp.r * 0.2, cp.r * 0.4); ctx.lineTo(-cp.r * 1.05, cp.r * 0.62); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 玩家周身光源
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.09;
  ctx.drawImage(SPR.glowWarm, player.x - 170, player.y - 170, 340, 340);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 补给
  for (const k of pickups) {
    const bob = Math.sin(k.t * 4) * 3;
    const blink = k.life < 3 && Math.sin(k.life * 12) < 0 ? 0.35 : 1;
    ctx.globalAlpha = blink * (0.12 + 0.08 * Math.sin(k.t * 3));
    ctx.drawImage(SPR.glowSoft, k.x - 30, k.y + bob - 30, 60, 60);
    ctx.globalAlpha = blink * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(k.x, k.y + 9, 11, 4.5, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = blink;
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    if (k.type === 'med') {
      ctx.fillStyle = '#eef0ea'; rr(ctx, -11, -9, 22, 18, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#c9271f';
      ctx.fillRect(-2.5, -6, 5, 12); ctx.fillRect(-6, -2.5, 12, 5);
    } else if (k.type === 'ammo') {
      ctx.fillStyle = '#454d40'; rr(ctx, -10, -8, 20, 16, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      for (const bx of [-6, -1.5, 3]) { ctx.fillRect(bx, -4, 3, 7); ctx.fillRect(bx + 0.5, -5.5, 2, 2); }
    } else if (k.type === 'nade') {
      ctx.fillStyle = '#3a4a32';
      ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = Math.sin(k.t * 10) > 0 ? '#ff5340' : '#5a2020';
      ctx.beginPath(); ctx.arc(0, -3, 1.8, 0, 7); ctx.fill();
    } else if (k.type === 'mol') {
      ctx.fillStyle = '#5f8f6f';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#7fb591';
      ctx.fillRect(-2, -10, 4, 5.5);
      ctx.fillStyle = Math.sin(k.t * 10) > 0 ? '#ff9a3d' : '#ff6a3a';
      ctx.beginPath(); ctx.arc(0, -12, 2, 0, 7); ctx.fill();
    } else {
      const wtype = k.type.slice(1);
      const col = WCOL[wtype] || '#cfd6c8';
      const gmap = WGLOW[wtype] || 'glowSoft';
      ctx.globalAlpha = blink * (0.18 + 0.12 * Math.sin(k.t * 3.5));
      ctx.drawImage(SPR[gmap], -34, -34, 68, 68);
      ctx.globalAlpha = blink;
      ctx.fillStyle = '#2b312c';
      rr(ctx, -12, -9, 24, 18, 3); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      weaponGlyph(ctx, 0, 0, wtype, 1.1, col);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 手雷（飞行 / 引信）
  for (const n of nades) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 3, 5, 3, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#3a4a32';
    ctx.beginPath(); ctx.arc(n.x, n.y, 5.5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(n.x - 1.8, n.y - 1.8, 1.8, 0, 7); ctx.fill();
    const blinkHz = n.fuse < 0.4 ? 28 : 9;
    if (Math.sin(n.t * blinkHz) > 0) {
      ctx.fillStyle = '#ff5340';
      ctx.beginPath(); ctx.arc(n.x, n.y - 2.5, 1.6, 0, 7); ctx.fill();
    }
  }

  // 燃烧瓶（飞行 / 引信）
  for (const n of mols) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(n.x, n.y + 3, 5, 3, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5f8f6f';
    ctx.beginPath(); ctx.arc(n.x, n.y, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#7fb591';
    ctx.fillRect(n.x - 1.5, n.y - 8.5, 3, 4.5);
    ctx.fillStyle = Math.sin(n.t * 14) > 0 ? '#ff9a3d' : '#ff6a3a';
    ctx.beginPath(); ctx.arc(n.x, n.y - 10, 1.8, 0, 7); ctx.fill();
  }

  // ===== 僵尸（预渲染人形精灵：整体旋向玩家 + 拖步起伏） =====
  for (const z of zombies) {
    const a = Math.atan2(player.y - z.y, player.x - z.x);
    const spr = SPR[z.type];
    // 投影
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(z.x + 2, z.y + 4, z.r * 1.05, z.r * 0.72, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    const sway = z.type === 'runner' ? Math.sin(z.wob) * 0.14 : Math.sin(z.wob * 0.5) * 0.07;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(a + Math.PI / 2 + sway);
    ctx.translate(0, Math.sin(z.wob * 2) * 1.6); // 拖步起伏
    ctx.drawImage(spr.c, -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    // 局部空间动态部件
    if (z.type === 'spitter') { // 酸囊充气
      const charge = clamp(1 - z.spitCd / 2.2, 0, 1);
      ctx.globalAlpha = 0.3 + 0.3 * charge;
      ctx.fillStyle = '#b7e055';
      ctx.beginPath(); ctx.arc(0, -z.r * 0.05, z.r * (0.3 + 0.25 * charge), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (z.type === 'bloater' && z.fuseT > 0 && Math.sin(t * 40) > 0) { // 引信红闪
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ff5340';
      ctx.beginPath(); ctx.ellipse(0, 0, z.r * 0.9, z.r * 0.75, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (z.flash > 0) {
      ctx.globalAlpha = Math.min(1, z.flash / 0.07) * 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * 0.85, z.r * 0.7, a, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (z.buffT > 0) { // 被狂化的红圈
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 12);
      ctx.strokeStyle = '#ff5ec7';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 5, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 受击闪白
    if (z.flash > 0) {
      ctx.globalAlpha = Math.min(1, z.flash / 0.07) * 0.65;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 血条
    if (z.hp < z.maxHp) {
      const w = z.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(z.x - w / 2, z.y - z.r - 9, w, 4);
      ctx.fillStyle = '#d43b30';
      ctx.fillRect(z.x - w / 2, z.y - z.r - 9, w * clamp(z.hp / z.maxHp, 0, 1), 4);
    }
  }

  // ===== 玩家 =====
  const p = player;
  // 投影
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, p.r * 1.05, p.r * 0.75, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  // 双脚（行走进动）
  const step = p.moving ? Math.sin(p.walk) : 0;
  ctx.fillStyle = '#20241f';
  for (const s of [-1, 1]) {
    const along = step * 6 * s;
    const fx = p.x + Math.cos(p.ang) * along + Math.cos(p.ang + Math.PI / 2) * s * 6;
    const fy = p.y + Math.sin(p.ang) * along + Math.sin(p.ang + Math.PI / 2) * s * 6;
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(p.ang);
    ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 3, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  // 枪（带后坐 + 双色）
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.ang);
  ctx.fillStyle = '#1d2023';
  ctx.fillRect(p.r - 4 - p.recoil, -3, 30, 6);
  ctx.fillStyle = '#34383d';
  ctx.fillRect(p.r + 8 - p.recoil, -2, 12, 2.6);
  ctx.fillStyle = '#2a2e33';
  ctx.fillRect(p.r - 2 - p.recoil, -6, 7, 5);
  ctx.fillStyle = '#20241f';
  ctx.fillRect(p.r + 2 - p.recoil, 2, 5, 6);
  ctx.restore();
  // 躯体（径向渐变）
  const bodyGrd = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, p.r + 1);
  bodyGrd.addColorStop(0, '#7d9a6d');
  bodyGrd.addColorStop(0.7, '#5c7a52');
  bodyGrd.addColorStop(1, '#3c5238');
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7);
  ctx.fillStyle = bodyGrd; ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rapidT > 0 ? 'rgba(255,210,74,' + (0.5 + 0.5 * Math.sin(t * 14)) + ')' : (vipMode ? 'rgba(255,210,74,0.5)' : 'rgba(0,0,0,0.5)');
  ctx.stroke();
  // 冲刺无敌闪烁
  if (p.invulnT > 0) {
    ctx.strokeStyle = 'rgba(160,220,255,' + (0.35 + 0.35 * Math.sin(t * 30)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, 7); ctx.stroke();
  }
  // 背包
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
  ctx.fillStyle = '#39412f';
  rr(ctx, -p.r - 2, -5.5, 8, 11, 2.5); ctx.fill();
  ctx.restore();
  // 头盔
  const hxp = p.x + Math.cos(p.ang) * 2.5, hyp = p.y + Math.sin(p.ang) * 2.5;
  const hg = ctx.createRadialGradient(hxp - 2, hyp - 2.5, 1, hxp, hyp, 7);
  hg.addColorStop(0, '#8d9a6a'); hg.addColorStop(1, '#4e5c3d');
  ctx.beginPath(); ctx.arc(hxp, hyp, 6.5, 0, 7);
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 枪口火光（光晕 + 星形焰）
  if (muzzleT > 0) {
    const k = muzzleT / 0.05;
    const mx = p.x + Math.cos(p.ang) * (p.r + 24), my = p.y + Math.sin(p.ang) * (p.r + 24);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k;
    ctx.drawImage(SPR.glowWarm, mx - 26, my - 26, 52, 52);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(p.ang);
    ctx.fillStyle = 'rgba(255,224,130,' + k + ')';
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(2, -4.5); ctx.lineTo(-6, -2); ctx.lineTo(-6, 2); ctx.lineTo(2, 4.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 装填进度环
  if (p.reloadT > 0) {
    const prog = 1 - p.reloadT / WEAPONS[p.weapon].reloadT;
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  }

  // 子弹（双层曳光，磁轨枪为青色贯穿光）
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const glowCol = b.pierce ? 'rgba(126,200,255,0.35)' : 'rgba(255,190,80,0.3)';
    const coreCol = b.pierce ? '#b9e2ff' : '#ffe9a8';
    ctx.strokeStyle = glowCol;
    ctx.lineWidth = b.pierce ? 7 : 5.5;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.stroke();
    ctx.strokeStyle = coreCol;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); ctx.stroke();
  }

  // 酸弹（吐酸者）
  for (const b of acidBolts) {
    ctx.fillStyle = 'rgba(190,235,110,0.5)';
    ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#a4d637';
    ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, 7); ctx.fill();
  }

  // 特斯拉闪电链（枪口连到目标，目标之间连环，逐帧抖动）
  for (const tc of teslaChains) {
    const alpha = tc.t > tc.life - 0.4 ? (tc.life - tc.t) / 0.4 : 1;
    ctx.globalAlpha = alpha;
    let px = player.x + Math.cos(player.ang) * (player.r + 6);
    let py = player.y + Math.sin(player.ang) * (player.r + 6);
    for (const z of tc.nodes) {
      drawLightning(px, py, z.x, z.y, 7);
      px = z.x; py = z.y;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const z of tc.nodes) {
      ctx.drawImage(SPR.glowCyan, z.x - 15, z.y - 15, 30, 30);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // 弹壳
  for (const c of casings) {
    ctx.globalAlpha = clamp(c.life / 0.5, 0, 1);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-2.5, -1.1, 5, 2.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 粒子
  for (const q of parts) {
    ctx.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 爆炸闪光与冲击环
  for (const f of flashes) {
    const k = f.t / f.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - k) * 0.9;
    const fsz = f.r * (0.5 + k * 1.1) * 2;
    ctx.drawImage(SPR.glowWarm, f.x - fsz / 2, f.y - fsz / 2, fsz, fsz);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = 'rgba(255,180,80,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + k * 0.95), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 击杀飘分
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const q of pops) {
    ctx.globalAlpha = clamp(1 - q.t / q.life, 0, 1);
    ctx.font = 'bold 14px ' + FONT;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.strokeText(q.txt, q.x, q.y);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText(q.txt, q.x, q.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // 抖动结束

  // 暗角
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // 受伤红光 + 低血量脉冲
  const red = clamp(hurtT * 1.4, 0, 0.5) + (p.hp > 0 && p.hp < 30 ? 0.16 + 0.08 * Math.sin(t * 6) : 0);
  if (red > 0) {
    const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, 'rgba(180,20,20,0)');
    rg.addColorStop(1, 'rgba(180,20,20,' + clamp(red, 0, 0.6) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'playing' || state === 'gameover') drawHUD(t);
  if (state === 'playing' && !paused) drawCrosshair();
  if (state === 'playing') drawWaveTexts();
}

function drawHUD(now) {
  const p = player;
  // ---- 左上面板：生命 / 武器 / 手雷 / 冲刺 ----
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,9,6,0.5)';
  rr(ctx, 16, 16, 262, 140, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  rr(ctx, 16, 16, 262, 140, 10); ctx.stroke();
  if (vipMode) { // VIP 徽章
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText('★ VIP ×2', 270, 25);
    ctx.textAlign = 'left';
  }
  // 心形图标
  ctx.save();
  ctx.translate(32, 38);
  ctx.fillStyle = '#e13b30';
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-6.5, -2, -5.5, -8, -2.2, -8);
  ctx.bezierCurveTo(-0.8, -8, 0, -6.5, 0, -5.5);
  ctx.bezierCurveTo(0, -6.5, 0.8, -8, 2.2, -8);
  ctx.bezierCurveTo(5.5, -8, 6.5, -2, 0, 4);
  ctx.fill();
  ctx.restore();
  // 生命条（渐变 + 刻度）
  const bx = 52, by = 30, bw = 208, bh = 16;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  rr(ctx, bx, by, bw, bh, 4); ctx.fill();
  const hpc = clamp(p.hp / p.maxHp, 0, 1);
  if (hpc > 0) {
    const hgr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hgr.addColorStop(0, '#a01d16'); hgr.addColorStop(0.5, '#e13b30'); hgr.addColorStop(1, '#ff6a54');
    ctx.fillStyle = hgr;
    rr(ctx, bx, by, Math.max(bh, bw * hpc), bh, 4); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(bx + 3, by + 2, bw - 6, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const x = bx + bw * i / 10;
    ctx.moveTo(x, by + 2); ctx.lineTo(x, by + bh - 2);
  }
  ctx.stroke();
  ctx.fillStyle = '#f2e9dc';
  ctx.font = 'bold 12px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(fmt(t('hp'), Math.ceil(p.hp), p.maxHp), bx + 8, by + bh / 2 + 0.5);
  // 武器行：图标 + 名称 + 弹药
  const ay = by + bh + 16;
  const wd = WEAPONS[p.weapon];
  weaponGlyph(ctx, 36, ay, p.weapon, 1.1, WCOL[p.weapon]);
  ctx.fillStyle = '#f2e9dc';
  ctx.font = 'bold 14px ' + FONT;
  ctx.fillText(t(wd.nameKey), 48, ay + 1);
  ctx.textAlign = 'right';
  if (p.reloadT > 0) {
    ctx.fillStyle = 'rgba(255,210,74,' + (0.55 + 0.45 * Math.sin(now * 12)) + ')';
    ctx.fillText(t('reloading'), 262, ay + 1);
  } else {
    ctx.fillStyle = p.mag <= 3 ? '#ff9a3d' : '#f2d98c';
    ctx.fillText(p.mag + ' / ' + (isFinite(p.reserve) ? p.reserve : '∞'), 262, ay + 1);
  }
  ctx.textAlign = 'left';
  // 手雷 / 燃烧瓶 / 医疗包 / 冲刺
  const gy = ay + 32;
  ctx.fillStyle = '#3a4a32';
  ctx.beginPath(); ctx.arc(30, gy, 5.5, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ff5340';
  ctx.beginPath(); ctx.arc(30, gy - 2.5, 1.6, 0, 7); ctx.fill();
  ctx.fillStyle = p.grenades > 0 ? '#f2e9dc' : '#77726a';
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillText('× ' + p.grenades, 40, gy + 1);
  // 燃烧瓶
  ctx.fillStyle = '#5f8f6f';
  ctx.beginPath(); ctx.arc(86, gy + 1, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9a3d';
  ctx.beginPath(); ctx.arc(86, gy - 4.5, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = p.mols > 0 ? '#f2e9dc' : '#77726a';
  ctx.fillText('× ' + p.mols, 96, gy + 1);
  // 医疗包
  ctx.fillStyle = '#e8e8e2';
  rr(ctx, 138, gy - 5, 13, 11, 2); ctx.fill();
  ctx.fillStyle = '#c9271f';
  ctx.fillRect(142.5, gy - 4, 4, 9); ctx.fillRect(140, gy - 1.5, 9, 4);
  ctx.fillStyle = p.medkits > 0 ? '#f2e9dc' : '#77726a';
  ctx.fillText('× ' + p.medkits, 156, gy + 1);
  // 冲刺充能
  const dkr = 1 - p.dashCd / p.dashCdMax;
  ctx.strokeStyle = dkr >= 1 ? '#7ec8ff' : '#5a7a8a';
  ctx.lineWidth = 2;
  for (const off of [0, 5]) {
    ctx.beginPath();
    ctx.moveTo(190 + off, gy - 4); ctx.lineTo(186 + off, gy); ctx.lineTo(190 + off, gy + 4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  rr(ctx, 200, gy - 4, 58, 8, 3); ctx.fill();
  if (dkr > 0) {
    ctx.fillStyle = dkr >= 1 ? 'rgba(126,200,255,' + (0.7 + 0.3 * Math.sin(now * 8)) + ')' : 'rgba(126,200,255,0.45)';
    rr(ctx, 200, gy - 4, Math.max(4, 58 * dkr), 8, 3); ctx.fill();
  }
  if (rapidT > 0) {
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(fmt(t('rapid'), rapidT.toFixed(1)), 30, gy + 24);
  }

  // ---- 右上面板：得分 / 波次 ----
  const pw = 196, px2 = W - pw - 26;
  ctx.fillStyle = 'rgba(6,9,6,0.5)';
  rr(ctx, px2, 16, pw, 104, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, px2, 16, pw, 104, 10); ctx.stroke();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f2d98c';
  ctx.font = 'bold 24px ' + FONT;
  ctx.fillText(fmt(t('score'), score), W - 40, 42);
  ctx.fillStyle = '#aebfa4';
  ctx.font = '14px ' + FONT;
  ctx.fillText(fmt(t('waveN'), wave), W - 40, 68);
  ctx.fillText(fmt(t('left'), zombies.length + toSpawn), W - 40, 88);
  ctx.fillStyle = '#8fa084';
  ctx.fillText(fmt(t('bestShort'), best), W - 40, 108);

  // 左下提示
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(160,180,150,0.45)';
  ctx.font = '12px ' + FONT;
  ctx.fillText(muted ? t('hintMute') : t('hint'), 24, H - 20);
  ctx.textBaseline = 'alphabetic';
}

function drawWaveTexts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '6px';
  if (waveMsgT > 0) {
    const k = clamp(waveMsgT, 0, 1);
    ctx.font = 'bold 42px ' + FONT;
    const tw = ctx.measureText(waveMsg).width;
    const bw = tw + 90, y = H * 0.2;
    const sc = 1 + Math.max(0, waveMsgT - 1.85) * 1.4;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(sc, sc);
    ctx.globalAlpha = k * 0.8;
    ctx.fillStyle = 'rgba(5,8,5,0.72)';
    rr(ctx, -bw / 2, -40, bw, 62, 8); ctx.fill();
    ctx.fillStyle = 'rgba(212,59,48,0.85)';
    ctx.fillRect(-bw / 2, -40, bw, 3);
    ctx.fillRect(-bw / 2, 19, bw, 3);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ff6a54';
    ctx.fillText(waveMsg, 0, 8);
    ctx.restore();
  }
  ctx.letterSpacing = '0px';
  if (!waveActive && nextWaveIn > 0) {
    ctx.fillStyle = 'rgba(174,191,164,0.9)';
    ctx.font = '17px ' + FONT;
    ctx.fillText(fmt(t('nextWave'), Math.ceil(nextWaveIn)), W / 2, H * 0.2 + 92);
  }
}

function drawCrosshair() {
  const x = mouse.x, y = mouse.y;
  const col = mouse.down ? 'rgba(255,90,70,0.95)' : 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
  ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill();
}

/* ================= 主循环 ================= */
function showBest() {
  bestStart.textContent = best > 0 ? fmt(t('best'), best) : t('firstRun');
}
window.I18N_ONAPPLY = showBest;
showBest();

let last = performance.now();
let frameCount = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state === 'playing' && !paused && !cardOpen) update(dt);
  render();
  frameCount++;
  requestAnimationFrame(frame);
}
reset(); // 主循环从加载即开始渲染，实体必须先于首帧初始化
requestAnimationFrame(frame);
