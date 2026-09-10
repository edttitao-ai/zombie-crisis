'use strict';
// 数据模块：武器定义 / 僵尸种类 / 强化卡牌（每种语言文案在 lang/ 下独立文件）

/* ================= 实体数量上限 ================= */
const CAP = { zombies: 130, parts: 420, stains: 200, corpses: 40, casings: 80, pops: 30, fires: 48 };
const MEDKIT_CAP = 5;   // 医疗包库存上限（与投掷物上限 upg.throwCap 相互独立）
const PICK_R = 16;      // 拾取判据 = player.r + PICK_R
const DROP_DIST = 34;   // 按 X 丢枪时的落点距离
// 按 X 主动丢下的枪，必须先离开这个半径才能再捡：落点(34px)与拾取半径(31px)只差 3px，
// 而一帧位移就有 3.8px，没有这道闸门的话往前后退一步就把它捡回来了。
const DROP_ARM_R = 78;
const STAIN_LIFE = 60;  // 血迹/焦痕存留秒数：够久，但不会像以前那样永久累积
const STAIN_FADE = 18;  // 生命末尾用于淡出的秒数

/* ================= 视觉基调 =================
   光色结构集中在此处，调整整体观感主要改这一块。
   设计要点：地面抬到中低明度、给足上方空间容纳实体与高光；
   暗部用青蓝环境光而非纯黑，靠冷暖对比拉层次；实体加强轮廓与边缘光。 */
const PAL = {
  groundBase:  '#1c2419',                  // 地面基底。原 #141812 平均亮度仅 22/255（欠曝约两档）；
                                           // 也不能提太亮——中明度地面是剪影最差的情况。结合
                                           // 冷环境光/暖土斑/暖主光后，场景地面实测落在 ~42
  ambientTop:  'rgba(74,116,168,0.26)',    // 斜上方冷环境光（月光方向）
  ambientMid:  'rgba(34,54,82,0.08)',
  ambientBot:  'rgba(10,14,22,0.24)',
  warmPatch:   '#6f4e2c',                  // 暖土斑，给冷底子掺回暖调
  groundDark:  'rgba(0,0,0,0.30)',
  groundLight: 'rgba(222,232,206,0.10)',
  grid:        'rgba(255,255,255,0.020)',
  crackLight:  'rgba(198,214,186,0.10)',   // 裂缝亮边
  crackDark:   'rgba(0,0,0,0.34)',         // 裂缝暗芯
  outline:     'rgba(7,10,8,0.9)',         // 实体深描边：让实体从中明度地面里跳出来
  rim:         'rgba(176,212,248,0.55)',   // 实体冷边缘光：交代光源方向
  fog:         'rgba(172,198,222,0.5)',    // 低空雾/空气感
  keyLight:    '#ffcf8e',                  // 玩家暖主光（配 globalAlpha 使用）
  keyRadius:   270,                        // 主光半径（过大会把整个战场泛白、压掉实体分离度）
  keyAlpha:    0.12,                       // 主光强度
  ambientCool: 'rgba(26,44,76,0.20)',      // 冷环境罩
  vignette:    '#03060d',                  // 暗角用冷色，不用纯黑
  blood:       '#a01818',                  // 新鲜血迹（原来 #5c1010 在亮地面上几乎看不见）
  bloodDark:   '#4a0c0c',
  scald:       '#171310',                  // 焦痕
  heroCol:     '#6f8a52',                  // 主角装甲基色
  heroRim:     'rgba(255,206,150,0.6)'     // 主角用暖色边缘光，与敌人的冷色边缘光区分开
};

/* ================= 武器定义 =================
   实测群体伤害（balance.mjs，18 个目标、持续开火 6 秒）决定的档位：
     直射档  冲锋枪 / 加特林（穿透 1）
     范围档  火焰喷射器 / 跳弹枪 / 特斯拉 / 狙击
     顶级档  蜂群导弹 · 吞噬滚球 —— 机制各异，强度明确高于其它档
   给加特林加 `pierceN`（有限穿透）：割草游戏里「只能打一个」的武器群体输出会被范围武器
   压好几倍，这才是「伤害低」的根因，砍枪治不了。
   每把枪都带 `snd`（音效名）与 `shake`（屏幕震动），保证手感按武器分级。 */
const WEAPONS = {
  smg:         { nameKey: 'wSMG',         snd: 'smg',         dmg: 11, rate: 0.065, spread: 0.075, pellets: 1,  magSize: 45,  reloadT: 1.0, speed: 760, reserve: 180,      auto: true,  shake: 1.3 },
  flamer:      { nameKey: 'wFlamer',      snd: 'flame',       dmg: 5,  rate: 0.045, spread: 0.22,  pellets: 1,  magSize: 260, reloadT: 2.0, speed: 430, reserve: 620,      auto: true,  shake: 1.0, life: 0.30, burn: true },
  mini:        { nameKey: 'wMini',        snd: 'mini',        dmg: 8,  rate: 0.045, spread: 0.08,  pellets: 1,  magSize: 200, reloadT: 2.4, speed: 820, reserve: 800,      auto: true,  shake: 0.9, pierceN: 1 },
  rail:        { nameKey: 'wRail',        snd: 'zap',         dmg: 0,  rate: 1.1,   spread: 0,     pellets: 1,  magSize: 6,   reloadT: 1.6, speed: 0,   reserve: 24,       auto: false, shake: 3.5, tesla: true, dps: 22, teslaLife: 2.5, hopDist: 210, maxHops: 7, lock: 135 },
  sniper:      { nameKey: 'wSniper',      snd: 'sniper',      dmg: 95, rate: 0.85,  spread: 0,     pellets: 1,  magSize: 5,   reloadT: 1.8, speed: 0,   reserve: 20,       auto: false, shake: 9,   hitscan: true, range: 1100 },
  // 跳弹枪：子弹撞到场地边缘会反弹，每次反弹伤害递增 —— 封闭场地里越打越热闹，奖励贴墙打法
  ricochet:    { nameKey: 'wRicochet',    snd: 'ricochet',    dmg: 20, rate: 0.24,  spread: 0.03,  pellets: 1,  magSize: 18,  reloadT: 1.5, speed: 540, reserve: 140,      auto: true,  shake: 2.2, pierceN: 1, bounce: 6, bounceGrow: 1.4, life: 5 },
  // 蜂群导弹：一次扣扳机齐射 10 枚追踪弹 —— 弹幕饱和
  swarm:       { nameKey: 'wSwarm',       snd: 'swarm',       dmg: 11, rate: 1.6,   spread: 0.5,   pellets: 10, magSize: 4,   reloadT: 2.6, speed: 380, reserve: 16,       auto: false, shake: 4,   homing: 8, splash: 52, splashDmg: 38, rocket: true, trail: false, life: 2.6 },
  // ===== 顶级档：机制各异，强度明确高于其它档，也是掉落表里最靠后（最稀有）的 =====
  // 吞噬滚球：滚出一颗球，碾过的僵尸被吞掉、球体与伤害随之增长；时间到原地内爆
  devourer:    { nameKey: 'wDevourer',    snd: 'roll',        dmg: 34, rate: 1.2,   spread: 0,     pellets: 1,  magSize: 3,   reloadT: 2.6, speed: 275, reserve: 12,       auto: false, shake: 9,   roller: true, rollLife: 7, r0: 16, growR: 3.4, growDmg: 9, maxR: 92 }
};
const WCOL = { smg: '#ffb347', flamer: '#ff9a3d', mini: '#d6e86b',
               ricochet: '#8ff0c8', rail: '#b48cff', sniper: '#c9a2ff',
               swarm: '#ff9d4d', devourer: '#a8ff6b' };
const WGLOW = { smg: 'glowWarm', flamer: 'glowWarm', mini: 'glowWarm', ricochet: 'glowCyan',
                rail: 'glowSoft', sniper: 'glowSoft', swarm: 'glowWarm', devourer: 'glowRed' };
// 武器箱掉落权重：[类型, 累计阈值]，顺序即稀有度 —— 越靠后越稀有、也越强。
// 顶级档（蜂群 10% / 吞噬滚球 8%）合计 18%：太稀有会让玩家整局摸不到，
// 那样「做得更强」就没有意义了。
const W_DROP = [
  ['wsmg', 0.15], ['wflamer', 0.29], ['wmini', 0.42], ['wricochet', 0.56],
  ['wrail', 0.69], ['wsniper', 0.82], ['wswarm', 0.92], ['wdevourer', 1]
];
function pickWeaponDrop() {
  const r = Math.random();
  for (let i = 0; i < W_DROP.length; i++) if (r < W_DROP[i][1]) return W_DROP[i][0];
  return 'wsmg';
}
function weaponGlyph(c, x, y, type, s, col) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = col;
  if (type === 'smg') {
    c.fillRect(-7, -2, 14, 3.4); c.fillRect(-1, 1, 3, 5); c.fillRect(-7, -3.4, 4, 1.6);
  } else if (type === 'rail') {
    c.fillRect(-9, -1.6, 18, 3.2);
    c.fillRect(-3, -3.4, 2, 1.8); c.fillRect(0, -3.4, 2, 1.8); c.fillRect(3, -3.4, 2, 1.8);
    c.fillRect(-6, 1.6, 4, 3);
  } else if (type === 'mini') {
    c.fillRect(-8, -3, 16, 6);
    c.fillRect(-8, -4.6, 4, 1.6); c.fillRect(-8, 3, 4, 1.6);
    c.beginPath(); c.arc(7, 0, 2.6, 0, 7); c.fill();
  } else if (type === 'swarm') {
    c.fillRect(-8, -4.2, 12, 8.4);
    c.beginPath(); c.arc(6.5, -2.8, 1.6, 0, 7); c.fill();
    c.beginPath(); c.arc(6.5, 0, 1.6, 0, 7); c.fill();
    c.beginPath(); c.arc(6.5, 2.8, 1.6, 0, 7); c.fill();
    c.fillRect(-10.5, -2, 2.6, 4);
  } else if (type === 'flamer') {
    c.fillRect(-8, -1.8, 9, 3.6);
    c.beginPath(); c.moveTo(2, -2.6); c.lineTo(9, 0); c.lineTo(2, 2.6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-4.5, -3); c.quadraticCurveTo(0, -7, 4.5, -3); c.closePath(); c.fill();
  } else if (type === 'sniper') {
    c.fillRect(-10, -1.2, 20, 2.4);
    c.fillRect(-2, -5.2, 7, 3.4);
    c.fillRect(-8.5, 1.2, 3, 3.6);
  } else if (type === 'ricochet') {
    // 弹跳弹：直线弹体 + 前端箭头，两侧各一小段斜杠暗示会反弹
    c.fillRect(-9, -1.2, 11, 2.4);
    c.beginPath(); c.moveTo(2, -4.2); c.lineTo(8, 0); c.lineTo(2, 4.2); c.closePath(); c.fill();
    c.fillRect(-11.5, -4.8, 3, 2); c.fillRect(-11.5, 2.8, 3, 2);
  } else if (type === 'devourer') {
    // 吞噬滚球：带尖齿的球体
    c.beginPath(); c.arc(0, 0, 6.4, 0, 7); c.fill();
    for (let k = 0; k < 8; k++) {
      const a2 = k / 8 * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a2) * 6, Math.sin(a2) * 6);
      c.lineTo(Math.cos(a2) * 10, Math.sin(a2) * 10);
      c.lineTo(Math.cos(a2 + 0.5) * 6.4, Math.sin(a2 + 0.5) * 6.4);
      c.closePath(); c.fill();
    }
  }
  c.restore();
}
function curMagSize() { return Math.round(WEAPONS[player.weapon].magSize * upg.mag); }

/* ================= 僵尸种类定义 ================= */
// 体型/血量/速度/得分；minWave 是登场波次的唯一来源（pickZombieType 读取它）
// 各类型的专属行为（吐酸/自爆/减伤/尖啸）由 game.js 按 type 分支实现
// col 同时决定玩家辨识度：四种绿系保持腐肉底色但把色相拉开，装甲者改为钢蓝
// （原来是灰绿 #6b7a6b，饱和度仅 0.19，灰对灰最难辨认）
const ZDEF = {
  normal:   { r: 14, hp: 30,  spd: 58,  spdW: 3,   spdCap: 115, dmg: 10, col: '#628f45', sc: 10, minWave: 1 },
  runner:   { r: 11, hp: 20,  spd: 128, spdW: 4,   spdCap: 195, dmg: 8,  col: '#a8b03c', sc: 15, minWave: 2 },
  spitter:  { r: 13, hp: 26,  spd: 55,  spdW: 2,   spdCap: 80,  dmg: 6,  col: '#74a038', sc: 15, minWave: 3 },
  bloater:  { r: 20, hp: 60,  spd: 38,  spdW: 1.5, spdCap: 60,  dmg: 0,  col: '#a89040', sc: 20, minWave: 3 },
  shielder: { r: 15, hp: 55,  spd: 62,  spdW: 2.5, spdCap: 105, dmg: 12, col: '#7a94aa', sc: 25, minWave: 4 },
  screamer: { r: 12, hp: 24,  spd: 70,  spdW: 3,   spdCap: 120, dmg: 6,  col: '#c26aa6', sc: 25, minWave: 5 },
  brute:    { r: 24, hp: 120, spd: 42,  spdW: 1.5, spdCap: 70,  dmg: 22, col: '#457a35', sc: 30, minWave: 4 },

  // ===== Boss：每 5 波登场（由 startWave 显式投放，不进 SPAWN_TABLE，
  //       所以这里不写 minWave —— 写了也不会被读取，属于死数据）=====
  // 屠夫：巨型近战，走近后周期性震地（范围伤害），死亡时大爆炸 + 掉落雨
  butcher:  { r: 34, hp: 900, spd: 46, spdW: 1.2, spdCap: 84, dmg: 30, col: '#a8452f', sc: 300, boss: 'butcher', nameKey: 'zButcher' },
  // 腐化母体：保持距离喷酸扇面，并周期召唤尸群；逼玩家主动压上去
  brood:    { r: 30, hp: 820, spd: 40, spdW: 1.0, spdCap: 72, dmg: 18, col: '#8a4fa8', sc: 320, boss: 'brood', nameKey: 'zBrood' },
  // 冲撞者：蓄力后直线猛冲（有预警线），撞完进入硬直 —— 逼你横向闪避、再抓硬直输出
  charger:  { r: 30, hp: 780, spd: 52, spdW: 1.1, spdCap: 88, dmg: 26, col: '#d2691e', sc: 310, boss: 'charger', nameKey: 'zCharger' },
  // 迫击者：远距离抛射带落点警示的炮弹 —— 区域封锁，逼你一直移动
  mortar:   { r: 32, hp: 800, spd: 34, spdW: 0.8, spdCap: 62, dmg: 16, col: '#7d8f3a', sc: 310, boss: 'mortar', nameKey: 'zMortar' },
  // 纳尸者：把地上的尸体重新拉起来（并回复自身）—— 不清场就会被自己的战果反噬
  necro:    { r: 31, hp: 860, spd: 38, spdW: 0.9, spdCap: 68, dmg: 20, col: '#3f8f7d', sc: 330, boss: 'necro', nameKey: 'zNecro' }
};

/* ===== 随波次的成长曲线（调难度主要改这里）=====
   血量必须用**复利**，因为玩家的输出是乘算成长：强化卡的伤害 ×2.35、射速 ×2.15、
   暴击期望 ×1.9 叠起来约 ×9.6，而原先的线性 `hp + wave × hpW`（普通每波 +5 血）
   在 30 波里只涨到 5 倍 —— 实测最强武器从第 1 波到第 30 波的击杀耗时几乎一样，
   后期「随便就秒杀」。改用 base × (1+g)^(波次-1) 才追得上玩家的曲线。
   Boss 基础血本来就高（900 上下），同用指数会在 30 波变成两万血的血包，
   所以它走**线性比例**：base × (1 + g × (波次-1))。
   伤害同样复利但斜率更缓、并且封顶 —— 后期压力不该只靠血厚。 */
const HP_GROW = 0.11;        // 杂兵血量复利：每波 ×1.11
const BOSS_HP_GROW = 0.12;   // Boss 血量线性比例：每波 +12% 基准值
const DMG_GROW = 0.05;       // 僵尸伤害复利：每波 ×1.05
const DMG_GROW_CAP = 4;      // 伤害最多涨到基准的 4 倍（约第 30 波触顶）
function zombieHp(d, w) {
  const n = Math.max(0, w - 1);   // 第 1 波 = 基准值；开局 wave=0 也按基准算
  return Math.round(d.boss ? d.hp * (1 + BOSS_HP_GROW * n) : d.hp * Math.pow(1 + HP_GROW, n));
}
function zombieDmg(d, w) {
  const n = Math.max(0, w - 1);
  return Math.round(d.dmg * Math.min(DMG_GROW_CAP, Math.pow(1 + DMG_GROW, n)));
}
// Boss 轮换顺序：每 5 波一只，循环。改这里就能改出场次序。
const BOSS_ORDER = ['butcher', 'brood', 'charger', 'mortar', 'necro'];
// 出场概率阈值表：[类型, 累计阈值]，数组顺序即优先级。未到 minWave 的类型被跳过，
// 其概率质量归给 normal（与原实现完全等价）。调整难度只改这张表。
const SPAWN_TABLE = [
  ['screamer', 0.08],
  ['brute',    0.18],
  ['shielder', 0.30],
  ['bloater',  0.42],
  ['spitter',  0.54],
  ['runner',   0.76]
];
function pickZombieType() {
  const r = Math.random();
  for (let i = 0; i < SPAWN_TABLE.length; i++) {
    const type = SPAWN_TABLE[i][0];
    if (wave >= ZDEF[type].minWave && r < SPAWN_TABLE[i][1]) return type;
  }
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
// 卡面数值：统一在 `当前 → 选后` 一行里显示这一项的真实数值，让玩家能比较而不是猜。
// 格式刻意只用数字与符号（× % /），不带任何自然语言，单位由卡牌描述文案交代。
const CARD_STAT = {
  dmg:    [() => upg.dmg,      v => '×' + v.toFixed(2)],
  rate:   [() => 1 / upg.rate, v => '×' + v.toFixed(2)],   // upg.rate 存的是冷却倍数，展示成射速倍数更直观
  mag:    [() => upg.mag,      v => '×' + v.toFixed(1)],
  reload: [() => upg.reload,   v => '×' + v.toFixed(2)],
  speed:  [() => upg.speed,    v => '×' + v.toFixed(2)],
  hp:     [() => player.maxHp, v => String(Math.round(v))],
  crit:   [() => upg.crit,     v => Math.round(v * 100) + '%'],
  throw:  [() => upg.throwCap, v => String(v)],
  regen:  [() => upg.regen,    v => String(v)],
  vest:   [() => upg.vest,     v => Math.round(v * 100) + '%'],
  fire:   [() => upg.fire,     v => '×' + v.toFixed(2)]
};
for (const c of CARDS) { const s = CARD_STAT[c.id]; c.stat = s[0]; c.fmt = s[1]; }
// 适用性：助燃剂只对真能造成灼烧的武器有意义（当前只有火焰喷射器），
// 否则它是一张对玩家完全无效的卡 —— 抽到时按废牌处理
CARDS.find(c => c.id === 'fire').needs = () => !!WEAPONS[player.weapon].burn;
// VIP 的默认加特林弹匣无限：此时「扩容弹匣 / 熟练装填」毫无意义，一并过滤
CARDS.find(c => c.id === 'mag').needs = () => !infMagOn();
CARDS.find(c => c.id === 'reload').needs = () => !infMagOn();

// 预览卡牌生效后的数值：先快照 → apply → 取值 → 还原。
// 卡牌只改 upg 的数值字段与玩家的几个字段，这里逐一还原，避免为了预览而真的生效。
function cardPreview(c) {
  const snapUpg = Object.assign({}, upg);
  const snapMax = player.maxHp, snapHp = player.hp;
  const snapNade = player.grenades, snapMol = player.mols;
  c.apply();
  const after = c.stat();
  Object.assign(upg, snapUpg);
  player.maxHp = snapMax; player.hp = snapHp;
  player.grenades = snapNade; player.mols = snapMol;
  return after;
}
function resetUpgrades() {
  upg = { dmg: 1, rate: 1, mag: 1, reload: 1, speed: 1, crit: 0, vest: 0, throwCap: 5, regen: 0, fire: 1 };
  upgTaken = {};
}
function openCards() {
  const want = 4;   // 强化卡四选一（原 VIP 特权，现已对普通用户开放）
  // 只提供对当前武器真的有用的卡（见 CARDS 的 needs）。
  // 刻意不做「用被过滤掉的卡补足数量」——那等于把刚过滤掉的废牌又塞回来；
  // 池子快抽空时宁可只给 1~2 张真有用的卡，也不拿废牌凑数。
  // 注意判空必须针对**过滤后**的 pool：否则「只剩被过滤的卡」时会开出没有卡的空面板，
  // 紧接着 pickCard(undefined) 抛错（踩过一次）。
  const pool = CARDS.filter(c => (upgTaken[c.id] || 0) < c.max && (!c.needs || c.needs()));
  if (!pool.length) { nextWaveIn = 3; return; }
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
      '<div class="c-num">' + c.fmt(c.stat()) + '<b>→</b>' + c.fmt(cardPreview(c)) + '</div>' +
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

/* ================= 宠物 =================
   开局前在开始界面选择一只；它自主跟随并攻击，靠击杀累积经验自动升级。
   普通模式等级上限 10；**VIP 模式上限 15，且每 5 级「进化」一次**（外形改变 + 机制增强）——
   这是刻意做的不对称：VIP 的宠物成长得更夸张。
   宠物不会被打死：本作只做「陪你打」这一层，不引入受伤/复活系统。 */
const PET_XP_BASE = 4;          // 升到下一级所需击杀 = BASE + 当前等级 × STEP
const PET_XP_STEP = 3;
const PET_LV_NORMAL = 10;
const PET_LV_VIP = 15;
const PET_EVOLVE_EVERY = 5;     // VIP：每到 5 的倍数等级进化一次
// 每级成长率：普通 / VIP。VIP 的伤害、体型、攻速成长都明显更快 ——「夸张」就落在三个数上
const PET_GROW = { dmg: 0.17, rad: 0.65, cd: 0.975 };
const PET_GROW_VIP = { dmg: 0.28, rad: 1.05, cd: 0.955 };

const PETS = [
  { id: 'hound', vip: false, col: '#e6b06a', nameKey: 'petHound', descKey: 'petHoundD',
    // 近战：冲到最近的僵尸身上撕咬，单体高伤 + 击退
    base: { dmg: 30, cd: 0.5, r: 10, range: 270, speed: 272, knock: 2.6, keep: 44 },
    icon: '<svg viewBox="0 0 24 24"><path d="M4 6l3 4h9l3-4 1 6-2 3v4H6v-4L4 12z" fill="currentColor"/><circle cx="9" cy="10" r="1.3" fill="#0c120c"/><circle cx="14" cy="10" r="1.3" fill="#0c120c"/></svg>' },
  { id: 'drone', vip: false, col: '#8fd8ff', nameKey: 'petDrone', descKey: 'petDroneD',
    // 远程：跟在身边悬浮，点射最近的目标
    base: { dmg: 13, cd: 0.34, r: 9, range: 430, bspeed: 620, knock: 0.8, keep: 40 },
    icon: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="6" height="6" rx="1.4" fill="currentColor"/><path d="M9 10H5.5M15 10h3.5M9 14H5.5M15 14h3.5" stroke="currentColor" stroke-width="1.6"/><circle cx="4.6" cy="10" r="2.2" fill="currentColor"/><circle cx="19.4" cy="10" r="2.2" fill="currentColor"/><circle cx="4.6" cy="14" r="2.2" fill="currentColor"/><circle cx="19.4" cy="14" r="2.2" fill="currentColor"/></svg>' },
  { id: 'aura', vip: false, col: '#9ff0b0', nameKey: 'petAura', descKey: 'petAuraD',
    // 辅助：不主动攻击。持续治疗你，并让范围内的僵尸变慢
    base: { dmg: 0, cd: 1, r: 12, range: 148, heal: 1.5, slow: 0.55, keep: 52 },
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.4" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" stroke-width="1.8"/></svg>' },
  { id: 'bolt', vip: true, col: '#c9a2ff', nameKey: 'petBolt', descKey: 'petBoltD',
    // VIP：连锁闪电，一次电到一串（每进化 +2 跳）
    base: { dmg: 26, cd: 1.25, r: 11, range: 340, hops: 3, hopDist: 190, keep: 46 },
    icon: '<svg viewBox="0 0 24 24"><path d="M13 2 5 13h5.5L9 22l8-11h-5.5z" fill="currentColor"/></svg>' },
  { id: 'blade', vip: true, col: '#ffd24a', nameKey: 'petBlade', descKey: 'petBladeD',
    // VIP：环绕刀轮 —— 僵尸进射程就脱手飞出去追踪它，命中后回位（每进化 +1 片刀）
    base: { dmg: 30, cd: 0.85, r: 11, range: 430, speed: 640, orbitR: 46, spin: 3.1, blades: 1, keep: 0 },
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.6l2.4 4.2-2.4 2.4-2.4-2.4zM21.4 12l-4.2 2.4-2.4-2.4 2.4-2.4zM12 21.4l-2.4-4.2 2.4-2.4 2.4 2.4zM2.6 12l4.2-2.4 2.4 2.4-2.4 2.4z" fill="currentColor"/></svg>' }
];
function petDef(id) { for (const p of PETS) if (p.id === id) return p; return PETS[0]; }
