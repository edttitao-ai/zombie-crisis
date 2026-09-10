'use strict';
// 视觉资源：地面烘焙 / 精灵绘制与预渲染（八向描边 + 边缘光）/ 暗角 —— 全部一次性构建
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
// 把精灵画布染成单色剪影（保留 alpha），用来一次性烘焙描边与边缘光
function tintSilhouette(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ===== 地形：预制区块拼接 + 多倍频噪声 =====
   旧版是「十几个随机椭圆 + 均匀散点 + 等距网格」，三个实测出来的问题：
   ① 随机椭圆的边界在半透明叠加处会显影，眼睛能追出来 → 读成"泡泡/油渍"，不是材质；
   ② 每个元素都随机角度、随机位置 → 缺共享方向，这是"噪点感"的根源（不是细节不够）；
   ③ 明度全挤在暗部（audit：最暗 4 格占 83%、高光 0%），色相里青/蓝/紫为 0。
   现在按「先定用途 → 再定结构 → 最后才是颗粒」来做：地块切成预制区块（沥青/水泥板/裸土/
   积水/碎屑），块内用确定性噪声当材质，接缝只沿一个"浇筑方向"，裂缝沿缝走，水给高光。 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// value noise：在低分辨率离屏画布上生成再放大绘制。
// **不能逐像素画进主画布** —— 1264×765 就是近百万次写入，会把一次性烘焙从 8ms 推到秒级。
function noiseCanvas(w, h, rng, cell, oct) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g2 = c.getContext('2d');
  const N = 64, grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const smooth = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c2 * (1 - sx) + d * sx) * sy;
  };
  const img = g2.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { v += smooth(x / cell * f, y / cell * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
      const l = Math.round(clamp(v / norm, 0, 1) * 255);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = l; img.data[i + 3] = 255;
    }
  }
  g2.putImageData(img, 0, 0);
  return c;
}
// 预制区块：由"用途"决定基色与结构（而不是由随机椭圆决定明暗）。边缘偏好裸土，像场地的外围。
// 权重刻意让**水泥板与沥青占多数**：泥土地块太棕太大块时会盖掉整场的结构（实测踩过）。
function chunkKind(rng, cx, cy, cols, rows) {
  const edge = cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1;
  const r = rng();
  if (r < 0.18) return 'puddle';
  if (r < (edge ? 0.36 : 0.26)) return 'dirt';
  if (r < 0.40) return 'rubble';
  if (r < 0.80) return 'slab';
  return 'asphalt';
}
// 一条接缝：暗芯 + 亮边。环境遮蔽的一半就落在这条暗芯上，也是"结构被看见"的原因。
function drawJoint(g, x1, y1, x2, y2, w) {
  g.lineCap = 'butt';
  g.strokeStyle = PAL.jointDark; g.lineWidth = w;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.strokeStyle = PAL.jointLight; g.lineWidth = Math.max(0.6, w * 0.32);
  g.beginPath(); g.moveTo(x1 + 0.9, y1 + 0.9); g.lineTo(x2 + 0.9, y2 + 0.9); g.stroke();
}
function drawChunk(g, kind, x, y, S, rng) {
  const rnd = (a, b) => a + rng() * (b - a);
  const cx2 = x + S / 2, cy2 = y + S / 2;
  // 每块自己的颗粒：暗粒与亮粒混着撒、按块聚集。
  // 这一层是"颜色数"和"材质感"的来源 —— 全屏均匀撒点是噪点，按块聚集才是材质。
  const grain = () => {
    // 密度与亮粒都刻意压低：实测 300 颗/块 + 亮粒 0.16 会把地面局部亮度抬高，
    // 实体分离比掉到基线以下（normal 3.34→3.07、brute 3.05→2.80）—— 地面噪音抢了实体的对比度。
    // 红线是"不能为了地图好看牺牲实体可读性"，所以这里回退到 120 颗、亮粒封顶 0.11。
    for (let i = 0; i < 95; i++) {
      const dark = rng() < 0.66;
      g.fillStyle = dark ? hexA('#000000', +rnd(0.12, 0.32).toFixed(3))
                         : hexA('#d8e2c8', +rnd(0.04, 0.11).toFixed(3));
      const s = rnd(0.9, 2.2);
      g.fillRect(cx2 + rnd(-S / 2, S / 2), cy2 + rnd(-S / 2, S / 2), s, s * rnd(0.8, 1.8));
    }
  };
  grain();   // 先铺颗粒再画结构：接缝与镜面反光要压在最上面才清楚
  if (kind === 'puddle') {
    // 积水：不规则多边形（折线边）。有机但不是圆 —— 圆边是"泡泡感"的来源
    g.fillStyle = PAL.puddleCol;
    g.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(-0.16, 0.16);
      const r = S * rnd(0.34, 0.52);         // 面积要够才读得出"这是水洼"，小水渍在 30px 下看不见
      const px = cx2 + Math.cos(a) * r, py = cy2 + Math.sin(a) * r * 0.72;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    // 镜面反光：地面唯一允许的高光，也是"湿"的全部说辞。
    // 柔光一条 + 镜面芯一条 —— 只靠低透明度是顶不到高光区的（实测 0.16 的 alpha 在暗地面上不到 70）。
    g.strokeStyle = PAL.puddleHi; g.lineWidth = rnd(4, 7);
    g.beginPath();
    g.moveTo(cx2 - S * 0.24, cy2 - S * 0.10);
    g.quadraticCurveTo(cx2, cy2 - S * 0.18, cx2 + S * 0.26, cy2 - S * 0.06);
    g.stroke();
    g.strokeStyle = PAL.puddleCore; g.lineWidth = rnd(1.6, 2.6);
    g.beginPath();
    g.moveTo(cx2 - S * 0.20, cy2 - S * 0.11);
    g.quadraticCurveTo(cx2, cy2 - S * 0.185, cx2 + S * 0.22, cy2 - S * 0.07);
    g.stroke();
    // 水面上的几点碎光（水膜被雨点打过的样子）
    g.fillStyle = PAL.puddleCore;
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = rnd(0.35, 0.8);
      g.fillRect(cx2 + rnd(-S * 0.3, S * 0.3), cy2 + rnd(-S * 0.22, S * 0.22), rnd(1.2, 2.6), rnd(1, 2));
    }
    g.globalAlpha = 1;
    return;
  }
  if (kind === 'slab') {
    // 水泥板：整块铺 + 一道平行接缝（共享方向 = 不像噪点的关键）
    g.fillStyle = hexA(PAL.slab, 0.58);
    g.fillRect(x, y, S, S);
    const cut = rnd(0.38, 0.62);
    if (rng() < 0.5) drawJoint(g, x, y + S * cut, x + S, y + S * cut, 2.2);
    else drawJoint(g, x + S * cut, y, x + S * cut, y + S, 2.2);
    return;
  }
  if (kind === 'dirt') {
    // 裸土：不规则多边形（比块略小，露出底下的沥青形成过渡带）
    g.fillStyle = hexA(PAL.dirt, 0.62);
    g.beginPath();
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      const r = S * rnd(0.44, 0.58);
      const px = cx2 + Math.cos(a) * r, py = cy2 + Math.sin(a) * r * 0.82;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath(); g.fill();
    return;
  }
  if (kind === 'rubble') {
    // 碎屑堆：按块聚集的小碎块 —— 不是全屏均匀撒点（均匀撒点没有"聚落感"）
    g.fillStyle = hexA(PAL.rubbleCol, 0.70);
    g.beginPath(); g.ellipse(cx2, cy2, S * 0.30, S * 0.22, rnd(0, 3.14), 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU, r = rng() * S * 0.30;
      g.fillRect(cx2 + Math.cos(a) * r, cy2 + Math.sin(a) * r, rnd(2, 5), rnd(1.5, 4));
    }
    return;
  }
  // asphalt：湿沥青，只留褪色车道线给出尺度与方向
  g.fillStyle = hexA(PAL.asphalt, 0.55);
  g.fillRect(x, y, S, S);
  if (rng() < 0.45) {
    g.fillStyle = PAL.laneMark;
    const along = rng() < 0.5;
    for (let k = 0; k < 3; k++) {
      if (along) g.fillRect(x + S * (0.24 + k * 0.26), y + S * 0.46, S * 0.13, S * 0.05);
      else g.fillRect(x + S * 0.46, y + S * (0.24 + k * 0.26), S * 0.05, S * 0.13);
    }
  }
}
function buildGround() {
  const dpr = window.devicePixelRatio || 1;
  const gw = Math.ceil(W * dpr), gh = Math.ceil(H * dpr);
  // 地形单独存一张「底图」：贴花要按年龄淡出就必须能重建，而地形本身不能每次重绘成另一样子
  // （种子固定后，同一尺寸下重建得到的地形完全一致）。画布复用而不重建。
  if (!groundBase) groundBase = document.createElement('canvas');
  if (groundBase.width !== gw || groundBase.height !== gh) { groundBase.width = gw; groundBase.height = gh; }
  const g = groundBase.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);   // 用 setTransform：复用画布时 scale 会累积
  const rng = makeRng(TERRAIN_SEED);
  const rnd = (a, b) => a + rng() * (b - a);

  // 1) 基底：中低明度土石地面（近黑会让整帧 88% 像素挤在最暗一格）
  g.fillStyle = PAL.groundBase;
  g.fillRect(0, 0, W, H);

  // 2) 冷环境光：斜上方月光，把暗部推成青蓝而不是纯黑 —— 冷暖对比的一半
  const amb = g.createLinearGradient(W * 0.12, 0, W * 0.88, H);
  amb.addColorStop(0, PAL.ambientTop);
  amb.addColorStop(0.42, PAL.ambientMid);
  amb.addColorStop(1, PAL.ambientBot);
  g.fillStyle = amb;
  g.fillRect(0, 0, W, H);

  // 3) 大尺度明暗：多倍频噪声（取代原来 38 个随机椭圆）。噪声没有可辨认的形状。
  //    alpha 不能高：太强会把整场糊成一层"水洗感"，也会盖掉区块之间的明度差（实测 0.55 就过头了）
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.34;
  g.drawImage(noiseCanvas(Math.max(24, Math.round(W / 8)), Math.max(16, Math.round(H / 8)), rng, 5, 3),
              0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // 4) 预制区块随机拼接（区块自带用途与结构）
  const S = CHUNK_SIZE;
  const cols = Math.max(1, Math.ceil(W / S)), rows = Math.max(1, Math.ceil(H / S));
  const kinds = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) kinds.push(chunkKind(rng, cx, cy, cols, rows));
  kinds.forEach((k, i) => drawChunk(g, k, (i % cols) * S, ((i / cols) | 0) * S, S, rng));

  // 5) 接缝：整场只沿一个"浇筑方向"、间距不等。
  //    等距网格读数像坐标纸/瓷砖缝（人造参考线的语言），必须避免 —— 这里刻意用不等间距。
  const vertical = rng() < 0.5;
  let p = rnd(0.4, 0.9) * S;
  const span = vertical ? W : H;
  while (p < span) {
    if (vertical) drawJoint(g, p, 0, p, H, rnd(1.6, 2.8));
    else drawJoint(g, 0, p, W, p, rnd(1.6, 2.8));
    p += rnd(0.75, 1.6) * S;
  }

  // 6) 裂缝：整体沿接缝走向（共享方向），不穿块
  for (let i = 0; i < 26; i++) {
    let x = rnd(0, W), y = rnd(0, H);
    let a = (vertical ? Math.PI / 2 : 0) + rnd(-0.35, 0.35);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      a += rnd(-0.5, 0.5);
      x += Math.cos(a) * rnd(18, 52); y += Math.sin(a) * rnd(18, 52);
      g.lineTo(x, y);
    }
    g.strokeStyle = PAL.jointDark; g.lineWidth = 1.1; g.stroke();
    g.strokeStyle = PAL.jointLight; g.lineWidth = 0.5; g.stroke();
  }

  // 7) 细颗粒：低分辨率噪声放大 + 少量水膜亮点（高光只给"水"，不给石头）
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.20;
  g.drawImage(noiseCanvas(Math.max(32, Math.round(W / 6)), Math.max(20, Math.round(H / 6)), rng, 2, 2),
              0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) {
    g.fillStyle = hexA('#dceaff', +rnd(0.05, 0.16).toFixed(3));
    const s = rnd(1, 2.4);
    g.fillRect(rnd(0, W), rnd(0, H), s, s * rnd(1, 2.6));
  }

  // 8) 静态光池：光让"结构"被看见，是最便宜的高级感来源（两三处，别铺满）。
  //    每处给一个小的亮芯 —— 灯在水面上的反射点，也是地面唯一能进高光区的暖色。
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const lx = rnd(W * 0.12, W * 0.88), ly = rnd(H * 0.12, H * 0.88), lr = rnd(210, 330);
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, lr);
    lg.addColorStop(0, hexA(PAL.keyLight, 0.11));
    lg.addColorStop(0.55, hexA(PAL.keyLight, 0.05));
    lg.addColorStop(1, hexA(PAL.keyLight, 0));
    g.fillStyle = lg;
    g.beginPath(); g.arc(lx, ly, lr, 0, 7); g.fill();
    const core = g.createRadialGradient(lx, ly, 0, lx, ly, 30);
    core.addColorStop(0, hexA('#fff2d0', 0.40));
    core.addColorStop(1, hexA('#fff2d0', 0));
    g.fillStyle = core;
    g.beginPath(); g.arc(lx, ly, 30, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  // 8.5) 整体压暗：地块填充本身带明度，不压这一层地面中调就会被抬高，
  //      实体分离比随之下降（实测 3.34→3.07）。结构靠边与缝读，不靠亮。
  g.fillStyle = 'rgba(8,11,8,0.10)';
  g.fillRect(0, 0, W, H);

  // 9) 场地边缘压暗：把可玩区域"框"出来，僵尸从暗处逼近的感觉也来自这里
  const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30,
                                      W / 2, H / 2, Math.max(W, H) * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(4,7,12,0.34)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);

  // 合成层：render 每帧只 blit 这一张
  if (!ground) ground = document.createElement('canvas');
  if (ground.width !== gw || ground.height !== gh) { ground.width = gw; ground.height = gh; }
  groundCtx = ground.getContext('2d');
  groundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  compositeGround();
}

// 地形 + 当前全部贴花 → 地面纹理。贴花透明度按年龄计算，实现「久留但会消失」。
function compositeGround() {
  groundCtx.globalAlpha = 1;
  groundCtx.drawImage(groundBase, 0, 0, W, H);
  for (const s of stains) paintStain(groundCtx, s, stainFade(s));
}

// 贴花透明度系数：满色存活到 (STAIN_LIFE - STAIN_FADE)，之后线性淡出到 0
function stainFade(s) {
  const age = gameT - s.born;
  const hold = STAIN_LIFE - STAIN_FADE;
  if (age <= hold) return 1;
  return clamp((STAIN_LIFE - age) / STAIN_FADE, 0, 1);
}

// 血迹/焦痕：产生时立即画进合成层，另外按年龄定期重建以实现淡出
function paintStain(g, s, k) {
  const scald = s.col === PAL.scald;
  // 暗色外圈 + 亮色中心：在提亮后的地面上才有体积感
  g.globalAlpha = (scald ? 0.75 : 0.5) * k;
  g.fillStyle = s.col || PAL.bloodDark;
  g.beginPath();
  g.ellipse(s.x, s.y, s.r, s.r * 0.72, 0, 0, 7);
  g.fill();
  if (!scald) {
    g.globalAlpha = 0.42 * k;
    g.fillStyle = PAL.blood;
    g.beginPath();
    g.ellipse(s.x, s.y, s.r * 0.6, s.r * 0.42, 0, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
}
function addStain(x, y, r, col) {
  const s = { x, y, r, col, born: gameT };
  stains.push(s);
  if (stains.length > CAP.stains) stains.splice(0, stains.length - CAP.stains);
  if (groundCtx) paintStain(groundCtx, s, 1);   // 立刻可见，不必等下一次合成
}
// 暗角预渲染成一张画布：逐帧现算径向渐变 + 全屏填充在软件光栅下明显更贵
function buildVignette() {
  const dpr = window.devicePixelRatio || 1;
  vigCanvas = document.createElement('canvas');
  vigCanvas.width = Math.ceil(W * dpr); vigCanvas.height = Math.ceil(H * dpr);
  const g = vigCanvas.getContext('2d');
  g.scale(dpr, dpr);
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, hexA(PAL.vignette, 0));
  vg.addColorStop(0.55, hexA(PAL.vignette, 0.18));
  vg.addColorStop(1, hexA(PAL.vignette, 0.66));
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
}

// 十二种杂兵的俯视人形绘装：斜方肩甲 + 前伸抓臂 + 前后迈步的短腿 + 顶视头颅
// 精灵一律按「面朝 -Y」绘制，渲染时整体 rotate 旋向玩家（主角同此约定）
/* ===== 精灵绘制 =====
   全部预渲染，逐帧只做一次 drawImage。统一光照假设：主光在左上、冷环境光在四周 ——
   受光面、边缘光、接触阴影都遵守它，十二种僵尸与主角才像在同一个场景里。
   形体的可读性靠「硬边路径 + 明度分层（暗底 / 中间调 / 顶面 / 硬边高光）」，不靠细节：
   实际显示尺寸只有 28–48px，软渐变叠软渐变只会糊成一坨（旧的体积渐变圆叠圆就是这样）。 */

// 统一的精灵后处理（烘焙，逐帧零开销）：八向深描边把实体从地面里拉出来，
// 偏移的彩色轮廓作为边缘光交代光源方向。destination-over 逐层下沉，
// 自下而上为：八向描边 → 边缘光 → 主体。
function finishSprite(src, rimCol, dpr) {
  const fin = document.createElement('canvas');
  fin.width = src.width; fin.height = src.height;
  const fg = fin.getContext('2d');
  fg.drawImage(src, 0, 0);
  fg.globalCompositeOperation = 'destination-over';
  fg.drawImage(tintSilhouette(src, rimCol), -2 * dpr, -2 * dpr);
  const outline = tintSilhouette(src, PAL.outline);
  // 描边从 1.6px 加粗到 2.6px：这是实体从地面里跳出来最直接的杠杆。
  // 比压暗地图正确得多 —— 压暗地面是在牺牲地图换对比度，加粗描边不牺牲任何东西。
  for (let o = 0; o < 12; o++) {
    const oa = o * Math.PI / 6;
    fg.drawImage(outline, Math.cos(oa) * 2.6 * dpr, Math.sin(oa) * 2.6 * dpr);
  }
  return fin;
}

// 一帧僵尸姿态。ph ∈ [0,1) 是行走相位：双腿交替迈步、双臂前后摆、躯干起伏侧倾。
// 此前只有疾跑者推进 wob，其余六种僵尸完全没有行走动画，只是在滑行 —— 这是最大的观感缺口。
// 眼部发光强度：把"发光"当稀缺资源用 —— 普通杂兵只留暗眼窝里一点微光，
// 精英与 Boss 才给足红光。旧版所有僵尸都是两个高饱和大红眼 + 一张大嘴，那是表情包语法。
const EYE_GLOW = {
  normal: 0.22, runner: 0.18, spitter: 0.28, bloater: 0.16, shielder: 0.55, screamer: 0.50,
  brute: 0.62, splitter: 0.34, leaper: 0.40, revenant: 0.46, spore: 0.26, half: 0.18
};
function drawZombiePose(g, type, R, ph, S2, det) {
  const col = ZDEF[type].col;
  const skin = shade(col, 0.40);
  const skinDk = shade(col, 0.16);
  const cloth = shade(col, -0.04);
  const cx = S2, cy = S2;
  const X = v => cx + v * R, Y = v => cy + v * R;

  // 体型 + 姿态：lean 为前倾量（疾跑者前扑、装甲者顶盾、尖啸者后仰）
  // 头要小、臂要短而外扩 —— 头大 + 细长臂贴着脑袋是小尺寸下"像表情包"的主因
  let torsoW = 0.78, torsoH = 0.72, armLen = 0.90, armW = 0.34, headR = 0.34, headY = -0.56;
  let aL = 0.44, aR = 0.52, fistR = 0.19, lean = 0;
  if (type === 'runner')   { torsoW = 0.56; torsoH = 0.74; armLen = 0.62; armW = 0.26; headR = 0.32; headY = -0.66; aL = 0.48; aR = 0.56; lean = -0.12; }
  if (type === 'bloater')  { torsoW = 0.98; torsoH = 0.92; armLen = 0.70; armW = 0.34; headR = 0.30; headY = -0.50; aL = 0.46; aR = 0.52; }
  if (type === 'brute')    { torsoW = 1.02; torsoH = 0.80; armLen = 0.95; armW = 0.50; headR = 0.28; headY = -0.52; aL = 0.52; aR = 0.60; fistR = 0.28; lean = -0.04; }
  if (type === 'screamer') { torsoW = 0.62; headR = 0.34; headY = -0.62; aL = 0.48; aR = 0.52; lean = 0.06; }
  if (type === 'spitter')  { torsoW = 0.80; headR = 0.32; headY = -0.54; }
  if (type === 'shielder') { torsoW = 0.72; headR = 0.32; headY = -0.54; lean = -0.04; }
  // 第二轮扩充的杂兵：体型也要能一眼区分，不能只靠颜色
  if (type === 'splitter') { torsoW = 1.05; torsoH = 0.80; armLen = 0.70; armW = 0.34; headR = 0.30; headY = -0.42; aL = 0.36; aR = 0.44; lean = 0.02; }
  if (type === 'leaper')   { torsoW = 0.80; torsoH = 0.58; armLen = 0.55; armW = 0.26; headR = 0.34; headY = -0.44; aL = 0.40; aR = 0.48; lean = -0.20; }
  if (type === 'revenant') { torsoW = 0.64; torsoH = 0.86; armLen = 1.00; armW = 0.24; headR = 0.36; headY = -0.58; aL = 0.72; aR = 0.44; lean = 0.05; }
  if (type === 'spore')    { torsoW = 1.00; torsoH = 0.86; armLen = 0.52; armW = 0.32; headR = 0.26; headY = -0.40; aL = 0.32; aR = 0.38; lean = 0.03; }
  // Boss：更宽更厚的躯干、更小的头，靠体型一眼分辨
  if (type === 'butcher')  { torsoW = 1.18; torsoH = 0.78; armLen = 1.05; armW = 0.55; headR = 0.30; headY = -0.44; aL = 0.46; aR = 0.56; fistR = 0.34; lean = -0.06; }
  if (type === 'brood')    { torsoW = 1.02; torsoH = 0.95; armLen = 0.70; armW = 0.38; headR = 0.44; headY = -0.50; aL = 0.48; aR = 0.56; lean = 0.04; }
  // 冲撞者：低伏前倾的野兽轮廓，头压得很低，肩特别厚
  if (type === 'charger')  { torsoW = 1.10; torsoH = 0.66; armLen = 0.86; armW = 0.52; headR = 0.30; headY = -0.30; aL = 0.40; aR = 0.52; fistR = 0.30; lean = -0.16; }
  // 迫击者：矮壮的炮台体型，手臂很短（它不靠手打）
  if (type === 'mortar')   { torsoW = 1.00; torsoH = 0.86; armLen = 0.52; armW = 0.40; headR = 0.28; headY = -0.54; aL = 0.30; aR = 0.36; lean = 0.02; }
  // 纳尸者：瘦高、长臂，肩窄 —— 和另外几只的"厚"形成对比
  if (type === 'necro')    { torsoW = 0.62; torsoH = 0.94; armLen = 1.42; armW = 0.24; headR = 0.34; headY = -0.60; aL = 0.44; aR = 0.52; lean = -0.03; }

  // 左右腿各用一个相位（相差 π）。不能只用一个 sin(ph) —— 它关于半周期对称，
  // 会让第 0 帧与第 2 帧完全相同，4 帧里只有 2 个不同的姿势。
  const pL = ph * TAU, pR = pL + Math.PI;
  const lFwd = Math.cos(pL), rFwd = Math.cos(pR);   // ±1：该腿在前 / 在后
  const lUp = Math.max(0, Math.sin(pL));            // 摆动期抬脚
  const rUp = Math.max(0, Math.sin(pR));
  const bob = Math.abs(Math.cos(pL));               // 双腿并拢时躯干最高
  const sway = Math.sin(pL) * 0.05;                 // 左右侧倾

  // 1) 双腿：俯视角只看得到一小截在身侧前后迈步（-Y 是"前"）；抬脚项保证 4 帧互不相同
  const legW = Math.max(0.13, torsoW * 0.20);
  for (const [sx, st, up] of [[-torsoW * 0.42, lFwd, lUp], [torsoW * 0.42, rFwd, rUp]]) {
    g.fillStyle = shade(col, -0.46);
    rr(g, X(sx + sway) - R * legW, Y(0.30 + st * 0.26 - up * 0.10),
       R * legW * 2, R * (0.60 - up * 0.12), R * legW * 0.8);
    g.fill();
  }

  // 2) 躯干：硬边路径（肩宽 → 后收），暗底 + 受光面两级明度。
  //    旧版是一颗软渐变椭圆，与头、手臂同明度 —— 缩到 30px 就糊成一坨。
  const ty = 0.12 - bob * 0.05 + lean;
  const halfW = torsoW * 0.52, backY = ty + torsoH * 0.62;
  const torsoPath = () => {
    g.beginPath();
    g.moveTo(X(-halfW * 1.12), Y(ty - torsoH * 0.52));
    g.lineTo(X(halfW * 1.12), Y(ty - torsoH * 0.52));
    g.lineTo(X(halfW), Y(backY - 0.10));
    g.quadraticCurveTo(cx, Y(backY + 0.10), X(-halfW), Y(backY - 0.10));
    g.closePath();
  };
  g.fillStyle = cloth;
  torsoPath(); g.fill();
  g.fillStyle = shade(col, 0.02);                        // 受光面（略小、偏前）
  g.beginPath();
  g.moveTo(X(-halfW * 0.92), Y(ty - torsoH * 0.46));
  g.lineTo(X(halfW * 0.92), Y(ty - torsoH * 0.46));
  g.lineTo(X(halfW * 0.78), Y(ty + torsoH * 0.16));
  g.quadraticCurveTo(cx, Y(ty + torsoH * 0.40), X(-halfW * 0.78), Y(ty + torsoH * 0.16));
  g.closePath(); g.fill();
  // 破洞与血污：裁进躯干路径里，避免"贴在身上"的浮空感
  g.save();
  torsoPath(); g.clip();
  for (const tt of det.tatters) {
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.beginPath();
    g.ellipse(cx + tt[0] * R * torsoW, Y(ty + tt[1]), R * tt[2], R * tt[3], tt[4], 0, 7);
    g.fill();
  }
  g.fillStyle = 'rgba(96,16,16,0.75)';                   // 血污：不受光的高饱和暗红
  g.beginPath(); g.ellipse(cx + R * 0.08, Y(ty + torsoH * 0.30), R * 0.20, R * 0.12, 0.3, 0, 7); g.fill();
  g.restore();

  // 3) 肩：两块外扩的斜方板 —— 和主角同一套语言，俯视角下最强的识别形状
  for (const sgn of [-1, 1]) {
    g.fillStyle = shade(col, -0.18);
    g.beginPath();
    g.moveTo(X(sgn * halfW * 0.80), Y(ty - torsoH * 0.56));
    g.lineTo(X(sgn * (halfW + 0.22)), Y(ty - torsoH * 0.30));
    g.lineTo(X(sgn * (halfW + 0.16)), Y(ty + torsoH * 0.12));
    g.lineTo(X(sgn * halfW * 0.78), Y(ty - torsoH * 0.02));
    g.closePath(); g.fill();
  }

  // 4) 双臂：短、粗、外扩，手落在身前。旧版是两根细长杆贴着脑袋两侧伸出去、
  //    末端还挂一个亮球 —— 小尺寸下读成"兔耳/钳子"，这是"像表情包"的主因之一。
  const swL = -lFwd * 0.16, swR = -rFwd * 0.16;
  const shY = ty - torsoH * 0.34;
  const reach = Math.min(armLen, 0.95);
  for (const [sgn, sw, ax] of [[-1, swL, aL], [1, swR, aR]]) {
    g.strokeStyle = skinDk; g.lineCap = 'round';
    g.lineWidth = R * (armW * 1.9);
    g.beginPath();
    g.moveTo(X(sgn * (halfW + 0.06)), Y(shY));
    g.lineTo(X(sgn * (ax + 0.20)), Y(shY - reach * 0.45));
    g.stroke();
    g.lineWidth = R * (armW * 1.5);
    g.beginPath();
    g.moveTo(X(sgn * (ax + 0.20)), Y(shY - reach * 0.45));
    g.lineTo(X(sgn * (ax + 0.06)), Y(shY - reach + sw));
    g.stroke();
    g.fillStyle = skinDk;                                // 手：暗一档，别在场上读成亮球
    g.beginPath(); g.arc(X(sgn * (ax + 0.06)), Y(shY - reach + sw), R * fistR * 0.85, 0, 7); g.fill();
  }

  // 5) 头：俯视角看到的是颅顶。外圈一圈更暗的边，把头从躯干上"切"出来 ——
  //    旧版头几乎压在躯干上又是同明度，两个球糊在一起。
  //    五官改成暗眼窝 + 一点昏暗红光；发光留给精英/Boss，普通怪不再是大红眼 + 大嘴。
  const hx = cx + sway * R * 0.9, hy = Y(headY + lean - bob * 0.03);
  g.fillStyle = shade(col, -0.50);                       // 颅骨外圈：把头从躯干上"切"出来
  g.beginPath(); g.arc(hx, hy, R * headR * 1.10, 0, 7); g.fill();
  g.fillStyle = cloth;                                   // 头不能用提亮色，否则场上读成一颗发白的球
  g.beginPath(); g.arc(hx, hy, R * headR, 0, 7); g.fill();
  g.fillStyle = shade(col, 0.18);                        // 颅顶受光（偏左上）
  g.beginPath(); g.arc(hx - R * headR * 0.16, hy - R * headR * 0.16, R * headR * 0.60, 0, 7); g.fill();
  const gl = ZDEF[type].boss ? 0.9 : (EYE_GLOW[type] !== undefined ? EYE_GLOW[type] : 0.3);
  for (const sgn of [-1, 1]) {
    g.fillStyle = 'rgba(12,10,8,0.78)';                  // 眼窝
    g.beginPath();
    g.ellipse(hx + sgn * R * headR * 0.42, hy - R * headR * 0.34, R * headR * 0.24, R * headR * 0.17, 0, 0, 7);
    g.fill();
    if (gl > 0.05) {
      g.fillStyle = 'rgba(255,86,58,' + gl * 0.30 + ')';
      g.beginPath(); g.arc(hx + sgn * R * headR * 0.42, hy - R * headR * 0.34, R * headR * 0.26, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,124,92,' + gl + ')';
      g.beginPath();
      g.arc(hx + sgn * R * headR * 0.42, hy - R * headR * 0.34, Math.max(1, R * headR * 0.12), 0, 7);
      g.fill();
    }
  }
  g.fillStyle = 'rgba(24,12,10,0.55)';                   // 颌下阴影：窄而小（旧版是一张大嘴）
  g.beginPath();
  g.ellipse(hx, hy + R * headR * 0.62, R * headR * 0.30, R * headR * 0.14, 0, 0, 7);
  g.fill();
  g.fillStyle = 'rgba(86,13,13,0.80)';                   // 颈部创伤
  g.beginPath(); g.ellipse(hx, hy + R * headR * 1.02, R * headR * 0.34, R * headR * 0.18, 0, 0, 7); g.fill();

  // 5) 类型专属细节
  if (type === 'shielder') {
    // 金属盾：顶在身前，带渐变与铆钉
    g.save();
    g.translate(X(0.28), Y(-0.92 + lean));
    g.rotate(-0.12 + sway * 2);
    const sh = g.createLinearGradient(0, -R * 0.18, 0, R * 0.28);
    sh.addColorStop(0, '#a8b2ae'); sh.addColorStop(0.5, '#7d8781'); sh.addColorStop(1, '#565e59');
    g.fillStyle = sh;
    g.fillRect(-R * 0.58, -R * 0.18, R * 1.16, R * 0.46);
    g.strokeStyle = 'rgba(28,33,30,0.9)'; g.lineWidth = 1.6;
    g.strokeRect(-R * 0.58, -R * 0.18, R * 1.16, R * 0.46);
    g.fillStyle = 'rgba(255,255,255,0.24)';
    g.fillRect(-R * 0.52, -R * 0.14, R * 1.04, R * 0.06);
    g.fillStyle = '#4a524d';
    for (const rv of [-0.34, 0, 0.34]) { g.beginPath(); g.arc(rv * R, R * 0.06, 1.7, 0, 7); g.fill(); }
    g.restore();
  } else if (type === 'bloater') {
    // 脓疱：位置取自 det（预先算好），否则 4 帧之间会乱跳
    for (const bp of det.pustules) {
      const bx = cx + bp[0] * R * 0.62, by = Y(ty + bp[1] * 0.5), br = R * bp[2];
      const bg = g.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
      bg.addColorStop(0, 'rgba(216,232,126,0.92)');
      bg.addColorStop(0.62, 'rgba(138,158,62,0.6)');
      bg.addColorStop(1, 'rgba(120,140,60,0)');
      g.fillStyle = bg;
      g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(38,24,10,0.55)'; g.lineWidth = R * 0.05;
    g.beginPath();
    g.moveTo(cx - R * 0.20, Y(ty + 0.20));
    g.quadraticCurveTo(cx + R * 0.05, Y(ty + 0.04), cx - R * 0.08, Y(ty - 0.22));
    g.stroke();
  } else if (type === 'spitter') {
    // 鼓胀的酸囊
    const sg = g.createRadialGradient(cx - R * 0.12, Y(ty - 0.12), 0, cx, Y(ty - 0.02), R * 0.46);
    sg.addColorStop(0, 'rgba(226,252,142,0.88)');
    sg.addColorStop(1, 'rgba(126,168,44,0.35)');
    g.fillStyle = sg;
    g.beginPath(); g.ellipse(cx, Y(ty - 0.02), R * 0.42, R * 0.34, 0, 0, 7); g.fill();
  } else if (type === 'screamer') {
    // 张嘴尖啸
    g.fillStyle = '#21091a';
    g.beginPath(); g.ellipse(hx, hy - R * headR * 0.52, R * headR * 0.42, R * headR * 0.34, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,132,198,0.75)'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(hx, hy - R * headR * 0.52, R * headR * 0.52, R * headR * 0.44, 0, 0, 7); g.stroke();
  } else if (type === 'brute') {
    // 背脊骨板：暗沟 + 亮棱
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = R * 0.10;
    g.beginPath(); g.arc(cx, Y(ty + 0.10), R * 0.55, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.strokeStyle = 'rgba(228,238,208,0.16)'; g.lineWidth = R * 0.035;
    g.beginPath(); g.arc(cx - R * 0.05, Y(ty + 0.06), R * 0.80, Math.PI * 1.20, Math.PI * 1.80); g.stroke();
  } else if (type === 'splitter') {
    // 中缝：一道纵向裂口 + 里面透出的亮色，暗示「它随时会裂成两半」
    g.fillStyle = 'rgba(30,16,44,0.5)';
    g.beginPath(); g.ellipse(cx, Y(ty + 0.04), R * 0.06, R * 0.40, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(226,206,255,0.5)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(cx, Y(ty - 0.30)); g.lineTo(cx, Y(ty + 0.34)); g.stroke();
    // 脓疱的位置沿用 det（预生成），否则 4 帧之间会乱跳
    for (const bp of det.pustules.slice(0, 4)) {
      g.fillStyle = 'rgba(232,214,255,0.55)';
      g.beginPath(); g.arc(cx + bp[0] * R * 0.52, Y(ty + bp[1] * 0.46), R * bp[2] * 0.9, 0, 7); g.fill();
    }
  } else if (type === 'leaper') {
    // 折叠的后腿 + 前伸的爪：静态剪影就读得出「它能弹出去」
    // 注意所有横坐标都要走 X()：直接写 sgn*R*… 会画到画布左边缘去（踩过）
    g.strokeStyle = skinDk; g.lineWidth = R * 0.16; g.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      g.beginPath();
      g.moveTo(X(sgn * 0.26), Y(ty + 0.44));
      g.lineTo(X(sgn * 0.56), Y(ty + 0.18));
      g.lineTo(X(sgn * 0.30), Y(ty - 0.02));
      g.stroke();
    }
    g.fillStyle = 'rgba(255,232,180,0.85)';
    for (const sgn of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bx = X(sgn * (0.30 + k * 0.11)), by = Y(ty + 0.02 - k * 0.03);
        g.beginPath(); g.moveTo(bx, by);
        g.lineTo(bx + sgn * R * 0.10, by - R * 0.08);
        g.lineTo(bx + sgn * R * 0.03, by + R * 0.03);
        g.closePath(); g.fill();
      }
    }
  } else if (type === 'revenant') {
    // 半腐的胸腔：露出的肋骨 + 一处发亮的复生痕迹
    g.fillStyle = 'rgba(58,30,22,0.85)';
    g.beginPath(); g.ellipse(cx, Y(ty + 0.02), R * 0.30, R * 0.26, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(226,208,186,0.75)'; g.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(cx - R * 0.26, Y(ty - 0.08 + k * 0.10));
      g.quadraticCurveTo(cx, Y(ty - 0.04 + k * 0.10), cx + R * 0.26, Y(ty - 0.08 + k * 0.10));
      g.stroke();
    }
    g.fillStyle = 'rgba(255,170,110,0.55)';
    g.beginPath(); g.arc(cx, Y(ty + 0.02), R * 0.13, 0, 7); g.fill();
  } else if (type === 'spore') {
    // 背上的孢子囊：一堆发光鼓包（它就是靠这个在治疗尸群）
    for (const bp of det.pustules) {
      const bx = cx + bp[0] * R * 0.60, by = Y(ty + bp[1] * 0.46), br = R * bp[2] * 1.25;
      const sg = g.createRadialGradient(bx, by, 0, bx, by, br);
      sg.addColorStop(0, 'rgba(210,255,225,0.9)');
      sg.addColorStop(0.6, 'rgba(96,196,150,0.55)');
      sg.addColorStop(1, 'rgba(60,150,110,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
    }
  } else if (type === 'normal') {
    // 肩部撕裂伤
    g.fillStyle = 'rgba(78,13,13,0.85)';
    g.beginPath(); g.ellipse(X(-torsoW * 0.34), Y(ty - 0.06), R * 0.13, R * 0.10, 0, 0, 7); g.fill();
    g.fillStyle = '#390c0c';
    g.beginPath(); g.arc(X(-torsoW * 0.34), Y(ty - 0.06), R * 0.06, 0, 7); g.fill();
  } else if (type === 'butcher') {
    // 屠夫：肩部骨刺 + 血盆大口
    g.fillStyle = '#d8cbb4';
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bxp = cx + sx * (0.70 + k * 0.15) * R, byp = Y(ty - 0.30 - k * 0.05);
        g.beginPath();
        g.moveTo(bxp, byp + R * 0.16);
        g.lineTo(bxp + sx * R * 0.10, byp - R * 0.24);
        g.lineTo(bxp + sx * R * 0.19, byp + R * 0.14);
        g.closePath(); g.fill();
      }
    }
    g.fillStyle = '#2a0b0b';
    g.beginPath(); g.ellipse(hx, hy - R * headR * 0.32, R * headR * 0.72, R * headR * 0.34, 0, 0, 7); g.fill();
    g.fillStyle = '#e8dcc6';
    for (const tx of [-0.34, 0.34]) {
      g.beginPath();
      g.moveTo(hx + tx * R * headR, hy - R * headR * 0.5);
      g.lineTo(hx + tx * R * headR * 0.7, hy - R * headR * 0.06);
      g.lineTo(hx + tx * R * headR * 1.25, hy - R * headR * 0.02);
      g.closePath(); g.fill();
    }
  } else if (type === 'brood') {
    // 腐化母体：发光的孵化囊 + 紫色脉纹
    const sg2 = g.createRadialGradient(cx - R * 0.15, Y(ty - 0.05), 0, cx, Y(ty + 0.05), R * 0.76);
    sg2.addColorStop(0, 'rgba(232,158,255,0.92)');
    sg2.addColorStop(0.6, 'rgba(152,72,192,0.6)');
    sg2.addColorStop(1, 'rgba(90,40,120,0)');
    g.fillStyle = sg2;
    g.beginPath(); g.ellipse(cx, Y(ty + 0.05), R * 0.68, R * 0.58, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,180,255,0.5)'; g.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(cx + Math.cos(k * 1.57) * R * 0.32, Y(ty + 0.05) + Math.sin(k * 1.57) * R * 0.27, R * 0.17, 0, 7);
      g.stroke();
    }
  } else if (type === 'charger') {
    // 冲撞者：额前一根独角 + 背脊骨刺 + 低垂的头，一眼看出"它是拿来撞的"
    g.fillStyle = '#efe3cd';
    g.beginPath();
    g.moveTo(hx + R * headR * 0.1, hy - R * headR * 0.95);
    g.lineTo(hx + R * headR * 1.65, hy - R * headR * 1.15);
    g.lineTo(hx + R * headR * 0.4, hy - R * headR * 0.35);
    g.closePath(); g.fill();
    g.fillStyle = '#c9b79a';
    for (let k = 0; k < 4; k++) {
      const bx2 = cx - (0.28 + k * 0.20) * R, by2 = Y(ty - 0.16 - k * 0.03);
      g.beginPath();
      g.moveTo(bx2, by2 + R * 0.12);
      g.lineTo(bx2 - R * 0.06, by2 - R * 0.22);
      g.lineTo(bx2 + R * 0.14, by2 + R * 0.10);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#3a1206';                 // 发红的眼
    g.beginPath(); g.arc(hx, hy - R * headR * 0.12, R * 0.075, 0, 7); g.fill();
  } else if (type === 'mortar') {
    // 迫击者：背上一根粗炮管 + 弹带 —— 它不靠手打，靠抛射
    g.fillStyle = '#4b5426';
    g.fillRect(cx - R * 0.16, Y(ty - 0.62), R * 0.34, R * 0.92);
    g.fillStyle = '#6d7838';
    g.fillRect(cx - R * 0.12, Y(ty - 0.60), R * 0.18, R * 0.86);
    g.fillStyle = '#2b3116';
    g.beginPath(); g.ellipse(cx + R * 0.01, Y(ty - 0.62), R * 0.15, R * 0.07, 0, 0, 7); g.fill();
    g.fillStyle = '#c9a24a';                 // 弹带上的三发
    for (let k = 0; k < 3; k++) {
      g.beginPath(); g.arc(cx - R * 0.52 + k * R * 0.16, Y(ty + 0.30), R * 0.07, 0, 7); g.fill();
    }
  } else if (type === 'necro') {
    // 纳尸者：胸腔里一颗跳动着的魂核 + 周身游丝
    const ng = g.createRadialGradient(cx, Y(ty - 0.02), 0, cx, Y(ty - 0.02), R * 0.46);
    ng.addColorStop(0, 'rgba(210,255,235,0.95)');
    ng.addColorStop(0.5, 'rgba(80,220,180,0.55)');
    ng.addColorStop(1, 'rgba(40,120,100,0)');
    g.fillStyle = ng;
    g.beginPath(); g.arc(cx, Y(ty - 0.02), R * 0.42, 0, 7); g.fill();
    g.strokeStyle = 'rgba(150,255,220,0.55)'; g.lineWidth = 1.3;
    for (let k = 0; k < 3; k++) {
      const a2 = k * 2.1 + 0.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a2) * R * 0.5, Y(ty + 0.1) + Math.sin(a2) * R * 0.42);
      g.quadraticCurveTo(cx + Math.cos(a2) * R * 0.86, Y(ty - 0.1) + Math.sin(a2) * R * 0.66,
                         cx + Math.cos(a2 + 0.8) * R * 0.62, Y(ty - 0.28) + Math.sin(a2 + 0.8) * R * 0.5);
      g.stroke();
    }
  }
}

// 主角一帧：面朝 -Y。装甲躯干 + 肩甲 + 背包 + 前伸持枪的双臂 + 面罩头盔。
// 边缘光用暖色（敌人用冷色），把主角与尸群在色彩上区分开。
function drawHeroPose(g, R, ph, S2) {
  const col = PAL.heroCol;
  const cx = S2, cy = S2;
  const X = v => cx + v * R, Y = v => cy + v * R;
  // 精灵一律按「朝 -Y」绘制，游戏内再 rotate(a+π/2) 把 -Y 对齐到朝向。所以这里的
  // -Y 就是"前"、+Y 是"后"，迈步也是沿 Y（前后）而不是左右摆。
  const pL = ph * TAU, pR = pL + Math.PI;
  const stepL = Math.cos(pL), stepR = Math.cos(pR);
  // 抬脚项不能省：cos 关于半周期对称，只用它会第 1 帧与第 3 帧完全一样（4 帧只剩 2 个姿势）
  const upL = Math.max(0, Math.sin(pL)), upR = Math.max(0, Math.sin(pR));
  const bob = Math.abs(Math.cos(pL));
  // 四级明度：暗底 / 中间调 / 顶面 / 硬边高光。小尺寸下可读性靠这个，不靠细节。
  const base = shade(col, -0.34), top = shade(col, 0.06), hi = shade(col, 0.34), plate = shade(col, 0.16);
  const gear = '#2c3429', gearHi = '#3f4a3c';

  // 1) 腿：俯视角只看得到一小截在身侧前后迈步；抬脚的那一步收短一点
  for (const [sx, st, up] of [[-0.30, stepL, upL], [0.30, stepR, upR]]) {
    g.fillStyle = gear;
    rr(g, X(sx) - R * 0.17, Y(0.16 + st * 0.24 - up * 0.10), R * 0.34, R * (0.62 - up * 0.12), R * 0.15);
    g.fill();
  }

  // 2) 背包：肩后一块方硬块（先画，被躯干压住一部分）
  g.fillStyle = gear;
  rr(g, X(-0.42), Y(0.06), R * 0.84, R * 0.50, R * 0.12);
  g.fill();
  g.fillStyle = gearHi;
  rr(g, X(-0.42), Y(0.06), R * 0.84, R * 0.14, R * 0.07);
  g.fill();

  // 3) 躯干：硬边路径（肩宽→腰收）。暗底 + 受光面两级，比"处处软渐变"清楚得多
  g.fillStyle = base;
  g.beginPath();
  g.moveTo(X(-0.56), Y(-0.26));
  g.lineTo(X(0.56), Y(-0.26));
  g.lineTo(X(0.44), Y(0.30));
  g.quadraticCurveTo(cx, Y(0.54), X(-0.44), Y(0.30));
  g.closePath(); g.fill();
  g.fillStyle = top;
  g.beginPath();
  g.moveTo(X(-0.46), Y(-0.24 - bob * 0.02));
  g.lineTo(X(0.46), Y(-0.24 - bob * 0.02));
  g.lineTo(X(0.36), Y(0.16));
  g.quadraticCurveTo(cx, Y(0.34), X(-0.36), Y(0.16));
  g.closePath(); g.fill();
  g.fillStyle = hi;                                  // 胸甲：一条窄硬边高光面
  g.beginPath();
  g.moveTo(X(-0.30), Y(-0.22));
  g.lineTo(X(0.30), Y(-0.22));
  g.lineTo(X(0.22), Y(-0.02));
  g.lineTo(X(-0.22), Y(-0.02));
  g.closePath(); g.fill();

  // 4) 肩甲：俯视角最强的识别形状 —— 两块外扩的斜方板（有没有它，一眼差一档）
  for (const sgn of [-1, 1]) {
    g.fillStyle = base;
    g.beginPath();
    g.moveTo(X(sgn * 0.34), Y(-0.30));
    g.lineTo(X(sgn * 0.86), Y(-0.10));
    g.lineTo(X(sgn * 0.78), Y(0.22));
    g.lineTo(X(sgn * 0.32), Y(0.06));
    g.closePath(); g.fill();
    g.fillStyle = plate;
    g.beginPath();
    g.moveTo(X(sgn * 0.34), Y(-0.30));
    g.lineTo(X(sgn * 0.86), Y(-0.10));
    g.lineTo(X(sgn * 0.80), Y(0.02));
    g.lineTo(X(sgn * 0.34), Y(-0.16));
    g.closePath(); g.fill();
  }

  // 5) 双臂：从肩朝前伸、双手在身前合拢握枪。手指位置与 render 里画的枪同一条轴线
  for (const [sgn, st] of [[-1, stepL], [1, stepR]]) {
    g.strokeStyle = gearHi; g.lineCap = 'round';
    g.lineWidth = R * 0.32;                          // 大臂
    g.beginPath();
    g.moveTo(X(sgn * 0.56), Y(0.02 - st * 0.05));
    g.lineTo(X(sgn * 0.38), Y(-0.40));
    g.stroke();
    g.lineWidth = R * 0.26;                          // 小臂：收拢到枪身两侧
    g.beginPath();
    g.moveTo(X(sgn * 0.38), Y(-0.40));
    g.lineTo(X(sgn * 0.20), Y(-0.70));
    g.stroke();
    g.fillStyle = gear;                              // 手套：比手臂暗一档，端点才读得出来
    g.beginPath(); g.arc(X(sgn * 0.20), Y(-0.70), R * 0.15, 0, 7); g.fill();
  }

  // 6) 头：俯视角只看到盔顶（没有脸）。外面一圈更暗的盔檐，把头与躯干分开 ——
  //    旧版头几乎压在躯干上、又是同明度，两个球糊成一坨。
  const hy = Y(-0.60 - bob * 0.02);
  g.fillStyle = base;
  g.beginPath(); g.arc(cx, hy, R * 0.46, 0, 7); g.fill();
  g.fillStyle = shade(col, 0.18);
  g.beginPath(); g.arc(cx, hy, R * 0.37, 0, 7); g.fill();
  g.fillStyle = hi;
  g.beginPath(); g.arc(cx - R * 0.05, hy - R * 0.05, R * 0.26, 0, 7); g.fill();
  g.fillStyle = 'rgba(150,215,255,0.80)';            // 全身唯一的冷色强调：朝前的护目镜反光
  g.beginPath(); g.ellipse(cx, hy - R * 0.40, R * 0.19, R * 0.05, 0, 0, 7); g.fill();
  // 暖色记号：左肩一块小臂章。**不要**在头前画弧线 —— 试过，读起来像一张嘴，很显眼地难看。
  g.fillStyle = '#c8613a';
  rr(g, X(-0.80), Y(-0.06), R * 0.26, R * 0.16, R * 0.05);
  g.fill();
}

function buildSprites() {
  const dpr = window.devicePixelRatio || 1;

  for (const type of Object.keys(ZDEF)) {
    const R = ZDEF[type].r;
    const S2 = R * 1.75 + 6;             // 覆盖手臂前伸的最大半径
    // 随机细节先算一次供 4 帧共用，否则帧间会乱跳
    const det = { tatters: [], pustules: [] };
    for (let i = 0; i < 3; i++) det.tatters.push([rand(-0.6, 0.6), rand(-0.2, 0.45), rand(0.10, 0.20), rand(0.12, 0.24), rand(0, 6.28)]);
    for (let i = 0; i < 9; i++) det.pustules.push([rand(-0.55, 0.55), rand(-0.45, 0.45), rand(0.055, 0.115)]);

    const frames = [];
    for (let f = 0; f < WALK_FRAMES; f++) {
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(S2 * 2 * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      drawZombiePose(g, type, R, f / WALK_FRAMES, S2, det);
      frames.push(finishSprite(c, PAL.rim, dpr));
    }
    SPR[type] = { frames, half: S2 };
  }

  // 主角：与僵尸共用同一套绘制 / 描边 / 边缘光管线
  const HR = 15, HS2 = HR * 1.5 + 11;
  const hframes = [];
  for (let f = 0; f < WALK_FRAMES; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(HS2 * 2 * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    drawHeroPose(g, HR, f / WALK_FRAMES, HS2);
    hframes.push(finishSprite(c, PAL.heroRim, dpr));
  }
  SPR.hero = { frames: hframes, half: HS2 };

  SPR.glowWarm = makeGlow(96, 'rgba(255,236,180,0.9)', 'rgba(255,180,60,0)');
  SPR.glowRed  = makeGlow(48, 'rgba(255,90,60,0.9)', 'rgba(255,40,20,0)');
  SPR.glowSoft = makeGlow(64, 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)');
  SPR.glowCyan = makeGlow(64, 'rgba(126,200,255,0.75)', 'rgba(60,140,255,0)');
  SPR.shadow   = makeGlow(64, 'rgba(0,0,0,0.9)', 'rgba(0,0,0,0)');
  SPR.fog      = makeGlow(340, PAL.fog, 'rgba(172,198,222,0)');
  SPR.key      = makeGlow(300, hexA(PAL.keyLight, 0.6), hexA(PAL.keyLight, 0));
}
