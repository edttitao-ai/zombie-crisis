'use strict';
// HUD：面板 / Boss 血条 / 波次横幅 / 准星
function hudPanel(x, y, w, h, r, accent) {
  const pg = ctx.createLinearGradient(0, y, 0, y + h);
  pg.addColorStop(0, 'rgba(24,32,27,0.84)');
  pg.addColorStop(0.55, 'rgba(10,15,12,0.78)');
  pg.addColorStop(1, 'rgba(4,7,6,0.86)');
  ctx.fillStyle = pg;
  rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 1;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  if (accent) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accent;
    rr(ctx, x + 2, y + h - 3, w - 4, 2, 1); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawHUD(now) {
  const p = player;
  // ---- 左上面板：生命 / 武器 / 手雷 / 冲刺 ----
  ctx.textBaseline = 'middle';
  hudPanel(16, 16, 262, 158, 10, 'rgba(212,59,48,0.5)');
  if (vipMode) { // VIP 徽章
    ctx.fillStyle = '#ffd24a';
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText('★ VIP', 270, 25);
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
  // 生命条（凹槽 + 伤害残影 + 渐变血量 + 内高光 + 刻度）
  const bx = 52, by = 30, bw = 208, bh = 16;
  const bg2 = ctx.createLinearGradient(0, by, 0, by + bh);
  bg2.addColorStop(0, 'rgba(0,0,0,0.74)');
  bg2.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = bg2;
  rr(ctx, bx, by, bw, bh, 4); ctx.fill();
  const hpc = clamp(p.hp / p.maxHp, 0, 1);
  if (p.hpShown > p.hp) {   // 伤害残影画在当前血量之下，露出刚掉的那一截
    ctx.fillStyle = 'rgba(255,236,208,0.55)';
    rr(ctx, bx, by, Math.max(bh, bw * clamp(p.hpShown / p.maxHp, 0, 1)), bh, 4); ctx.fill();
  }
  if (hpc > 0) {
    const hgr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hgr.addColorStop(0, '#8e1a13'); hgr.addColorStop(0.5, '#e13b30'); hgr.addColorStop(1, '#ff7a5e');
    ctx.fillStyle = hgr;
    rr(ctx, bx, by, Math.max(bh, bw * hpc), bh, 4); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(bx + 3, by + 2, Math.max(0, bw * hpc - 6), 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const x = bx + bw * i / 10;
    ctx.moveTo(x, by + 2); ctx.lineTo(x, by + bh - 2);
  }
  ctx.stroke();
  ctx.fillStyle = '#fdf6ea';
  ctx.font = 'bold 12px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(fmt(t('hp'), Math.ceil(p.hp), p.maxHp), bx + 8, by + bh / 2 + 0.5);
  // 武器行：图标 + 名称 + 弹药
  const ay = by + bh + 16;
  const wd = WEAPONS[p.weapon];
  weaponGlyph(ctx, 36, ay, p.weapon, 1.1, WCOL[p.weapon]);
  ctx.fillStyle = '#fdf6ea';
  ctx.font = 'bold 14px ' + FONT;
  ctx.fillText(t(wd.nameKey), 48, ay + 1);
  ctx.textAlign = 'right';
  if (infMagOn()) {                       // VIP 无限弹匣加特林：没有弹匣与换弹的概念
    ctx.fillStyle = '#f2d98c';
    ctx.fillText('∞ / ∞', 262, ay + 1);
  } else if (p.reloadT > 0) {
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
  ctx.fillStyle = p.grenades > 0 ? '#fdf6ea' : '#8a847a';
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillText('× ' + p.grenades, 40, gy + 1);
  // 燃烧瓶
  ctx.fillStyle = '#5f8f6f';
  ctx.beginPath(); ctx.arc(86, gy + 1, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9a3d';
  ctx.beginPath(); ctx.arc(86, gy - 4.5, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = p.mols > 0 ? '#fdf6ea' : '#8a847a';
  ctx.fillText('× ' + p.mols, 96, gy + 1);
  // 医疗包
  ctx.fillStyle = '#e8e8e2';
  rr(ctx, 138, gy - 5, 13, 11, 2); ctx.fill();
  ctx.fillStyle = '#c9271f';
  ctx.fillRect(142.5, gy - 4, 4, 9); ctx.fillRect(140, gy - 1.5, 9, 4);
  ctx.fillStyle = p.medkits > 0 ? '#fdf6ea' : '#8a847a';
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

  // 宠物：图标 + 名字 + 等级 + 经验条。它是长期陪伴物，成长必须随时看得见。
  if (pet) {
    const pd = petDef(pet.kind);
    const py2 = gy + 44;
    const capped = pet.lv >= petCap();
    const pct = capped ? 1 : clamp(pet.xp / petNeed(pet.lv), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    rr(ctx, 24, py2 - 10, 246, 20, 5); ctx.fill();
    ctx.fillStyle = hexA(pd.col, capped ? 0.20 : 0.30);
    rr(ctx, 24, py2 - 10, Math.max(8, 246 * pct), 20, 5); ctx.fill();
    drawPetIcon(ctx, 38, py2, 8, pd, pd.col);
    ctx.fillStyle = '#fdf6ea';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(t(pd.nameKey), 52, py2 + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = pd.col;
    ctx.fillText((pet.evo > 0 ? '★' : '') + 'Lv.' + pet.lv +
                 (capped ? '' : '  ' + pet.xp + '/' + petNeed(pet.lv)), 262, py2 + 1);
    ctx.textAlign = 'left';
  }

  // ---- 右上面板：得分 / 波次 ----
  const pw = 196, px2 = W - pw - 26;
  hudPanel(px2, 16, pw, 104, 10, vipMode ? 'rgba(255,210,74,0.55)' : 'rgba(126,200,255,0.42)');
  ctx.textAlign = 'right';
  ctx.font = 'bold 24px ' + FONT;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,172,60,0.38)';
  ctx.strokeText(fmt(t('score'), score), W - 40, 42);   // 暖色外圈辉光，兼作画面高光
  ctx.fillStyle = '#ffeaa6';
  ctx.fillText(fmt(t('score'), score), W - 40, 42);
  ctx.fillStyle = '#bdd0b2';
  ctx.font = '14px ' + FONT;
  ctx.fillText(fmt(t('waveN'), wave), W - 40, 68);
  ctx.fillText(fmt(t('left'), zombies.length + toSpawn), W - 40, 88);
  ctx.fillStyle = '#93a68a';
  ctx.fillText(fmt(t('bestShort'), best), W - 40, 108);

  // 连杀提示：≥3 连才显示，避免刷屏；颜色随连杀升级
  if (combo >= 3) {
    const mul = comboMul();
    ctx.globalAlpha = 0.55 + 0.45 * clamp(comboT / 2.5, 0, 1);
    ctx.fillStyle = combo >= 15 ? '#ff7a54' : (combo >= 8 ? '#ffb347' : '#ffe08a');
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(fmt(t('combo'), combo) + '  ×' + mul.toFixed(2), W - 40, 132);
    ctx.globalAlpha = 1;
  }

  // ---- Boss 血条：顶部中央，占据两块面板之间的空档 ----
  const bz = zombies.find(z => z.boss);
  if (bz) {
    const bw2 = Math.max(170, Math.min(520, W - 580));
    const bx2 = (W - bw2) / 2, by2 = 24, bh2 = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    rr(ctx, bx2, by2, bw2, bh2, 4); ctx.fill();
    const bhpc = clamp(bz.hp / bz.maxHp, 0, 1);
    const bg3 = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
    bg3.addColorStop(0, '#7a1b4a'); bg3.addColorStop(0.5, '#d43b6a'); bg3.addColorStop(1, '#ff7a9a');
    ctx.fillStyle = bg3;
    rr(ctx, bx2, by2, Math.max(bh2, bw2 * bhpc), bh2, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(bx2 + 3, by2 + 2, Math.max(0, bw2 * bhpc - 6), 2);
    ctx.strokeStyle = 'rgba(255,180,200,0.55)'; ctx.lineWidth = 1;
    rr(ctx, bx2 + 0.5, by2 + 0.5, bw2 - 1, bh2 - 1, 4); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9e4';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(t(ZDEF[bz.type].nameKey) + '   ' + Math.ceil(bz.hp) + ' / ' + bz.maxHp, W / 2, by2 + bh2 + 13);
    ctx.textAlign = 'left';
  }

  // 左下提示
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(178,198,168,0.55)';
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
    // 横幅：深底 + 顶部高光 + 上下强调条，文字加暖辉光
    const bnr = ctx.createLinearGradient(0, -40, 0, 22);
    bnr.addColorStop(0, 'rgba(16,22,28,0.86)');
    bnr.addColorStop(1, 'rgba(6,9,13,0.90)');
    ctx.fillStyle = bnr;
    rr(ctx, -bw / 2, -40, bw, 62, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(ctx, -bw / 2 + 0.5, -39.5, bw - 1, 61, 8); ctx.stroke();
    ctx.fillStyle = 'rgba(232,72,58,0.9)';
    ctx.fillRect(-bw / 2, -40, bw, 3);
    ctx.fillRect(-bw / 2, 19, bw, 3);
    ctx.globalAlpha = k;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,120,70,0.35)';
    ctx.strokeText(waveMsg, 0, 8);
    ctx.fillStyle = '#ff8b73';
    ctx.fillText(waveMsg, 0, 8);
    ctx.restore();
  }
  ctx.letterSpacing = '0px';
  if (!waveActive && nextWaveIn > 0) {
    ctx.fillStyle = 'rgba(196,212,186,0.95)';
    ctx.font = '17px ' + FONT;
    ctx.fillText(fmt(t('nextWave'), Math.ceil(nextWaveIn)), W / 2, H * 0.2 + 92);
  }
}

function drawCrosshair() {
  const x = mouse.x, y = mouse.y;
  const col = mouse.down ? 'rgba(255,110,86,0.95)' : 'rgba(255,255,255,0.9)';
  // 命中标记：命中瞬间弹出四道斜向刻线，明确反馈「打中了」
  if (hitMarkT > 0) {
    const k = hitMarkT / 0.13;
    const r0 = (7 + (1 - k) * 9) * 0.72, r1 = r0 + 6;
    ctx.strokeStyle = 'rgba(255,236,180,' + k + ')';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      ctx.moveTo(x + sx * r0, y + sy * r0);
      ctx.lineTo(x + sx * r1, y + sy * r1);
    }
    ctx.stroke();
  }
  // 深色底层描边：保证在提亮后的地面上准星依然清晰
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 3.6;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.6;
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
