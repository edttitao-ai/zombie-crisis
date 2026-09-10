'use strict';
// 渲染：场景合成 / 闪电特效（每帧调用，勿在此放一次性构建）
/* ================= 渲染 ================= */
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

function render() {
  const now = performance.now() / 1000;   // 勿命名为 t：t 是 i18n 取词函数，遮蔽后会静默出错

  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  ctx.save();
  ctx.translate(sx, sy);

  // 地面（预渲染纹理，轻微过绘覆盖抖动边缘）；血迹/焦痕已烘焙在其中
  if (ground) ctx.drawImage(ground, -14, -14, W + 28, H + 28);
  else { ctx.fillStyle = PAL.groundBase; ctx.fillRect(0, 0, W, H); }

  // 贴地低空雾：画在实体之下，缓慢横移，给战场制造纵深与空气感。
  // 用加算（lighter）而非 screen：观感接近但逐像素开销低得多；只保留两层
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.032;
  const fgx = ((now * 11) % (W + 620)) - 310;
  const fgy = H * 0.38 + Math.sin(now * 0.35) * 26;
  ctx.drawImage(SPR.fog, fgx - 340, fgy - 230, 680, 460);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

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

  // 吞噬滚球：越吃越大的带齿球体，外面一层随体型变强的绿色辉光
  for (const R2 of rollers) {
    const k = R2.r / R2.maxR;
    ctx.save();
    ctx.translate(R2.x, R2.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.20 + 0.45 * k;
    ctx.drawImage(SPR.glowSoft, -R2.r * 1.9, -R2.r * 1.9, R2.r * 3.8, R2.r * 3.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, R2.r * 0.82, R2.r * 0.95, R2.r * 0.34, 0, 0, 7); ctx.fill();
    ctx.rotate(R2.spin);
    ctx.fillStyle = '#a8ff6b';
    for (let t2 = 0; t2 < 10; t2++) {          // 一圈尖齿：越吃越长
      const a2 = t2 / 10 * Math.PI * 2;
      const tipL = R2.r * (1 + 0.22 + 0.30 * k);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * R2.r * 0.92, Math.sin(a2) * R2.r * 0.92);
      ctx.lineTo(Math.cos(a2) * tipL, Math.sin(a2) * tipL);
      ctx.lineTo(Math.cos(a2 + 0.42) * R2.r * 0.92, Math.sin(a2 + 0.42) * R2.r * 0.92);
      ctx.closePath(); ctx.fill();
    }
    const g2 = ctx.createRadialGradient(-R2.r * 0.3, -R2.r * 0.35, R2.r * 0.15, 0, 0, R2.r * 0.95);
    g2.addColorStop(0, '#e6ffd0'); g2.addColorStop(0.55, '#6fbf3a'); g2.addColorStop(1, '#24501a');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, 0, R2.r * 0.92, 0, 7); ctx.fill();
    ctx.fillStyle = '#16260f';                    // 中心那张嘴
    ctx.beginPath(); ctx.arc(0, 0, R2.r * (0.30 + 0.16 * k), 0, 7); ctx.fill();
    ctx.restore();
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

  // 宠物：画在玩家暖主光之前，这样它会跟其它实体一样被主光照到
  drawPet(now);
  drawPetArcs();

  // 玩家暖主光：两层叠加——紧凑的亮光池 + 大范围柔和衰减。
  // 与地面烘焙的青蓝环境光形成冷暖对比，这是层次的主要来源。
  ctx.globalCompositeOperation = 'lighter';
  const kr1 = PAL.keyRadius * 2.0;
  ctx.globalAlpha = PAL.keyAlpha;
  ctx.drawImage(SPR.key, player.x - kr1 / 2, player.y - kr1 / 2, kr1, kr1);
  const kr2 = PAL.keyRadius * 2.6;
  ctx.globalAlpha = PAL.keyAlpha * 0.32;
  ctx.drawImage(SPR.key, player.x - kr2 / 2, player.y - kr2 / 2, kr2, kr2);
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
    // 接触阴影：软边 + source-over。曾用 multiply 更「正确」，但 130 只僵尸
    // 每帧 130 次逐像素混合会吃掉约 4ms；地面本就偏暗，半透明黑叠加观感几乎一致
    ctx.globalAlpha = 0.42;
    const shw = z.r * 2.9, shh = z.r * 1.8;
    ctx.drawImage(SPR.shadow, z.x - shw / 2 + 1.5, z.y - shh / 2 + z.r * 0.5, shw, shh);
    ctx.globalAlpha = 1;
    const sway = z.type === 'runner' ? Math.sin(z.wob) * 0.14 : Math.sin(z.wob * 0.5) * 0.07;
    // 行走循环：取当前相位对应的预渲染帧，逐帧只是换一张图，零额外开销
    const anim = z.anim || 0;
    const ph = anim / WALK_FRAMES * TAU;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(a + Math.PI / 2 + sway + Math.sin(ph) * 0.05);
    ctx.translate(0, Math.sin(ph) * 0.9);            // 拖步起伏
    ctx.drawImage(spr.frames[(anim % WALK_FRAMES) | 0], -spr.half, -spr.half, spr.half * 2, spr.half * 2);
    // 局部空间动态部件
    if (z.type === 'spitter') { // 酸囊充气
      const charge = clamp(1 - z.spitCd / 2.2, 0, 1);
      ctx.globalAlpha = 0.3 + 0.3 * charge;
      ctx.fillStyle = '#b7e055';
      ctx.beginPath(); ctx.arc(0, -z.r * 0.05, z.r * (0.3 + 0.25 * charge), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (z.type === 'bloater' && z.fuseT > 0 && Math.sin(now * 40) > 0) { // 引信红闪
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#ff5340';
      ctx.beginPath(); ctx.ellipse(0, 0, z.r * 0.9, z.r * 0.75, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (z.flash > 0) {   // 受击闪白（唯一一处，随朝向压成椭圆）
      ctx.globalAlpha = Math.min(1, z.flash / 0.07) * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * 0.85, z.r * 0.7, a, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (z.buffT > 0) { // 被狂化的红圈
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(now * 12);
      ctx.strokeStyle = '#ff5ec7';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 5, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 被宠物光环减速：脚下一圈寒气。没有这个标记，"僵尸变慢了"是看不见的。
    if (z.slowT > 0) {
      ctx.globalAlpha = 0.30 + 0.22 * Math.sin(now * 6 + z.x * 0.05);
      ctx.strokeStyle = '#9ff0b0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(z.x, z.y + z.r * 0.55, z.r * 0.9, z.r * 0.34, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 冲撞者蓄力：一条预警线，玩家必须看得见它要冲哪 —— 看不见的冲刺是耍赖，不是难度
    if (z.boss === 'charger' && z.windT > 0) {
      const wk = 1 - z.windT / 0.75;
      const wa = z.dashA || 0;
      ctx.globalAlpha = 0.22 + 0.5 * wk;
      ctx.strokeStyle = '#ff8a3c';
      ctx.lineWidth = 3 + 7 * wk;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.lineTo(z.x + Math.cos(wa) * 440, z.y + Math.sin(wa) * 440);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 冲撞者硬直：一圈金黄，明确告诉玩家"现在打它"
    if (z.boss === 'charger' && z.dazedT > 0) {
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now * 15);
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 9, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 跃行者蓄力：虚线指向 + 地面落点圈。和冲撞者同一个道理 —— 看不见的扑击是耍赖，不是难度。
    // 落点距离用 LEAP_SPEED × LEAP_TIME 算，与 update 里的位移同源，改一处就够。
    if (z.type === 'leaper' && z.crouchT > 0) {
      const k = 1 - z.crouchT / 0.5;
      const la = z.leapA || 0;
      const lx = clamp(z.x + Math.cos(la) * LEAP_SPEED * LEAP_TIME, 22, W - 22);
      const ly = clamp(z.y + Math.sin(la) * LEAP_SPEED * LEAP_TIME, 22, H - 22);
      ctx.globalAlpha = 0.25 + 0.5 * k;
      ctx.strokeStyle = '#ffc04a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.setLineDash([]);                       // 必须复位，虚线不能漏给后面的绘制
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(lx, ly, 36 * (0.55 + 0.45 * k), 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.20 + 0.30 * k;
      ctx.beginPath(); ctx.arc(lx, ly, 36, 0, 7); ctx.fill();
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
  // 投影（同僵尸：软边半透明黑）
  ctx.globalAlpha = 0.5;
  ctx.drawImage(SPR.shadow, p.x - p.r * 1.75, p.y - p.r * 1.05 + p.r * 0.55, p.r * 3.5, p.r * 2.2);
  ctx.globalAlpha = 1;
  // 枪（沿朝向 +X，带后坐；画在躯体之前，让躯干与持枪双臂压住枪身）
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
  // 躯体：预渲染精灵（装甲 + 肩甲 + 背包 + 持枪双臂 + 面罩头盔），带行走循环与暖色边缘光。
  // 与僵尸走同一条绘制/后处理管线，所以主角和尸群在光照上是一套的。
  const hsp = SPR.hero;
  const hfr = hsp.frames[p.moving ? (((p.walk / (TAU / WALK_FRAMES)) % WALK_FRAMES) | 0) : 0];
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang + Math.PI / 2);
  ctx.drawImage(hfr, -hsp.half, -hsp.half, hsp.half * 2, hsp.half * 2);
  ctx.restore();
  // 加持状态光环（速射 / VIP）——原来描在圆形躯体上，现在躯体是精灵，改成外圈光环
  if (rapidT > 0 || vipMode) {
    ctx.strokeStyle = rapidT > 0
      ? 'rgba(255,210,74,' + (0.45 + 0.45 * Math.sin(now * 14)) + ')'
      : 'rgba(255,210,74,0.42)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, 0, 7); ctx.stroke();
  }
  // 冲刺无敌闪烁
  if (p.invulnT > 0) {
    ctx.strokeStyle = 'rgba(160,220,255,' + (0.35 + 0.35 * Math.sin(now * 30)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 17, 0, 7); ctx.stroke();
  }
  // 枪口火光（地面光池 + 白热芯 + 暖光晕 + 星形焰）
  if (muzzleT > 0) {
    const k = muzzleT / 0.05;
    const mx = p.x + Math.cos(p.ang) * (p.r + 24), my = p.y + Math.sin(p.ang) * (p.r + 24);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * 0.45;
    ctx.drawImage(SPR.key, mx - 190, my - 190, 380, 380);      // 枪口照亮地面，开火有存在感
    ctx.globalAlpha = k;
    ctx.drawImage(SPR.glowSoft, mx - 40, my - 40, 80, 80);     // 白热芯，负责顶到高光区
    ctx.drawImage(SPR.glowWarm, mx - 34, my - 34, 68, 68);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(mx, my); ctx.rotate(p.ang);
    ctx.fillStyle = 'rgba(255,242,196,' + k + ')';
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(3, -5.5); ctx.lineTo(-8, -2.4); ctx.lineTo(-8, 2.4); ctx.lineTo(3, 5.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 装填进度环
  if (p.reloadT > 0) {
    const prog = 1 - p.reloadT / WEAPONS[p.weapon].reloadT;
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  }

  // 子弹（双层曳光，磁轨枪为青色贯穿光）
  ctx.lineCap = 'round';
  for (const b of bullets) {
    const nb = b.bounces || 0;                       // 跳弹次数：越弹越亮越粗
    const isPet = b.petShot;                         // 宠物弹：拖尾更长更亮 + 弹头亮点
    const tail = isPet ? 0.055 : 0.022;
    const glowCol = b.pierce ? 'rgba(126,200,255,0.35)'
                             : hexA(b.wc || '#ffbe50', isPet ? 0.6 : Math.min(0.75, 0.3 + nb * 0.09));
    const coreCol = b.pierce ? '#b9e2ff' : (nb > 0 ? '#eafff4' : (b.wc || '#ffe9a8'));
    ctx.strokeStyle = glowCol;
    ctx.lineWidth = (b.pierce ? 7 : 5.5) + nb * 0.9 + (isPet ? 1.6 : 0);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * tail, b.y - b.vy * tail); ctx.stroke();
    ctx.strokeStyle = coreCol;
    ctx.lineWidth = isPet ? 3 : 2.2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * tail * 0.7, b.y - b.vy * tail * 0.7); ctx.stroke();
    if (isPet) {                                     // 弹头亮点：一眼看出这一发是宠物打的
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, 7); ctx.fill();
    }
  }

  // 狙击射线：炽白芯 + 青色辉光，随时间收窄淡出
  for (const bm of beams) {
    const k = 1 - bm.t / bm.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.globalAlpha = k * 0.5;
    ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 13 * k + 2;
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.globalAlpha = k;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.2 * k + 0.8;
    ctx.beginPath(); ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 酸弹（吐酸者）
  for (const b of acidBolts) {
    ctx.fillStyle = 'rgba(190,235,110,0.5)';
    ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#a4d637';
    ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, 7); ctx.fill();
  }

  // 迫击炮弹落点：外圈是伤害范围、内圈随引信收缩、炮弹从上方落下 —— 必须先看得见再挨打
  for (const sh of shells) {
    const k = 1 - sh.t / sh.fuse;                  // 1 → 0
    const heat = 1 - k;
    ctx.globalAlpha = 0.24 + 0.5 * heat;
    ctx.strokeStyle = '#ffbe5a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.5 + 0.5 * heat;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, Math.max(6, sh.r * k), 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.35 + 0.4 * heat;
    ctx.beginPath();
    ctx.moveTo(sh.x - sh.r, sh.y); ctx.lineTo(sh.x - sh.r * 0.72, sh.y);
    ctx.moveTo(sh.x + sh.r * 0.72, sh.y); ctx.lineTo(sh.x + sh.r, sh.y);
    ctx.moveTo(sh.x, sh.y - sh.r); ctx.lineTo(sh.x, sh.y - sh.r * 0.72);
    ctx.moveTo(sh.x, sh.y + sh.r * 0.72); ctx.lineTo(sh.x, sh.y + sh.r);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffdf9a';
    ctx.beginPath(); ctx.arc(sh.x, sh.y - (1 - k) * 160, 4.5, 0, 7); ctx.fill();
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

  // 爆炸闪光与冲击环（炽白核心 + 暖色外焰 + 冲击环）
  for (const f of flashes) {
    const k = f.t / f.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - k) * 0.9;
    const fsz = f.r * (0.5 + k * 1.1) * 2;
    ctx.drawImage(SPR.glowWarm, f.x - fsz / 2, f.y - fsz / 2, fsz, fsz);
    if (k < 0.45) {   // 起爆瞬刻的炽白核心：画面高光的主要来源
      const csz = f.r * (0.3 + k * 1.0) * 2;
      ctx.globalAlpha = (1 - k / 0.45) * 0.95;
      ctx.drawImage(SPR.glowSoft, f.x - csz / 2, f.y - csz / 2, csz, csz);
    }
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = 'rgba(255,216,152,0.9)';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + k * 0.95), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // 击杀飘分（弹入 + 暖色描边辉光；不用 shadowBlur，软件光栅下太贵）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const q of pops) {
    const life = clamp(1 - q.t / q.life, 0, 1);
    const grow = q.t < 0.12 ? 0.72 + (q.t / 0.12) * 0.28 : 1;
    ctx.globalAlpha = life;
    ctx.font = 'bold ' + Math.round(15 * grow) + 'px ' + FONT;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,186,74,0.5)';
    ctx.strokeText(q.txt, q.x, q.y);                  // 外圈暖色辉光
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.82)';
    ctx.strokeText(q.txt, q.x, q.y);
    ctx.fillStyle = '#fff3c4';
    ctx.fillText(q.txt, q.x, q.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore(); // 抖动结束

  // 空气雾：第二层画在实体之上，靠近镜头的一层薄雾，拉开前后景
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.026;
  const hz = ((now * 15) % (W + 780)) - 390;
  ctx.drawImage(SPR.fog, hz - 360, H * 0.66 - 240, 720, 480);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 暗角：预渲染成画布后整张贴上（逐帧现算径向渐变在软件光栅下明显更贵）
  if (!vigCanvas) buildVignette();
  ctx.drawImage(vigCanvas, 0, 0, W, H);

  // 受伤红光 + 低血量脉冲
  const red = clamp(hurtT * 1.4, 0, 0.5) + (p.hp > 0 && p.hp < 30 ? 0.16 + 0.08 * Math.sin(now * 6) : 0);
  if (red > 0) {
    const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    rg.addColorStop(0, 'rgba(180,20,20,0)');
    rg.addColorStop(1, 'rgba(180,20,20,' + clamp(red, 0, 0.6) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'playing' || state === 'gameover') drawHUD(now);
  if (state === 'playing' && !paused) drawCrosshair();
  if (state === 'playing') drawWaveTexts();
}

// HUD 面板：纵向渐变 + 顶部高光边 + 底部强调色条。
// 原来的平涂 rgba(6,9,6,0.5) 色块在提亮后的画面里显得很薄、像贴纸

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
