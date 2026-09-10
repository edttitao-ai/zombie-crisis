'use strict';
// 武器与伤害：开火各枪种分支 / 投掷物 / 爆炸 / 特斯拉 / 玩家受击
/* ================= 射击与伤害 ================= */
function fallbackWeapon() { return vipMode ? 'mini' : 'rail'; }
// ↑ 默认（兜底）武器：普通用户是特斯拉电枪，VIP 是无限弹匣加特林。
//   它不占用手里的枪位，也永远不会被丢到地上，备弹打空后自动退回它。

// VIP 专属：默认加特林「弹匣无限」—— 不消耗弹匣、永不换弹，并附带伤害强化。
// 倍率可调：加特林基础群体 DPS 304 低于特斯拉的 357，不加成就等于 VIP 反而比普通用户更弱。
const VIP_GUN_MUL = 1.5;
function infMagOn() { return vipMode && player.weapon === fallbackWeapon(); }
function vipGunMul(key) { return (vipMode && key === fallbackWeapon()) ? VIP_GUN_MUL : 1; }
// 扣弹与换弹判定收口在这两个函数：无限弹匣时既不扣弹也不会触发换弹
function spendRound() { if (!infMagOn()) player.mag--; }
function needReload() { return !infMagOn() && player.mag === 0; }

// ---- 暴击 ----
// 离散命中（子弹 / 射线 / 爆炸）逐次掷骰；持续伤害（放电、灼烧）用期望值。
// 持续伤害每帧掷骰会让伤害剧烈抖动，而期望值与其长期平均完全一致。
const CRIT_MULT = 2.5;
function critMul() { return Math.random() < upg.crit ? CRIT_MULT : 1; }
function critAvg() { return 1 + upg.crit * (CRIT_MULT - 1); }

function startReload() {
  if (infMagOn()) return;                 // 无限弹匣：没有「换弹」这回事
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
  if (fromEmpty) player.reserve = Infinity; // 退回默认武器时备弹无限（两种模式的默认武器都一样）
  player.reloadT = 0;
  player.fireCd = Math.max(player.fireCd, 0.15);
  pops.push({ x: player.x, y: player.y - 26, txt: fromEmpty ? fmt(t('wEmpty'), t(wd.nameKey)) : t(wd.nameKey), t: 0, life: 1.1 });
  if (pops.length > CAP.pops) pops.shift();
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

// 火焰地带统一入队并限量：火焰喷射器每秒点燃二十来处，不设上限会拖垮逐帧绘制与判定。
// dmg 是每 tick 的灼烧伤害：燃烧瓶是主伤害，喷射器的点燃只是补伤。
function pushFire(x, y, r, life, dmg) {
  if (fireZones.length >= CAP.fires) fireZones.shift();
  fireZones.push({ x, y, r, t: 0, life, tick: 0, dmg });
}

// 火焰喷射器的命中点燃：一小片短命火焰，靠 tick 持续灼烧
function spawnBurn(x, y) { pushFire(x, y, 38, 1.6, 3.0); }

function spawnFire(x, y) {
  pushFire(x, y, 95, 5, 4.5);
  addStain(x, y, 42, PAL.scald);
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

// 丢弃当前武器（默认武器不可丢弃），扔出后变成可拾取的武器箱。
// 带上当前的弹匣与备弹：捡回来是同一把枪的剩余状态，不会凭空补满 ——
// 否则「扔下 → 走回去捡」就能无限刷子弹（这正是本次要修的 bug）。
// ownDrop：否则按下 X 后往前一步就立刻把自己刚扔的枪捡回来，丢枪形同虚设。
function dropWeapon() {
  const key = player.weapon;
  if (key === fallbackWeapon()) return;
  const a = player.ang;
  pickups.push({ x: player.x + Math.cos(a) * DROP_DIST, y: player.y + Math.sin(a) * DROP_DIST,
                 type: 'w' + key, t: rand(0, 6.28), life: 14,
                 mag: player.mag, reserve: player.reserve, ownDrop: true });
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
  // 第一遍只结算伤害与击退，绝不在遍历中移除元素：自爆者死亡会触发递归爆炸并缩短
  // zombies，旧的「边遍历边 killZombie」会让外层索引落到数组之外，异常冲出 update()
  // 后 requestAnimationFrame 不再续帧 —— 整个游戏永久冻结。
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
    }
  }
  sweepDead();   // 第二遍：统一结算死亡，自爆者在此引发连锁殉爆
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
  if (parts.length > CAP.parts) parts.splice(0, parts.length - CAP.parts);
  addStain(x, y, radius * 0.42, PAL.scald);
  shake = Math.max(shake, 13);
  S.boom();
}

function fireBullet() {
  const wd = WEAPONS[player.weapon];
  const tipX = player.x + Math.cos(player.ang) * (player.r + 14);
  const tipY = player.y + Math.sin(player.ang) * (player.r + 14);
  const cdMul = upg.rate * (rapidT > 0 ? 0.5 : 1);

  // 磁轨狙击枪：瞬发直线穿透，不走弹丸飞行
  if (wd.hitscan) { fireHitscan(wd); return; }

  // 特斯拉电枪：不发射弹丸，改为锁定闪电链
  if (wd.tesla) {
    if (!fireTesla(wd)) { player.fireCd = 0.12; return; } // 附近无目标：空扣扳机不耗弹
    spendRound();
    player.fireCd = wd.rate * cdMul;
    player.recoil = 4;
    muzzleT = 0.05;
    shake = Math.max(shake, wd.shake);
    S[wd.snd]();
    mouse.semiHeld = true;
    if (needReload()) startReload();
    return;
  }
  // 吞噬滚球：不做弹丸，滚出一颗会吃人的球（撞墙反弹、吞食成长、到时内爆）
  if (wd.roller) {
    rollers.push({
      x: tipX, y: tipY,
      vx: Math.cos(player.ang) * wd.speed, vy: Math.sin(player.ang) * wd.speed,
      r: wd.r0, maxR: wd.maxR,
      dmg: wd.dmg * upg.dmg * critMul(),
      growR: wd.growR, growDmg: wd.growDmg * upg.dmg,
      t: 0, life: wd.rollLife, spin: 0, ate: 0
    });
    spendRound();
    player.fireCd = wd.rate * cdMul;
    player.recoil = 13;
    shake = Math.max(shake, wd.shake);
    S[wd.snd]();
    mouse.semiHeld = true;
    if (needReload()) startReload();
    return;
  }
  const cm = critMul();
  // 同一个倍率同时作用于直击与爆炸：两者都是「这一枪」的伤害，
  // 只放大直击部分会让蜂群这类溅射武器的主伤害完全不吃火力强化与暴击
  const dmgMul = upg.dmg * cm * (rapidT > 0 ? 0.85 : 1) * vipGunMul(player.weapon);
  for (let i = 0; i < wd.pellets; i++) {
    const a = player.ang + rand(-wd.spread, wd.spread);
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(a) * wd.speed, vy: Math.sin(a) * wd.speed,
      life: wd.life || 1.2,
      dmg: wd.dmg * dmgMul,
      crit: cm > 1, knock: wd.knock || 0.6,
      type: wd.rocket ? 'rocket' : 'bullet', splash: wd.splash,
      splashDmg: wd.splashDmg ? wd.splashDmg * dmgMul : wd.splashDmg,
      pierce: !!wd.pierce,
      hitIds: (wd.pierce || wd.pierceN) ? [] : null,   // 穿透（无限或有限）都要记录已命中目标
      homing: wd.homing || 0,   // >0：每秒可转向的弧度（追踪导弹 / 蜂群）
      bounce: wd.bounce || 0,   // >0：撞到场地边缘会反弹（跳弹枪）
      bounceGrow: wd.bounceGrow || 1,  // 每反弹一次的伤害倍率
      bounces: 0,               // 已反弹次数
      pierceN: wd.pierceN || 0, // 还能再穿透几个目标（加特林）
      trail: wd.trail,          // false：不喷烟（蜂群 10 发齐射会淹没粒子池）
      burn: !!wd.burn,          // 命中点燃地面
      wc: WCOL[player.weapon]   // 曳光配色跟着武器走
    });
  }
  spendRound();
  player.fireCd = wd.rate * cdMul;
  player.recoil = 5 + wd.shake * 0.8;      // 后坐与震动分级挂钩，重武器推得更狠
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
    if (casings.length > CAP.casings) casings.shift();
  }
  S[wd.snd]();                             // 每把枪独立音色
  if (wd.auto === false) mouse.semiHeld = true;
  if (needReload()) startReload();
}

// 磁轨狙击枪：沿朝向瞬发一条穿透射线，命中线上所有僵尸（一枪一排）
function fireHitscan(wd) {
  const p = player;
  const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
  // 两段式：先无副作用地收集射线上的目标，再统一结算 —— 自爆者被击杀会引发
  // 连锁殉爆并缩短 zombies，边遍历边结算会漏判或重复计伤（与 explode 同一防御模式）
  const hits = [];
  for (const z of zombies) {
    const dx = z.x - p.x, dy = z.y - p.y;
    const along = dx * ca + dy * sa;
    if (along < 0 || along > wd.range) continue;
    if (Math.abs(-dx * sa + dy * ca) > z.r + 8) continue;   // 偏离射线超过半径
    hits.push(z);
  }
  const cm = critMul();   // 整条射线共用一次判定，与子弹「一次扳机一份暴击」一致
  for (const z of hits) {
    z.hp -= wd.dmg * upg.dmg * cm * (rapidT > 0 ? 0.85 : 1);
    z.flash = 0.12;
    z.x += ca * 14; z.y += sa * 14;                          // 强击退
    sparks(z.x, z.y, p.ang, 8, true);
  }
  sweepDead();   // 统一结算死亡（含连锁殉爆）
  beams.push({ x1: p.x + ca * (p.r + 10), y1: p.y + sa * (p.r + 10),
               x2: p.x + ca * wd.range, y2: p.y + sa * wd.range, t: 0, life: 0.22 });
  flashes.push({ x: p.x + ca * (p.r + 34), y: p.y + sa * (p.r + 34), r: 44, t: 0, life: 0.15 });
  spendRound();
  p.fireCd = wd.rate * upg.rate * (rapidT > 0 ? 0.5 : 1);
  p.recoil = 15;
  muzzleT = 0.05;
  shake = Math.max(shake, wd.shake);
  S[wd.snd]();
  mouse.semiHeld = true;
  if (needReload()) startReload();
}

// 特斯拉闪电链：锁定准星附近的僵尸，逐跳连向邻近僵尸
function fireTesla(wd) {
  let first = null, best = wd.lock || 90;   // 锁定窗口按武器配置（原来硬编码 90px，混战里常空放）
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
  const maxHops = wd.maxHops + 2;    // 特斯拉强化：多连 2 跳（原 VIP 特权，现已对普通用户开放）
  const hopDist = wd.hopDist + 60;   // 跳跃距离更远
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
  teslaChains.push({ nodes, t: 0, life: wd.teslaLife, dps: wd.dps * 1.3 }); // 放电 +30%（原 VIP 特权，现已通用）
  return true;
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
      pops.push({ x: player.x, y: player.y - 32, txt: t('reviveMsg'), t: 0, life: 1.8 });
      S.clear();
      return;
    }
    player.hp = 0; gameOver();
  }
}

// VIP 空投：必出好货（武器箱 / 医疗 / 弹药 / 投掷物）
function airdrop(x, y) {
  const r = Math.random();
  let type;
  if (r < 0.35) type = 'med';
  else if (r < 0.55) type = 'ammo';
  else if (r < 0.65) type = 'nade';
  else if (r < 0.75) type = 'mol';
  else type = pickWeaponDrop();   // VIP 空投也能出任意武器
  pickups.push({ x, y, type, t: rand(0, 6.28), life: type[0] === 'w' ? 14 : 12 });
}
