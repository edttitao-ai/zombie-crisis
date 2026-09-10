'use strict';
// 宠物：AI / 升级 / 绘制（数据表在 data.js 的 PETS）
//
// 五种行为各自独立：
//   hound  近战冲锋   —— 冲到最近的僵尸身上撕咬（进化后附带撕咬冲击）
//   drone  远程点射   —— 跟在身边悬浮，朝最近目标点射（进化后多一发）
//   aura   治疗光环   —— 不主动攻击：持续治疗玩家 + 拖慢范围内的僵尸
//   bolt   连锁闪电   —— VIP：一次电到一串（进化 +2 跳）
//   blade  追击刀轮   —— VIP：僵尸进射程就脱手飞出去追踪（进化 +1 片）
// 成长全部由「等级」推导，不另存数值，避免升级后状态漂移。
/* ================= 宠物 ================= */
function petCap() { return vipMode ? PET_LV_VIP : PET_LV_NORMAL; }
function petGrow() { return vipMode ? PET_GROW_VIP : PET_GROW; }
function petNeed(lv) { return PET_XP_BASE + lv * PET_XP_STEP; }   // 升到下一级所需击杀

function createPet(id) {
  const d = petDef(id);
  return {
    kind: d.id, lv: 1, xp: 0, evo: 0, col: d.col,
    x: player.x + 46, y: player.y - 34,
    ang: 0, cd: 0, spin: rand(0, 6.28), bob: rand(0, 6.28),
    target: null, lunge: 0, flash: 0
  };
}

// 击杀给经验：大体型与 Boss 给得多，免得升级节奏被小兵数量绑死
function gainPetXp(z) {
  if (!pet || pet.lv >= petCap()) return;
  pet.xp += z && z.boss ? 8 : (z && (z.type === 'brute' || z.type === 'shielder') ? 3 : 1);
  let leveled = false;
  while (pet.lv < petCap() && pet.xp >= petNeed(pet.lv)) { pet.xp -= petNeed(pet.lv); pet.lv++; leveled = true; }
  if (!leveled) return;
  const d = petDef(pet.kind);
  if (vipMode && pet.lv % PET_EVOLVE_EVERY === 0) {
    // VIP 专属：进化 —— 外形改变 + 机制增强，给足正反馈
    pet.evo++;
    pops.push({ x: pet.x, y: pet.y - 30, txt: t('petEvolve') + ' Lv.' + pet.lv, t: 0, life: 1.8 });
    rings.push({ x: pet.x, y: pet.y, t: 0, life: 0.6, col: hexA(d.col, 0.9) });
    shake = Math.max(shake, 7);
    S.clear();
  } else {
    pops.push({ x: pet.x, y: pet.y - 26, txt: t('petLevelUp') + ' Lv.' + pet.lv, t: 0, life: 1.2 });
    rings.push({ x: pet.x, y: pet.y, t: 0, life: 0.32, col: hexA(d.col, 0.7) });
    S.pickup();
  }
}

// 当前等级下的有效数值
function petStats() {
  const d = petDef(pet.kind), G = petGrow(), k = pet.lv - 1;
  return {
    dmg: d.base.dmg * Math.pow(1 + G.dmg, k),
    rad: d.base.r + G.rad * k + pet.evo * 1.6,
    cd: d.base.cd * Math.pow(G.cd, k),
    range: (d.base.range || 300) + pet.evo * 16,
    evo: pet.evo
  };
}

// 跟随：绕到玩家斜后方悬浮（keep 是与玩家的期望距离）
function petFollow(d, dt) {
  const p = player, keep = d.base.keep || 46;
  const a = p.ang + Math.PI * 0.78 + Math.sin(pet.bob) * 0.4;
  const tx = p.x + Math.cos(a) * keep, ty = p.y + Math.sin(a) * keep;
  const dx = tx - pet.x, dy = ty - pet.y, dd = Math.hypot(dx, dy);
  if (dd > 1.5) {
    const step = Math.min(360, dd * 7) * dt;
    pet.x += dx / dd * step; pet.y += dy / dd * step;
  }
  pet.ang = p.ang;
}

function petNearest(maxD, fromX, fromY) {
  const ox = fromX === undefined ? pet.x : fromX, oy = fromY === undefined ? pet.y : fromY;
  let best = null, bd = maxD;
  for (const z of zombies) {
    const dd = Math.hypot(z.x - ox, z.y - oy);
    if (dd < bd) { bd = dd; best = z; }
  }
  return best;
}

function updatePet(dt) {
  if (!pet) return;
  const d = petDef(pet.kind), st = petStats();
  pet.cd = Math.max(0, pet.cd - dt);
  pet.flash = Math.max(0, pet.flash - dt);
  pet.spin += dt * (d.id === 'blade' ? d.base.spin : 2.6);
  pet.bob += dt * 3.2;
  pet.lunge = Math.max(0, pet.lunge - dt);

  if (d.id === 'hound') petHound(d, st, dt);
  else if (d.id === 'drone') petDrone(d, st, dt);
  else if (d.id === 'aura') petAura(d, st, dt);
  else if (d.id === 'bolt') petBolt(d, st, dt);
  else if (d.id === 'blade') petBlade(d, st, dt);

  pet.x = clamp(pet.x, 12, W - 12);
  pet.y = clamp(pet.y, 12, H - 12);
}

// ---- 近战猎犬 ----
function petHound(d, st, dt) {
  const z = petNearest(d.base.range);
  if (!z) { pet.target = null; petFollow(d, dt); return; }
  pet.target = z;
  const a = Math.atan2(z.y - pet.y, z.x - pet.x);
  pet.ang = a;
  const sp = d.base.speed * (1 + (pet.lv - 1) * 0.014);
  pet.x += Math.cos(a) * sp * dt;
  pet.y += Math.sin(a) * sp * dt;
  const dist = Math.hypot(z.x - pet.x, z.y - pet.y);
  if (dist < st.rad + z.r + 3 && pet.cd <= 0) {
    pet.cd = st.cd;
    pet.lunge = 0.2;
    pet.flash = 0.14;                 // 起手白光：每次攻击都要一眼看出"它刚动了"
    let dIn = st.dmg;
    if (z.type === 'shielder') dIn *= 0.6;
    z.hp -= dIn; z.flash = 0.12;
    z.x += Math.cos(a) * d.base.knock * 3; z.y += Math.sin(a) * d.base.knock * 3;
    blood(z.x, z.y, a, 8, '#ff6a4a');
    sparks(z.x, z.y, a, 8, true);
    // 咬击的"獠牙弧"：贴在僵尸身上闪一下，明确是谁咬的
    rings.push({ x: z.x, y: z.y, t: 0, life: 0.18, col: hexA(d.col, 0.95) });
    S.bite();
    // 进化后：咬中时炸开一圈小冲击，从单体变成能清小群
    if (st.evo > 0) explode(pet.x, pet.y, st.dmg * 0.45, st.rad * 3.2);
    else sweepDead();
  }
}

// ---- 远程浮游炮 ----
function petDrone(d, st, dt) {
  petFollow(d, dt);
  const z = petNearest(st.range);
  pet.target = z;
  if (!z || pet.cd > 0) return;
  pet.cd = st.cd;
  pet.flash = 0.1;                    // 开火闪光：没有它，僵尸就是"莫名其妙死了"
  const n = 1 + st.evo;                    // 每进化一次多一发
  const base = Math.atan2(z.y - pet.y, z.x - pet.x);
  // 枪口爆闪 + 朝反方向轻微后坐
  const mx = pet.x + Math.cos(base) * st.rad, my = pet.y + Math.sin(base) * st.rad;
  flashes.push({ x: mx, y: my, r: 18, t: 0, life: 0.11 });
  sparks(mx, my, base, 3, false);
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.13;
    bullets.push({
      x: pet.x, y: pet.y,
      vx: Math.cos(a) * d.base.bspeed, vy: Math.sin(a) * d.base.bspeed,
      life: 1.15, dmg: st.dmg, crit: false, knock: d.base.knock,
      type: 'bullet', splash: 0, splashDmg: 0, pierce: false, hitIds: null,
      homing: 0, bounce: 0, bounceGrow: 1, bounces: 0, pierceN: 0,
      trail: false, burn: false, wc: d.col, petShot: true
    });
  }
  S.petShot();
}

// ---- 治疗光环 ----
function petAura(d, st, dt) {
  petFollow(d, dt);
  // 治疗随等级成长；VIP 额外乘 1.25
  const heal = d.base.heal * (1 + 0.16 * (pet.lv - 1)) * (vipMode ? 1.25 : 1);
  if (player.hp > 0 && player.hp < player.maxHp && state === 'playing') {
    player.hp = Math.min(player.maxHp, player.hp + heal * dt);
    // 治疗脉冲：不画出来，玩家只会觉得"血自己涨了"
    pet.healT = (pet.healT || 0) - dt;
    if (pet.healT <= 0) {
      pet.healT = 1.1;
      rings.push({ x: player.x, y: player.y, t: 0, life: 0.5, col: hexA(d.col, 0.7) });
      pet.flash = 0.16;
      S.heal();
    }
  }
  // 减速：范围内的僵尸被打上 slowT，由僵尸循环递减后作用于移速。
  // 同时给它们挂一个可见的"寒气环"—— 否则僵尸只是变慢，看不出是宠物在起作用。
  const R = st.range;
  for (const z of zombies) {
    if ((z.x - pet.x) ** 2 + (z.y - pet.y) ** 2 < (R + z.r) ** 2) {
      if (!(z.slowT > 0)) S.freeze();   // 刚进入光环：给一次音效提示
      z.slowT = 0.35;
    }
  }
}

// ---- 连锁闪电 ----
function petBolt(d, st, dt) {
  petFollow(d, dt);
  const first = petNearest(st.range);
  pet.target = first;
  if (!first || pet.cd > 0) return;
  pet.cd = st.cd;
  pet.flash = 0.16;
  const nodes = [first], used = [first];
  let cur = first;
  const hops = d.base.hops + st.evo * 2;   // 每进化 +2 跳
  for (let i = 0; i < hops; i++) {
    let nxt = null, nd = d.base.hopDist;
    for (const z of zombies) {
      if (used.indexOf(z) >= 0) continue;
      const dd = Math.hypot(z.x - cur.x, z.y - cur.y);
      if (dd < nd) { nd = dd; nxt = z; }
    }
    if (!nxt) break;
    nodes.push(nxt); used.push(nxt); cur = nxt;
  }
  // 位置快照：结算后节点可能被 sweepDead 移出 zombies，画的时候不能再引用它们
  const pts = nodes.map(z => ({ x: z.x, y: z.y }));
  for (const z of nodes) {
    let dIn = st.dmg;
    if (z.type === 'shielder') dIn *= 0.6;
    z.hp -= dIn; z.flash = 0.12;
    sparks(z.x, z.y, 0, 6, true);
    flashes.push({ x: z.x, y: z.y, r: 26, t: 0, life: 0.14 });
  }
  sweepDead();
  petArcs.push({ pts, t: 0, life: 0.5, col: d.col });
  S.zap();
}

// ---- 追击刀轮 ----
// 旧版只是「绕着你转、要贴脸才刮得到」，轨道半径 64px，僵尸走到脸上才有输出 ——
// 等于一个没有主动攻击的自保光环。现在改成脱手飞刃：
//   轨道待机 → 僵尸进 range 就锁定「最近的那只」飞出去（有限转向速度，看得出在追）→
//   命中结算伤害并立刻回收 → 飞回自己的轨道槽位等下一轮。
// 每片刀有独立的冷却与飞行状态，所以「进化 +1 片刀」= 同时能飞出去更多把。
function petBlade(d, st, dt) {
  const p = player;
  const R = d.base.orbitR + (pet.lv - 1) * 1.3 + pet.evo * 5;
  const n = d.base.blades + st.evo;        // 每进化 +1 片刀
  if (!pet.blades || pet.blades.length !== n) {
    pet.blades = [];
    for (let i = 0; i < n; i++) {
      // 出生点先摆在各自槽位上，避免开局第一帧从玩家身上飞出来
      const a = pet.spin + i / n * Math.PI * 2;
      pet.blades.push({ mode: 'orbit', x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R,
                        ang: a, cd: rand(0, 0.35), life: 0, target: null });
    }
  }
  for (let i = 0; i < n; i++) {
    const b = pet.blades[i];
    const slot = pet.spin + i / n * Math.PI * 2;
    const hx = p.x + Math.cos(slot) * R, hy = p.y + Math.sin(slot) * R;
    b.cd = Math.max(0, b.cd - dt);

    if (b.mode === 'orbit') {
      // 回位用插值而不是瞬移：接刀那一下看起来才不像穿帮
      const k = Math.min(1, dt * 14);
      b.x += (hx - b.x) * k; b.y += (hy - b.y) * k;
      b.ang = slot + Math.PI * 0.5;
      // 出手只由冷却决定。**不要**再要求「先回到槽位」—— 槽位随 spin 一直转
      // （约 143px/s），插值永远落后 ~16px，那种门闸会变成"一辈子只出一次手"。
      if (b.cd <= 0) {
        const z = petNearest(d.base.range);
        if (z) {                              // 没有目标就一直挂在轨道上
          b.mode = 'out'; b.target = z; b.life = 0;
          b.ang = Math.atan2(z.y - b.y, z.x - b.x);
          b.cd = st.cd;
          pet.flash = 0.12;                   // 起手白光：出手必须看得见
          S.dash();
        }
      }
    } else if (b.mode === 'out') {
      b.life += dt;
      // 目标死了/丢了就改追「离刀最近的那只」，所以这是一路追踪而不是锁定直线
      let z = b.target;
      if (!z || z.hp <= 0 || zombies.indexOf(z) < 0) z = petNearest(d.base.range, b.x, b.y);
      b.target = z;
      const want = z ? Math.atan2(z.y - b.y, z.x - b.x) : Math.atan2(p.y - b.y, p.x - b.x);
      let da = ((want - b.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      b.ang += clamp(da, -7 * dt, 7 * dt);     // 限转向速度：转弯看得见，不是瞬间锁死
      b.x += Math.cos(b.ang) * d.base.speed * dt;
      b.y += Math.sin(b.ang) * d.base.speed * dt;
      // 飞行拖尾：让「它真的飞出去了」一眼可见
      if (parts.length < CAP.parts - 3) {
        parts.push({ x: b.x, y: b.y, vx: -Math.cos(b.ang) * 60, vy: -Math.sin(b.ang) * 60,
                     life: 0.2, maxLife: 0.2, size: st.rad * 0.42, col: hexA(d.col, 0.55) });
      }
      // 命中即回收：一刀只结算一次，不做穿透（否则一把刀能刮穿一整排）
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (!z) continue;                      // killZombie 可能缩短数组（同主循环的防御）
        if ((z.x - b.x) ** 2 + (z.y - b.y) ** 2 > (st.rad + z.r) ** 2) continue;
        let dIn = st.dmg;
        if (z.type === 'shielder') dIn *= 0.6;
        z.hp -= dIn; z.flash = 0.12;
        blood(z.x, z.y, b.ang, 5, '#ffd98a');
        sparks(z.x, z.y, b.ang, 8, true);
        pet.flash = 0.12;
        S.hit();
        if (z.hp <= 0) killZombie(j);
        b.mode = 'back';
        break;
      }
      // 追太久或飞太远也要回来，否则刀会一直挂在天上
      if (b.mode === 'out' &&
          (b.life > 1.6 || Math.hypot(b.x - p.x, b.y - p.y) > d.base.range * 1.15)) b.mode = 'back';
    } else {                                   // back：直线飞回玩家，进轨道圈就算归位
      b.ang = Math.atan2(p.y - b.y, p.x - b.x);
      const sp = d.base.speed * 1.25;
      b.x += Math.cos(b.ang) * sp * dt;
      b.y += Math.sin(b.ang) * sp * dt;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= R) b.mode = 'orbit';
    }
  }
  // 宠物本体（Lv 标签 / HUD 定位用）停在轨道上，不跟着飞出去的那把刀跑
  pet.x = p.x + Math.cos(pet.spin) * R;
  pet.y = p.y + Math.sin(pet.spin) * R;
  pet.ang = pet.spin + Math.PI * 0.5;
}

/* ================= 绘制 ================= */
function drawPet(now) {
  if (!pet) return;
  const d = petDef(pet.kind), st = petStats();
  const p = player;

  // 接触阴影：跟其它实体保持同一种"贴地"表达
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(pet.x, pet.y + st.rad * 0.75, st.rad * 0.95, st.rad * 0.36, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  // 光环类：先把作用范围画出来（这是它唯一的"攻击"表达）
  if (d.id === 'aura') {
    const R = st.range;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.10 + 0.05 * Math.sin(now * 2.2);
    const csz = R * 2;
    ctx.drawImage(SPR.glowSoft, pet.x - R, pet.y - R, csz, csz);
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(pet.x, pet.y, R, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // 追击刀轮：轨道环 + 每片刀画在它自己的实时位置上（飞出去的那几把就不在轨道上）
  if (d.id === 'blade') {
    const R = d.base.orbitR + (pet.lv - 1) * 1.3 + pet.evo * 5;
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    for (const b of (pet.blades || [])) {
      drawBlade(b.x, b.y, st.rad, b.mode === 'orbit' ? b.ang : b.ang + pet.spin * 1.4,
                d.col, st.evo);
    }
    drawPetLabel(st);
    return;
  }

  const bob = Math.sin(pet.bob) * 1.6;
  ctx.save();
  ctx.translate(pet.x, pet.y + bob);
  ctx.rotate(d.id === 'hound' ? pet.ang : 0);
  const stretch = 1 + pet.lunge * 1.2;

  if (d.id === 'hound') {
    // 身体 + 头 + 耳 + 尾；撕咬瞬间纵向拉长
    ctx.fillStyle = '#3a2b1c';
    ctx.beginPath(); ctx.ellipse(0, 0, st.rad * 1.25 * stretch, st.rad * 0.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.ellipse(-st.rad * 0.15, 0, st.rad * 1.1 * stretch, st.rad * 0.66, 0, 0, 7); ctx.fill();
    const hx = st.rad * (1.0 * stretch + 0.25);
    ctx.beginPath(); ctx.arc(hx, 0, st.rad * 0.56, 0, 7); ctx.fill();
    ctx.beginPath();                                   // 口鼻
    ctx.moveTo(hx + st.rad * 0.3, -st.rad * 0.3);
    ctx.lineTo(hx + st.rad * 1.15, 0);
    ctx.lineTo(hx + st.rad * 0.3, st.rad * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();                                   // 双耳
    ctx.moveTo(hx - st.rad * 0.2, -st.rad * 0.5); ctx.lineTo(hx - st.rad * 0.55, -st.rad * 1.15);
    ctx.lineTo(hx + st.rad * 0.15, -st.rad * 0.62); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = d.col; ctx.lineWidth = st.rad * 0.22; ctx.lineCap = 'round';
    ctx.beginPath();                                   // 尾
    ctx.moveTo(-st.rad * 1.1, 0);
    ctx.quadraticCurveTo(-st.rad * 1.7, -st.rad * 0.5, -st.rad * 1.9, -st.rad * 1.0);
    ctx.stroke();
    ctx.fillStyle = '#1b1208';
    ctx.beginPath(); ctx.arc(hx + st.rad * 0.18, -st.rad * 0.12, st.rad * 0.12, 0, 7); ctx.fill();
  } else if (d.id === 'drone') {
    // 机身 + 四个旋翼（旋翼随 spin 转，画成两道短划线）
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-st.rad * 0.9, -st.rad * 0.9, st.rad * 1.8, st.rad * 1.8);
    ctx.fillStyle = d.col;
    ctx.fillRect(-st.rad * 0.72, -st.rad * 0.72, st.rad * 1.44, st.rad * 1.44);
    ctx.fillStyle = '#0f1a20';
    ctx.beginPath(); ctx.arc(0, 0, st.rad * 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(143,216,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const rotor = pet.spin * 6;
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rx = ox * st.rad * 1.25, ry = oy * st.rad * 1.25;
      ctx.beginPath();
      ctx.moveTo(rx + Math.cos(rotor) * st.rad * 0.62, ry + Math.sin(rotor) * st.rad * 0.62);
      ctx.lineTo(rx - Math.cos(rotor) * st.rad * 0.62, ry - Math.sin(rotor) * st.rad * 0.62);
      ctx.stroke();
    }
    if (pet.cd > 0) {                                  // 开火冷却：枪口亮一下
      ctx.fillStyle = '#eaffff';
      const mx = Math.cos(pet.ang) * st.rad * 0.9, my = Math.sin(pet.ang) * st.rad * 0.9;
      ctx.beginPath(); ctx.arc(mx, my, st.rad * 0.2, 0, 7); ctx.fill();
    }
  } else if (d.id === 'bolt') {
    // 雷灵：核心 + 随机折线电弧，进化后电弧更多
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(SPR.glowCyan, -st.rad * 2, -st.rad * 2, st.rad * 4, st.rad * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1b1030';
    ctx.beginPath(); ctx.arc(0, 0, st.rad, 0, 7); ctx.fill();
    ctx.strokeStyle = d.col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, st.rad, 0, 7); ctx.stroke();
    ctx.fillStyle = '#f0e6ff';
    ctx.beginPath(); ctx.arc(0, 0, st.rad * 0.42, 0, 7); ctx.fill();
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.4;
    for (let i = 0; i < 2 + st.evo; i++) {
      const a = pet.spin * 1.7 + i / (2 + st.evo) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * st.rad, Math.sin(a) * st.rad);
      ctx.lineTo(Math.cos(a + 0.5) * st.rad * 1.5, Math.sin(a + 0.5) * st.rad * 1.5);
      ctx.lineTo(Math.cos(a + 0.9) * st.rad * 1.15, Math.sin(a + 0.9) * st.rad * 1.15);
      ctx.stroke();
    }
  } else if (d.id === 'aura') {
    ctx.drawImage(SPR.glowWarm, -st.rad * 2.2, -st.rad * 2.2, st.rad * 4.4, st.rad * 4.4);
    ctx.fillStyle = '#1a2a1e';
    ctx.beginPath(); ctx.arc(0, 0, st.rad, 0, 7); ctx.fill();
    ctx.fillStyle = d.col;
    ctx.beginPath(); ctx.arc(0, 0, st.rad * 0.62 + Math.sin(now * 4) * 0.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2fff4';
    ctx.beginPath(); ctx.arc(-st.rad * 0.18, -st.rad * 0.18, st.rad * 0.22, 0, 7); ctx.fill();
  }
  ctx.restore();

  // 进化光环：VIP 每 5 级进化一次，用一圈常驻旋转光点表示"这只已经不一样了"
  if (st.evo > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.6;
    for (let i = 0; i < st.evo; i++) {
      const a0 = pet.spin * 1.2 + i / st.evo * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(pet.x, pet.y, st.rad * (1.5 + i * 0.22), a0, a0 + 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 出手白光：每次攻击都在宠物身上闪一下，这是"它刚刚动了"最直接的信号
  if (pet.flash > 0) {
    const k = pet.flash / 0.16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, k);
    ctx.drawImage(SPR.glowSoft, pet.x - st.rad * 2.2, pet.y - st.rad * 2.2, st.rad * 4.4, st.rad * 4.4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(pet.x, pet.y, st.rad * 0.9, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPetLabel(st);
}

// 头顶等级：宠物是长期陪伴物，等级必须随时看得见
function drawPetLabel(st) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText('Lv.' + pet.lv, pet.x + 1, pet.y - st.rad - 6 + 1);
  ctx.fillStyle = pet.col;
  ctx.fillText('Lv.' + pet.lv, pet.x, pet.y - st.rad - 6);
  ctx.textAlign = 'left';
}

// 环绕刀轮的单片刀
function drawBlade(x, y, rad, rot, col, evo) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(SPR.glowWarm, -rad * 1.8, -rad * 1.8, rad * 3.6, rad * 3.6);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(rot);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.42, 0, 7); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * rad * 0.4, Math.sin(a) * rad * 0.4);
    ctx.lineTo(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 1.15);
    ctx.lineTo(Math.cos(a + 0.62) * rad * 0.42, Math.sin(a + 0.62) * rad * 0.42);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#3a2a06';
  ctx.beginPath(); ctx.arc(0, 0, rad * 0.2, 0, 7); ctx.fill();
  if (evo > 0) {
    ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, rad * 1.28, 0, 7); ctx.stroke();
  }
  ctx.restore();
}

// HUD 用的小图标：和世界里那套造型同源，画在任意 2D 上下文上
function drawPetIcon(c2, x, y, r, d, col) {
  c2.save();
  c2.translate(x, y);
  c2.fillStyle = col;
  if (d.id === 'hound') {
    c2.beginPath(); c2.arc(0, 0, r * 0.72, 0, 7); c2.fill();
    c2.beginPath(); c2.moveTo(-r * 0.5, -r * 0.5); c2.lineTo(-r * 0.9, -r * 1.2); c2.lineTo(-r * 0.08, -r * 0.72); c2.closePath(); c2.fill();
    c2.beginPath(); c2.moveTo(r * 0.08, -r * 0.72); c2.lineTo(r * 0.9, -r * 1.2); c2.lineTo(r * 0.5, -r * 0.5); c2.closePath(); c2.fill();
  } else if (d.id === 'drone') {
    c2.fillRect(-r * 0.5, -r * 0.5, r, r);
    for (const p2 of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c2.beginPath(); c2.arc(p2[0] * r * 0.8, p2[1] * r * 0.8, r * 0.3, 0, 7); c2.fill();
    }
  } else if (d.id === 'aura') {
    c2.beginPath(); c2.arc(0, 0, r * 0.5, 0, 7); c2.fill();
    c2.strokeStyle = col; c2.lineWidth = Math.max(1, r * 0.2); c2.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      c2.beginPath();
      c2.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
      c2.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      c2.stroke();
    }
  } else if (d.id === 'bolt') {
    c2.beginPath();
    c2.moveTo(r * 0.25, -r); c2.lineTo(-r * 0.55, r * 0.15); c2.lineTo(-r * 0.02, r * 0.15);
    c2.lineTo(-r * 0.25, r); c2.lineTo(r * 0.55, -r * 0.15); c2.lineTo(r * 0.02, -r * 0.15);
    c2.closePath(); c2.fill();
  } else if (d.id === 'blade') {
    c2.beginPath(); c2.arc(0, 0, r * 0.45, 0, 7); c2.fill();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      c2.beginPath();
      c2.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
      c2.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0);
      c2.lineTo(Math.cos(a + 0.6) * r * 0.45, Math.sin(a + 0.6) * r * 0.45);
      c2.closePath(); c2.fill();
    }
  }
  c2.restore();
}

// 连锁闪电的电弧（位置是施放瞬间的快照，不受目标死亡影响）
function drawPetArcs() {
  for (const arc of petArcs) {
    const k = 1 - arc.t / arc.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * 0.8;
    ctx.strokeStyle = arc.col;
    ctx.lineWidth = 1.6 + 2.6 * k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < arc.pts.length; i++) {
      const pt = arc.pts[i];
      const jx = i === 0 ? 0 : rand(-5, 5), jy = i === 0 ? 0 : rand(-5, 5);
      if (i === 0) ctx.moveTo(pet.x, pet.y);
      else ctx.lineTo(pt.x + jx, pt.y + jy);
    }
    ctx.stroke();
    ctx.globalAlpha = k;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.9 + 1.2 * k;
    ctx.beginPath();
    for (let i = 0; i < arc.pts.length; i++) {
      const pt = arc.pts[i];
      const jx = i === 0 ? 0 : rand(-5, 5), jy = i === 0 ? 0 : rand(-5, 5);
      if (i === 0) ctx.moveTo(pet.x, pet.y);
      else ctx.lineTo(pt.x + jx, pt.y + jy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
