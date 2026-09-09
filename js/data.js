// 数据模块：武器定义 / 强化卡牌（每种语言文案在 lang/ 下独立文件）
/* ================= 武器定义 ================= */
const WEAPONS = {
  pistol: { nameKey: 'wPistol', dmg: 13, rate: 0.13,  spread: 0.035, pellets: 1, magSize: 30, reloadT: 1.1, speed: 700, reserve: Infinity, auto: true,  shake: 1.5 },
  smg:    { nameKey: 'wSMG',    dmg: 9,  rate: 0.075, spread: 0.075, pellets: 1, magSize: 45, reloadT: 1.0, speed: 760, reserve: 135,     auto: true,  shake: 1.2 },
  shot:   { nameKey: 'wShot',   dmg: 8,  rate: 0.5,   spread: 0.16,  pellets: 6, magSize: 8,  reloadT: 1.3, speed: 620, reserve: 32,      auto: false, shake: 5,   knock: 2.5 },
  rock:   { nameKey: 'wRock',   dmg: 0,  rate: 1.1,   spread: 0.012, pellets: 1, magSize: 4,  reloadT: 1.7, speed: 430, reserve: 12,      auto: false, shake: 4,   knock: 0, rocket: true, splash: 105, splashDmg: 62 },
  rail:   { nameKey: 'wRail',   dmg: 0,  rate: 1.2,   spread: 0,     pellets: 1, magSize: 6,  reloadT: 1.6, speed: 0,   reserve: 18,      auto: false, shake: 3,   tesla: true, dps: 18, teslaLife: 2.5, hopDist: 190, maxHops: 7 },
  mini:   { nameKey: 'wMini',   dmg: 7,  rate: 0.045, spread: 0.12,  pellets: 1, magSize: 80, reloadT: 2.2, speed: 820, reserve: 240,     auto: true,  shake: 0.8 }
};
const WCOL = { pistol: '#cfd6c8', smg: '#ffb347', shot: '#ff6a54', rock: '#7ec8ff', rail: '#c9a2ff', mini: '#d6e86b' };
const WGLOW = { smg: 'glowWarm', shot: 'glowRed', rock: 'glowCyan', rail: 'glowSoft', mini: 'glowWarm' };
function weaponGlyph(c, x, y, type, s, col) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = col;
  if (type === 'pistol') {
    c.fillRect(-5, -2, 9, 3); c.fillRect(-4, 1, 3, 4);
  } else if (type === 'smg') {
    c.fillRect(-7, -2, 14, 3.4); c.fillRect(-1, 1, 3, 5); c.fillRect(-7, -3.4, 4, 1.6);
  } else if (type === 'shot') {
    c.fillRect(-8, -1.4, 16, 2.8); c.fillRect(-8, 1, 5, 3);
  } else if (type === 'rock') {
    c.fillRect(-8, -2.6, 13, 5.2);
    c.beginPath(); c.moveTo(5, -2.6); c.lineTo(9.5, 0); c.lineTo(5, 2.6); c.closePath(); c.fill();
    c.fillRect(-5, 2.6, 3, 3);
  } else if (type === 'rail') {
    c.fillRect(-9, -1.6, 18, 3.2);
    c.fillRect(-3, -3.4, 2, 1.8); c.fillRect(0, -3.4, 2, 1.8); c.fillRect(3, -3.4, 2, 1.8);
    c.fillRect(-6, 1.6, 4, 3);
  } else if (type === 'mini') {
    c.fillRect(-8, -3, 16, 6);
    c.fillRect(-8, -4.6, 4, 1.6); c.fillRect(-8, 3, 4, 1.6);
    c.beginPath(); c.arc(7, 0, 2.6, 0, 7); c.fill();
  }
  c.restore();
}
function curMagSize() { return Math.round(WEAPONS[player.weapon].magSize * upg.mag); }

/* ================= 僵尸种类定义 ================= */
const ZDEF = {
  normal:   { r: 14, hp: 30,  hpW: 5,  spd: 58,  spdW: 3,   spdCap: 115, dmg: 10, col: '#5d8a44', sc: 10, minWave: 1 },
  runner:   { r: 11, hp: 20,  hpW: 3,  spd: 128, spdW: 4,   spdCap: 195, dmg: 8,  col: '#96a13f', sc: 15, minWave: 2 },
  spitter:  { r: 13, hp: 26,  hpW: 4,  spd: 55,  spdW: 2,   spdCap: 80,  dmg: 6,  col: '#7a9a3a', sc: 15, minWave: 3, ranged: true },
  bloater:  { r: 20, hp: 60,  hpW: 8,  spd: 38,  spdW: 1.5, spdCap: 60,  dmg: 0,  col: '#8f8a3f', sc: 20, minWave: 3, boom: true },
  shielder: { r: 15, hp: 55,  hpW: 8,  spd: 62,  spdW: 2.5, spdCap: 105, dmg: 12, col: '#6b7a6b', sc: 25, minWave: 4, armor: true },
  screamer: { r: 12, hp: 24,  hpW: 4,  spd: 70,  spdW: 3,   spdCap: 120, dmg: 6,  col: '#b86a9a', sc: 25, minWave: 5, scream: true },
  brute:    { r: 24, hp: 120, hpW: 12, spd: 42,  spdW: 1.5, spdCap: 70,  dmg: 22, col: '#3f6b33', sc: 30, minWave: 4 }
};
function pickZombieType() {
  const r = Math.random();
  if (wave >= 5 && r < 0.08) return 'screamer';
  if (wave >= 4 && r < 0.18) return 'brute';
  if (wave >= 4 && r < 0.30) return 'shielder';
  if (wave >= 3 && r < 0.42) return 'bloater';
  if (wave >= 3 && r < 0.54) return 'spitter';
  if (wave >= 2 && r < 0.76) return 'runner';
  return 'normal';
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* ================= 强化卡牌 ================= */
const ICON_DMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
const CARDS = [
  { id: 'dmg',    max: 8, color: '#ff6a54', icon: ICON_DMG, apply: () => { upg.dmg += 0.15; } },
  { id: 'rate',   max: 6, color: '#ffb347', icon: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor"/></svg>', apply: () => { upg.rate *= 0.88; } },
  { id: 'mag',    max: 5, color: '#ffd24a', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="8" width="4" height="12" rx="2" fill="currentColor"/><rect x="10" y="5" width="4" height="15" rx="2" fill="currentColor"/><rect x="16" y="8" width="4" height="12" rx="2" fill="currentColor"/></svg>', apply: () => { upg.mag += 0.3; } },
  { id: 'reload', max: 5, color: '#8fd48a', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3v5h-5"/></svg>', apply: () => { upg.reload += 0.15; } },
  { id: 'speed',  max: 5, color: '#7ec8ff', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 4l7 8-7 8M13 4l7 8-7 8"/></svg>', apply: () => { upg.speed += 0.1; } },
  { id: 'hp',     max: 6, color: '#e13b30', icon: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.3-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.7-8 11-8 11z" fill="currentColor"/></svg>', apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); } },
  { id: 'crit',   max: 6, color: '#ff5ec7', icon: '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 6.4L21 10l-5.4 4 1.8 7-5.4-4-5.4 4 1.8-7L4 10l6.6-1.6z" fill="currentColor"/></svg>', apply: () => { upg.crit += 0.1; } },
  { id: 'throw',  max: 4, color: '#a2e86b', icon: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M14 8l4-5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="19" cy="3" r="2" fill="currentColor"/></svg>', apply: () => { upg.throwCap += 2; player.grenades = Math.min(upg.throwCap, player.grenades + 2); player.mols = Math.min(upg.throwCap, player.mols + 2); } },
  { id: 'regen',  max: 3, color: '#8fd48a', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>', apply: () => { upg.regen += 3; } },
  { id: 'vest',   max: 5, color: '#b9c4d0', icon: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5z" fill="currentColor"/></svg>', apply: () => { upg.vest = Math.min(0.6, upg.vest + 0.12); } },
  { id: 'fire',   max: 4, color: '#ff9a3d', icon: '<svg viewBox="0 0 24 24"><path d="M12 2c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10z" fill="currentColor"/></svg>', apply: () => { upg.fire += 0.3; } }
];
function resetUpgrades() {
  upg = { dmg: 1, rate: 1, mag: 1, reload: 1, speed: 1, crit: 0, vest: 0, throwCap: 5, regen: 0, fire: 1 };
  upgTaken = {};
}
function openCards() {
  const pool = CARDS.filter(c => (upgTaken[c.id] || 0) < c.max);
  if (!pool.length) { nextWaveIn = 3; return; }
  const want = 3 + (vipMode ? 1 : 0); // VIP：强化卡四选一
  const picks = [];
  while (picks.length < want && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  cardPicks = picks;
  cardOpen = true;
  const row = document.getElementById('cardsRow');
  row.innerHTML = '';
  picks.forEach((c, idx) => {
    const taken = upgTaken[c.id] || 0;
    const el = document.createElement('div');
    el.className = 'card';
    el.style.setProperty('--c', c.color);
    el.style.setProperty('--cg', hexA(c.color, 0.3));
    el.style.borderColor = hexA(c.color, 0.55);
    // 持有进度点
    let pips = '';
    for (let i = 0; i < c.max; i++) pips += '<i class="' + (i < taken ? 'on' : '') + '"></i>';
    el.innerHTML =
      '<div class="c-glow"></div>' +
      '<div class="c-k">' + (idx + 1) + '</div>' +
      '<div class="c-icon">' + c.icon + '</div>' +
      '<div class="c-t">' + t('card_' + c.id + '_n') + '</div>' +
      '<div class="c-d">' + t('card_' + c.id + '_d') + '</div>' +
      '<div class="c-pips">' + pips + '</div>';
    el.addEventListener('click', () => pickCard(c));
    row.appendChild(el);
    // 某些内嵌环境会节流 CSS 动画；600ms 后强制定格到最终状态，保证卡牌必现
    setTimeout(() => { el.style.animation = 'none'; }, 600);
  });
  document.getElementById('cards').classList.remove('hidden');
}
function pickCard(c) {
  if (!cardOpen) return;
  cardOpen = false;
  c.apply();
  upgTaken[c.id] = (upgTaken[c.id] || 0) + 1;
  document.getElementById('cards').classList.add('hidden');
  nextWaveIn = 3;
  S.pickup();
}
