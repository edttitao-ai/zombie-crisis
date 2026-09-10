'use strict';
// 实体：生成 / 击杀与连锁收尾 / 掉落 / 僵尸分离（空间哈希）
/* ================= 僵尸 ================= */
// 在指定位置生成一只僵尸。Boss 也走这条路（行为差异在 update 里按 z.boss 分支）。
function spawnAt(type, x, y) {
  const d = ZDEF[type];
  const hp = zombieHp(d, wave);
  zombies.push({
    x, y, type, r: d.r, hp, maxHp: hp,
    speed: Math.min(d.spdCap, (d.spd + wave * d.spdW) * rand(0.9, 1.1)),
    dmg: zombieDmg(d, wave), col: d.col, sc: d.sc, boss: d.boss || null,
    flash: 0, atkCd: rand(0.2, 0.6), wob: rand(0, 6.28), anim: rand(0, WALK_FRAMES),
    spitCd: rand(1, 2), screamCd: rand(2, 4), screamT: 0, buffT: 0, fuseT: -1, boomed: false
  });
}

function spawnZombie() {
  if (zombies.length >= CAP.zombies) return;
  const side = Math.floor(Math.random() * 4), m = 40;
  let x, y;
  if (side === 0)      { x = Math.random() * W; y = -m; }
  else if (side === 1) { x = W + m; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = H + m; }
  else                 { x = -m; y = Math.random() * H; }
  spawnAt(pickZombieType(), x, y);
}

function blood(x, y, ang, n, col) {
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-1.2, 1.2), sp = rand(40, 240);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                 life: rand(0.25, 0.6), maxLife: 0.6, size: rand(1.5, 3.5),
                 col: col || (Math.random() < 0.7 ? PAL.blood : PAL.bloodDark) });
  }
  if (parts.length > CAP.parts) parts.splice(0, parts.length - CAP.parts);
}

// 命中火花：短促高亮粒子，既给打击感，也是画面高光的主要来源之一
function sparks(x, y, ang, n, bright) {
  for (let i = 0; i < n; i++) {
    const a = ang + Math.PI + rand(-1.15, 1.15), sp = rand(150, 440);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                 life: rand(0.07, 0.19), maxLife: 0.19, size: rand(1, 2.5),
                 col: bright ? '#ffffff' : (Math.random() < 0.55 ? '#fff6d8' : '#ffcb52') });
  }
  if (parts.length > CAP.parts) parts.splice(0, parts.length - CAP.parts);
}

function killZombie(i) {
  if (i < 0 || i >= zombies.length) return; // 防御：索引失效（爆炸/放电连锁击杀后索引可能偏移）
  const z = zombies[i];
  // 连杀累积 + 重目标顿帧。顿帧只给大体型：每个杂兵都顿会把手感拖成卡顿。
  combo++; comboT = 2.5;
  if (z.type === 'brute') hitStopT = Math.max(hitStopT, 0.075);
  else if (z.type === 'bloater') hitStopT = Math.max(hitStopT, 0.05);
  if (z.type === 'bloater' && !z.boomed) {
    // 自爆者：死亡引爆，波及玩家与其他僵尸（可连环殉爆）
    z.boomed = true;
    zombies.splice(i, 1);
    kills++; addScore(z.sc);
    gainPetXp(z);                              // 宠物靠击杀累积经验
    explode(z.x, z.y, 55, 115, 26);
    for (let g = 0; g < 14; g++) {
      const a = rand(0, 6.28), sp = rand(80, 300);
      parts.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                   life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4), col: '#9ab04a' });
    }
    S.die(1 + Math.min(combo, 14) * 0.045);   // 连杀越高，死亡音调越高
    return;
  }
  zombies.splice(i, 1);
  kills++; addScore(z.sc);
  gainPetXp(z);                                // 宠物靠击杀累积经验
  blood(z.x, z.y, rand(0, 6.28), z.type === 'brute' ? 24 : 13);
  corpses.push({ x: z.x, y: z.y, r: z.r, col: z.col, ang: rand(0, 6.28), t: 0, life: 5 });
  if (corpses.length > CAP.corpses) corpses.shift();
  addStain(z.x, z.y, z.r + rand(4, 10));
  for (let k = 0; k < 3; k++) {
    addStain(z.x + rand(-z.r - 6, z.r + 6), z.y + rand(-z.r - 6, z.r + 6), rand(2.5, z.r * 0.45));
  }
  pops.push({ x: z.x, y: z.y - z.r - 4, txt: '+' + z.sc, t: 0, life: 0.9 });
  if (pops.length > CAP.pops) pops.shift();
  if (z.type === 'brute') { shake = Math.max(shake, 6); if (Math.random() < 0.6) dropPickup(z.x, z.y); }
  else if (Math.random() < 0.17) dropPickup(z.x, z.y);
  if (z.boss) {
    // Boss 阵亡：大爆炸 + 掉落雨 + 重顿帧 —— 打死它的那一刻要有回报
    explode(z.x, z.y, 70, 190);
    for (let k = 0; k < 5; k++) dropPickup(z.x + rand(-58, 58), z.y + rand(-58, 58));
    shake = Math.max(shake, 24);
    hitStopT = Math.max(hitStopT, 0.14);
    waveMsg = t('bossDown'); waveMsgT = 2.2;
    S.clear();
  }
  S.die(1 + Math.min(combo, 14) * 0.045);   // 连杀越高，死亡音调越高
}

// 统一收尾：移除所有 hp<=0 但尚未结算的目标。
// 连锁爆炸/放电会在遍历中挪动索引，各处的内联结算无法覆盖全部情况（曾出现
// 爆炸后残留 hp<=0 的僵尸、以及遍历读到 undefined 冻结主循环）。每帧收尾一次根除这类残留。
// 重入安全：每次从尾部重新扫描；killZombie 触发的递归 sweep 会先清空它自己那一批。
function sweepDead() {
  for (let guard = 0; guard < 4096; guard++) {
    let dead = -1;
    for (let j = zombies.length - 1; j >= 0; j--) {
      if (zombies[j].hp <= 0) { dead = j; break; }
    }
    if (dead < 0) return;
    killZombie(dead);
  }
}

function dropPickup(x, y) {
  const r = Math.random();
  let type;
  if (r < 0.28) type = 'med';
  else if (r < 0.46) type = 'ammo';
  else if (r < 0.60) type = 'nade';
  else if (r < 0.66) type = 'mol';
  else type = pickWeaponDrop();   // 34% 掉落武器，让玩家更容易尝到新枪
  pickups.push({ x, y, type, t: rand(0, 6.28), life: type[0] === 'w' ? 14 : 12 });
}

/* ================= 僵尸分离（空间哈希） ================= */
// 原来是全量两两比较（130 只 = 8385 对/帧）。改成按格分桶后只与邻近格比较。
// 网格边长必须 >= 最大僵尸直径，否则相邻格覆盖不到全部可能重叠的对。
const SEP_CELL = Math.max(...Object.values(ZDEF).map(d => d.r * 2));
const sepGrid = new Map();
// 本格 + 右 / 下行的左中右：保证每对僵尸恰好比较一次
const SEP_NEI = [[0, 0], [0, 1], [1, -1], [1, 0], [1, 1]];
const sepKey = (gx, gy) => (gx + 1024) * 4096 + (gy + 1024);
function separateZombies() {
  const n = zombies.length;
  if (n < 2) return;
  sepGrid.clear();
  for (let i = 0; i < n; i++) {
    const z = zombies[i];
    const k = sepKey(Math.floor(z.x / SEP_CELL), Math.floor(z.y / SEP_CELL));
    const bucket = sepGrid.get(k);
    if (bucket) bucket.push(i); else sepGrid.set(k, [i]);
  }
  for (let i = 0; i < n; i++) {
    const a = zombies[i];
    const gx = Math.floor(a.x / SEP_CELL), gy = Math.floor(a.y / SEP_CELL);
    for (let k = 0; k < SEP_NEI.length; k++) {
      const bucket = sepGrid.get(sepKey(gx + SEP_NEI[k][0], gy + SEP_NEI[k][1]));
      if (!bucket) continue;
      const sameCell = k === 0;
      for (let m = 0; m < bucket.length; m++) {
        const j = bucket[m];
        if (j === i || (sameCell && j < i)) continue;   // 跳过自己与同格内的重复计数
        const b = zombies[j];
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
  }
}
