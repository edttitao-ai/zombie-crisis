'use strict';
// 游戏状态：状态机 / reset / 开始与结算 / 波次流程 / Boss 投放
/* ================= 游戏状态 ================= */
let state = 'start';          // start | playing | gameover
let paused = false;
let player, bullets, zombies, parts, pickups, corpses, casings, pops, nades, mols, fireZones, flashes, acidBolts, rings, teslaChains, beams, rollers, shells;
let upg, upgTaken, regenT = 0, cardOpen = false, cardPicks = [];
let combo = 0, comboT = 0, hitStopT = 0;   // 连杀计数 / 连杀窗口 / 击杀顿帧
let burnCd = 0;                            // 点燃节流：火焰喷射器的灼烧不能无限叠加
let vipMode = false;
let lastMode = STORE.get('zc_lastmode') === 'vip';
let petPick = STORE.get('zc_pet') || 'hound';   // 开始界面选中的宠物（跨局记住）
let pet = null, petArcs = [];                   // 本局宠物 + 它的电弧特效
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
  acidBolts = []; rings = []; teslaChains = []; beams = []; rollers = []; shells = [];
  pet = null; petArcs.length = 0;
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

function startGame(vip, petId) {
  ensureAudio();
  vipMode = !!vip;
  lastMode = vipMode;
  STORE.set('zc_lastmode', vipMode ? 'vip' : 'normal');
  // 宠物：VIP 专属宠物在普通模式下不生效，自动回退到默认猎犬（开始界面也会拦住这种情况）
  const want = petId || petPick || 'hound';
  petPick = (petDef(want).vip && !vipMode) ? 'hound' : want;
  STORE.set('zc_pet', petPick);
  reset();
  // 开局装备：普通用户是特斯拉电枪，VIP 是无限弹匣加特林；两者都备弹无限、投掷物与医疗满载
  player.weapon = fallbackWeapon();
  player.mag = curMagSize();
  player.reserve = Infinity;
  player.grenades = 5; player.mols = 3; player.medkits = 3;
  pet = createPet(petPick);
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

// ended = true 表示玩家主动「结束本局」（不是被打死）。成绩一样记入排行榜，
// 只是标题与音效不同 —— 主动认输也是一局的合法结局，没理由不记账。
function gameOver(ended) {
  state = 'gameover';
  paused = false;
  cardOpen = false;
  if (ended) S.clear(); else S.over();
  best = Math.max(best, score);
  STORE.set('zc_best', best);
  boardAdd({ s: score, w: wave, k: kills, m: vipMode ? 1 : 0, d: Date.now() });
  const titleKey = ended ? 'runEndedTitle' : 'gameOverTitle';
  const ovTitle = document.getElementById('ovTitle');
  if (ovTitle) { ovTitle.setAttribute('data-i18n', titleKey); ovTitle.textContent = t(titleKey); }
  document.getElementById('ovScore').textContent = score;
  document.getElementById('ovWave').textContent = wave;
  document.getElementById('ovKills').textContent = kills;
  document.getElementById('ovBest').textContent = best;
  renderOverRank();
  elPause.classList.add('hidden');
  elCards.classList.add('hidden');
  elOver.classList.remove('hidden');
}
// 暂停菜单里的「结束本局」：直接进结算，不再等玩家被打死
function endRun() { if (state === 'playing') gameOver(true); }

// 结算界面的「本局排名」一行 + 顺势重画榜单（榜单本体在 board.js）
function renderOverRank() {
  const el = document.getElementById('ovRank');
  if (el) {
    if (lastRunRank > 0) {
      el.textContent = fmt(t('boardRankIn'), lastRunRank);
      el.className = 'rank-line' + (lastRunRank === 1 ? ' top1' : '');
    } else {
      el.textContent = fmt(t('boardNoRank'), BOARD_MAX);
      el.className = 'rank-line none';
    }
  }
  renderBoards();
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
  // 出场点同样走「均匀随机角度 + 随机距离」，理由见 entities.js 的 spawnPointAt
  const p = spawnPointAt(Math.random() * TAU);
  spawnAt(type, p.x, p.y);
  const bz = zombies[zombies.length - 1];
  bz.slamCd = 1.2; bz.sumCd = 5;   // 登场后先给玩家一点反应时间
  shake = Math.max(shake, 16);
  rings.push({ x: clamp(p.x, 40, W - 40), y: clamp(p.y, 40, H - 40), t: 0, life: 1.0, col: 'rgba(255,120,90,0.85)' });
  waveMsg = t('bossWarn') + ' · ' + t(ZDEF[type].nameKey); waveMsgT = 2.6;
  S.scream();
}
