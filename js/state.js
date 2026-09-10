'use strict';
// 游戏状态：状态机 / reset / 开始与结算 / 波次流程 / Boss 投放
/* ================= 游戏状态 ================= */
let state = 'start';          // start | playing | gameover
let paused = false;
let player, bullets, zombies, parts, pickups, corpses, casings, pops, nades, mols, fireZones, flashes, acidBolts, rings, teslaChains, beams, rollers;
let upg, upgTaken, regenT = 0, cardOpen = false, cardPicks = [];
let combo = 0, comboT = 0, hitStopT = 0;   // 连杀计数 / 连杀窗口 / 击杀顿帧
let burnCd = 0;                            // 点燃节流：火焰喷射器的灼烧不能无限叠加
let vipMode = false;
let lastMode = STORE.get('zc_lastmode') === 'vip';
let vipDropT = 0;
let wave, score, kills, toSpawn, spawnCd, nextWaveIn, waveActive, bossIn = -1, bossType = null;
let waveMsg, waveMsgT, shake, hurtT, rapidT, muzzleT, hitMarkT;
let best = +(STORE.get('zc_best') || 0);

function reset() {
  player = { x: W / 2, y: H / 2, r: 15, hp: 100, maxHp: 100, speed: 230,
             ang: 0, mag: 30, fireCd: 0, reloadT: 0, recoil: 0,
             walk: 0, moving: false, weapon: 'rail', reserve: Infinity,   // 占位，开局由 startGame 按模式设定
             grenades: 2, mols: 1, medkits: 1, nadeCd: 0,
             dashT: 0, dashCd: 0, invulnT: 0, ddx: 0, ddy: 0, hpShown: 100 };
  bullets = []; zombies = []; parts = []; pickups = [];
  stains.length = 0; gameT = 0; stainT = 0;   // 贴花列表常驻，只清空内容
  if (groundCtx) compositeGround();            // 顺带把上一局残留的血迹从地面抹掉
  corpses = []; casings = []; pops = []; nades = []; mols = []; fireZones = []; flashes = [];
  acidBolts = []; rings = []; teslaChains = []; beams = []; rollers = [];
  combo = 0; comboT = 0; hitStopT = 0; burnCd = 0;
  resetUpgrades();
  upg.speed += 0.1;      // 开局自带移速 +10%（原 VIP 特权，现已对普通用户开放）
  upg.dmg += 0.15;       // 开局自带伤害 +15%（同上）
  regenT = 0; cardOpen = false; cardPicks = []; vipDropT = 20;
  player.revives = 2;                    // 复活甲 ×2（原 VIP 特权，现已通用）
  player.forceFieldCd = 0;               // VIP：紧急力场冷却
  player.dashCdMax = 1.75;               // 冲刺冷却 -30%（原 VIP 特权，现已通用）
  wave = 0; score = 0; kills = 0;
  toSpawn = 0; spawnCd = 0; nextWaveIn = 2.2; waveActive = false;
  bossIn = -1; bossType = null;
  waveMsg = t('getReady'); waveMsgT = 2.2;
  shake = 0; hurtT = 0; rapidT = 0; muzzleT = 0; hitMarkT = 0;
}

function startGame(vip) {
  ensureAudio();
  vipMode = !!vip;
  lastMode = vipMode;
  STORE.set('zc_lastmode', vipMode ? 'vip' : 'normal');
  reset();
  // 开局装备：普通用户是特斯拉电枪，VIP 是无限弹匣加特林；两者都备弹无限、投掷物与医疗满载
  player.weapon = fallbackWeapon();
  player.mag = curMagSize();
  player.reserve = Infinity;
  player.grenades = 5; player.mols = 3; player.medkits = 3;
  state = 'playing'; paused = false; cardOpen = false;
  elStart.classList.add('hidden');
  elOver.classList.add('hidden');
  elPause.classList.add('hidden');
  elCards.classList.add('hidden');
}

// 连杀倍率：2.5 秒内连续击杀会累积，最高 +100%。给「一直杀」正向反馈。
function comboMul() { return 1 + Math.min(combo, 20) * 0.05; }

function addScore(n) {
  score += Math.round(n * 2 * comboMul());   // 得分 ×2（原 VIP 特权，现已通用）
}

function gameOver() {
  state = 'gameover';
  S.over();
  best = Math.max(best, score);
  STORE.set('zc_best', best);
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
  // 每 5 波：先放杂兵铺场，1.6 秒后再投 Boss（两种交替）
  if (n % 5 === 0) { bossIn = 1.6; bossType = BOSS_ORDER[((n / 5) - 1) % BOSS_ORDER.length]; }
  else bossIn = -1;
  // 每波开始回复 35（原 VIP 医疗顾问，现已通用）
  player.hp = Math.min(player.maxHp, player.hp + 35);
  pops.push({ x: player.x, y: player.y - 30, txt: t('waveHeal'), t: 0, life: 1.2 });
  S.wave();
}

// Boss 登场演出：全屏震动 + 一圈冲击环 + 广播
function spawnBoss(type) {
  const m = 70;
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0)      { x = Math.random() * W; y = -m; }
  else if (side === 1) { x = W + m; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = H + m; }
  else                 { x = -m; y = Math.random() * H; }
  spawnAt(type, x, y);
  const bz = zombies[zombies.length - 1];
  bz.slamCd = 1.2; bz.sumCd = 5;   // 登场后先给玩家一点反应时间
  shake = Math.max(shake, 16);
  rings.push({ x: clamp(x, 40, W - 40), y: clamp(y, 40, H - 40), t: 0, life: 1.0, col: 'rgba(255,120,90,0.85)' });
  waveMsg = t('bossWarn') + ' · ' + t(ZDEF[type].nameKey); waveMsgT = 2.6;
  S.scream();
}
