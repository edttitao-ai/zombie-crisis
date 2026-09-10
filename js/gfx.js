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

function buildGround() {
  const dpr = window.devicePixelRatio || 1;
  const gw = Math.ceil(W * dpr), gh = Math.ceil(H * dpr);
  // 地形单独存一张「底图」：贴花要按年龄淡出就必须能重建，而地形本身是随机的、
  // 不能重绘（否则每次重建整片地面都会变样）。有了底图，重建只是 1 次整屏 blit
  // 加上重贴贴花，所以可以按秒级频率做。
  // 画布复用而不重建：新分配整屏画布实测把单次重建从 ~2ms 推到 ~10ms。
  if (!groundBase) groundBase = document.createElement('canvas');
  if (groundBase.width !== gw || groundBase.height !== gh) { groundBase.width = gw; groundBase.height = gh; }
  const g = groundBase.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);   // 用 setTransform：复用画布时 scale 会累积

  // 1) 基底：中低明度土石地面（原来近黑，整帧 88% 像素挤在最暗的一格里）
  g.fillStyle = PAL.groundBase;
  g.fillRect(0, 0, W, H);

  // 2) 冷环境光：斜上方月光，把暗部推成青蓝而不是纯黑 —— 冷暖对比的一半
  const amb = g.createLinearGradient(W * 0.12, 0, W * 0.88, H);
  amb.addColorStop(0, PAL.ambientTop);
  amb.addColorStop(0.42, PAL.ambientMid);
  amb.addColorStop(1, PAL.ambientBot);
  g.fillStyle = amb;
  g.fillRect(0, 0, W, H);

  // 3) 暖土斑：掺回暖调，避免整屏发蓝
  for (let i = 0; i < 24; i++) {
    g.fillStyle = hexA(PAL.warmPatch, +rand(0.05, 0.15).toFixed(3));
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(90, 300), rand(55, 190), rand(0, 3.2), 0, 7);
    g.fill();
  }

  // 4) 大块明暗：建立真正的高低差（原来只有 0.04–0.10，几乎看不出起伏）
  for (let i = 0; i < 38; i++) {
    g.fillStyle = Math.random() < 0.6 ? PAL.groundDark : PAL.groundLight;
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(50, 260), rand(36, 170), rand(0, 3.2), 0, 7);
    g.fill();
  }

  // 5) 裂缝：亮边 + 暗芯，读起来像真的裂开
  for (let i = 0; i < 30; i++) {
    let x = rand(0, W), y = rand(0, H), a = rand(0, 6.28);
    const pts = [[x, y]];
    for (let k = 0; k < 4; k++) {
      a += rand(-0.9, 0.9);
      x += Math.cos(a) * rand(16, 46); y += Math.sin(a) * rand(16, 46);
      pts.push([x, y]);
    }
    const trace = () => {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    };
    g.lineWidth = 2.6; g.strokeStyle = PAL.crackLight; trace();
    g.lineWidth = 1.0; g.strokeStyle = PAL.crackDark;  trace();
  }

  // 6) 碎屑暗粒 + 湿面反光点
  for (let i = 0; i < 420; i++) {
    g.fillStyle = Math.random() < 0.55 ? hexA('#000000', +rand(0.14, 0.30).toFixed(3)) : PAL.groundLight;
    const s = rand(1, 2.6);
    g.fillRect(rand(0, W), rand(0, H), s, s);
  }
  for (let i = 0; i < 46; i++) {
    g.fillStyle = hexA('#cfe4ff', +rand(0.06, 0.16).toFixed(3));
    const s = rand(1, 2.2);
    g.fillRect(rand(0, W), rand(0, H), s, s * rand(1, 3));
  }

  // 7) 湿地反光条纹
  for (let i = 0; i < 9; i++) {
    const x = rand(0, W), y = rand(0, H), len = rand(120, 380), ang = rand(-0.5, 0.5);
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const lg = g.createLinearGradient(x, y, ex, ey);
    lg.addColorStop(0, hexA('#bcd6f2', 0));
    lg.addColorStop(0.5, hexA('#bcd6f2', +rand(0.04, 0.09).toFixed(3)));
    lg.addColorStop(1, hexA('#bcd6f2', 0));
    g.strokeStyle = lg; g.lineWidth = rand(2, 6);
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
  }

  // 8) 细网格：压得很淡，只作尺度参考，不再像坐标纸
  g.strokeStyle = PAL.grid;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 64) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 0; y <= H; y += 64) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();

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

// 七种僵尸的俯视人形绘装：宽肩躯干 + 前伸抓臂 + 拖沓双腿 + 前倾头部
// 精灵面朝 -Y 绘制，渲染时整体旋向玩家
/* ===== 精灵绘制 =====
   全部预渲染，逐帧只做一次 drawImage。统一光照假设：主光在左上、冷环境光在四周 ——
   体积渐变、边缘光、接触阴影都遵守它，这样七种僵尸与主角看起来才像在同一个场景里。 */

// 径向渐变填充：中心偏亮、边缘偏暗，把平涂的椭圆变成有体积的形体。
// 渐变整体偏亮（中心 +0.50、边缘只暗到 -0.26）：若暗面过重会把实体的平均明度
// 压向地面，反而降低可辨识度 —— 体积感要，但不能靠整体压暗换。
function volumeEllipse(g, x, y, rx, ry, col, rot) {
  const grd = g.createRadialGradient(x - rx * 0.36, y - ry * 0.44, Math.max(0.5, rx * 0.10),
                                     x, y, Math.max(rx, ry) * 1.15);
  grd.addColorStop(0, shade(col, 0.50));
  grd.addColorStop(0.60, col);
  grd.addColorStop(1, shade(col, -0.26));
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot || 0, 0, 7);
  g.fill();
}

// 肢体：暗底 + 偏左上的亮芯 → 圆柱感（平涂圆头线段看起来是塑料棒）。
// 暗底不能压太狠：肢体在占实体面积的比例不小，暗底过重会整体拉低实体明度。
function volumeLimb(g, x0, y0, mx, my, x1, y1, w, col) {
  g.lineCap = 'round';
  g.strokeStyle = shade(col, -0.14);
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  g.save();
  g.translate(-w * 0.17, -w * 0.22);
  g.strokeStyle = shade(col, 0.42);
  g.lineWidth = w * 0.46;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  g.restore();
}

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
  for (let o = 0; o < 8; o++) {
    const oa = o * Math.PI / 4;
    fg.drawImage(outline, Math.cos(oa) * 1.6 * dpr, Math.sin(oa) * 1.6 * dpr);
  }
  return fin;
}

// 一帧僵尸姿态。ph ∈ [0,1) 是行走相位：双腿交替迈步、双臂前后摆、躯干起伏侧倾。
// 此前只有疾跑者推进 wob，其余六种僵尸完全没有行走动画，只是在滑行 —— 这是最大的观感缺口。
function drawZombiePose(g, type, R, ph, S2, det) {
  const col = ZDEF[type].col;
  const skin = shade(col, 0.40);
  const skinDk = shade(col, 0.16);
  const cloth = shade(col, -0.04);
  const cx = S2, cy = S2;
  const X = v => cx + v * R, Y = v => cy + v * R;

  // 体型 + 姿态：lean 为前倾量（疾跑者前扑、装甲者顶盾、尖啸者后仰）
  let torsoW = 0.72, torsoH = 0.62, armLen = 1.3, armW = 0.30, headR = 0.42, headY = -0.5;
  let aL = 0.32, aR = 0.44, fistR = 0.20, lean = 0;
  if (type === 'runner')   { torsoW = 0.50; torsoH = 0.68; armLen = 0.62; headR = 0.46; headY = -0.62; aL = 0.56; aR = 0.60; lean = -0.08; }
  if (type === 'bloater')  { torsoW = 0.95; torsoH = 0.92; armLen = 0.75; armW = 0.34; headR = 0.32; headY = -0.44; aL = 0.42; aR = 0.50; }
  if (type === 'brute')    { torsoW = 0.98; torsoH = 0.72; armLen = 1.18; armW = 0.46; headR = 0.34; headY = -0.44; aL = 0.40; aR = 0.50; fistR = 0.30; lean = -0.05; }
  if (type === 'screamer') { torsoW = 0.60; headR = 0.48; headY = -0.58; aL = 0.62; aR = 0.62; lean = 0.06; }
  if (type === 'spitter')  { torsoW = 0.78; headR = 0.40; }
  if (type === 'shielder') { torsoW = 0.68; lean = -0.04; }
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

  // 1) 双腿：前后摆 + 抬脚
  volumeEllipse(g, X(-0.29 + sway), Y(0.86 - lFwd * 0.30 - lUp * 0.10), R * 0.17, R * 0.43, shade(col, -0.28), -0.2);
  volumeEllipse(g, X(0.31 + sway), Y(0.86 + rFwd * 0.30 - rUp * 0.10), R * 0.17, R * 0.41, shade(col, -0.28), 0.25);

  // 2) 躯干：体积渐变 + 破洞 + 血污
  const ty = 0.12 - bob * 0.05 + lean;
  volumeEllipse(g, cx, Y(ty), R * torsoW, R * torsoH, cloth, 0);
  for (const tt of det.tatters) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.beginPath();
    g.ellipse(cx + tt[0] * R * torsoW, Y(ty + tt[1]), R * tt[2], R * tt[3], tt[4], 0, 7);
    g.fill();
  }
  g.fillStyle = 'rgba(86,14,14,0.72)';
  g.beginPath(); g.ellipse(cx, Y(ty + 0.33), R * 0.22, R * 0.13, 0, 0, 7); g.fill();

  // 3) 双臂前伸抓握，与腿反相摆动（对侧摆臂）
  const swL = -lFwd * 0.16, swR = -rFwd * 0.16;
  const shY = ty - 0.16;
  volumeLimb(g, X(-torsoW * 0.6), Y(shY), X(-aL - 0.15), Y(-0.60 + lean + swL), X(-aL), Y(-armLen + lean - swL * 0.6), R * armW, skinDk);
  volumeLimb(g, X(torsoW * 0.6), Y(shY + 0.06), X(aR + 0.12), Y(-0.50 + lean + swR), X(aR), Y(-armLen * 0.9 + lean - swR * 0.6), R * armW, skinDk);
  for (const f of [[X(-aL), Y(-armLen + lean - swL * 0.6)], [X(aR), Y(-armLen * 0.9 + lean - swR * 0.6)]]) {
    volumeEllipse(g, f[0], f[1], R * fistR, R * fistR, skin, 0);
  }

  // 4) 头：体积渐变 + 脑后乱发 + 面部暗面 + 红眼 + 颈部创伤
  const hx = cx + sway * R * 0.9, hy = Y(headY + lean - bob * 0.03);
  volumeEllipse(g, hx, hy, R * headR, R * headR, skin, 0);
  g.save();
  g.beginPath(); g.arc(hx, hy, R * headR, 0, 7); g.clip();
  g.fillStyle = 'rgba(20,15,9,0.94)';
  g.beginPath(); g.ellipse(hx, hy + R * headR * 0.46, R * headR * 0.80, R * headR * 0.60, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.30)';
  g.beginPath(); g.ellipse(hx, hy - R * headR * 0.52, R * headR * 0.86, R * headR * 0.52, 0, 0, 7); g.fill();
  g.restore();
  // 红眼：外圈辉光 + 亮点，小尺寸下也读得出「这是眼睛」
  const eyeR = Math.max(1.15, R * 0.085);
  g.fillStyle = 'rgba(255,74,48,0.30)';
  g.beginPath(); g.arc(hx - R * headR * 0.40, hy - R * headR * 0.56, eyeR * 2.3, 0, 7); g.fill();
  g.beginPath(); g.arc(hx + R * headR * 0.40, hy - R * headR * 0.56, eyeR * 2.3, 0, 7); g.fill();
  g.fillStyle = '#ff6247';
  g.beginPath(); g.arc(hx - R * headR * 0.40, hy - R * headR * 0.56, eyeR, 0, 7); g.fill();
  g.beginPath(); g.arc(hx + R * headR * 0.40, hy - R * headR * 0.56, eyeR, 0, 7); g.fill();
  g.fillStyle = 'rgba(86,13,13,0.88)';
  g.beginPath(); g.ellipse(hx, hy + R * headR * 0.88, R * headR * 0.5, R * headR * 0.3, 0, 0, 7); g.fill();

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
  // 同僵尸：左右腿各一个相位，保证 4 帧互不相同
  const pL = ph * TAU, pR = pL + Math.PI;
  const lFwd = Math.cos(pL), rFwd = Math.cos(pR);
  const lUp = Math.max(0, Math.sin(pL)), rUp = Math.max(0, Math.sin(pR));  // 抬脚，用于区分两个过渡帧
  const bob = Math.abs(Math.cos(pL));
  const boot = shade('#2d3527', 0.06);

  volumeEllipse(g, cx, Y(0.36), R * 0.52, R * 0.40, shade(col, -0.40), 0);          // 背包
  volumeEllipse(g, X(-0.28), Y(0.70 - lFwd * 0.28 - lUp * 0.09), R * 0.17, R * 0.36, boot, -0.12); // 双腿
  volumeEllipse(g, X(0.28), Y(0.70 + rFwd * 0.28 - rUp * 0.09), R * 0.17, R * 0.36, boot, 0.12);
  g.fillStyle = '#1b201a';                                                          // 靴子
  g.beginPath(); g.ellipse(X(-0.28), Y(0.94 - lFwd * 0.30 - lUp * 0.09), R * 0.19, R * 0.19, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(X(0.28), Y(0.94 + rFwd * 0.30 - rUp * 0.09), R * 0.19, R * 0.19, 0, 0, 7); g.fill();

  volumeEllipse(g, cx, Y(0.08 - bob * 0.04), R * 0.84, R * 0.74, col, 0);          // 躯干
  g.fillStyle = 'rgba(255,255,255,0.07)';                                          // 胸前护板
  g.beginPath(); g.ellipse(cx, Y(-0.06 - bob * 0.04), R * 0.52, R * 0.34, 0, 0, 7); g.fill();
  volumeEllipse(g, X(-0.80), Y(-0.22 - bob * 0.04), R * 0.36, R * 0.31, shade(col, 0.18), -0.22); // 肩甲
  volumeEllipse(g, X(0.80), Y(-0.22 - bob * 0.04), R * 0.36, R * 0.31, shade(col, 0.18), 0.22);

  // 双臂持枪：带轻微对侧摆，走路时肩膀跟着动
  const armCol = shade(col, 0.12);
  const alY = -0.26 - bob * 0.04;
  const laY = alY - lFwd * 0.035, raY = alY - rFwd * 0.035;
  volumeLimb(g, X(-0.62), Y(laY), X(-0.74), Y(-0.72), X(-0.24), Y(-1.06), R * 0.30, armCol);
  volumeLimb(g, X(0.62), Y(raY), X(0.74), Y(-0.72), X(0.24), Y(-1.06), R * 0.30, armCol);
  volumeEllipse(g, X(-0.24), Y(-1.06), R * 0.19, R * 0.19, '#242a22', 0);          // 手套
  volumeEllipse(g, X(0.24), Y(-1.06), R * 0.19, R * 0.19, '#242a22', 0);

  const hy = Y(-0.66 - bob * 0.03);                                                // 头盔
  volumeEllipse(g, cx, hy, R * 0.48, R * 0.48, shade(col, 0.24), 0);
  g.save();
  g.beginPath(); g.arc(cx, hy, R * 0.48, 0, 7); g.clip();
  g.fillStyle = 'rgba(13,19,25,0.80)';                                             // 面罩
  g.beginPath(); g.ellipse(cx, hy - R * 0.20, R * 0.46, R * 0.24, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(150,205,255,0.50)';                                          // 护目镜反光
  g.beginPath(); g.ellipse(cx, hy - R * 0.25, R * 0.31, R * 0.07, 0, 0, 7); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.16)';                                          // 盔顶高光
  g.beginPath(); g.ellipse(cx - R * 0.12, hy - R * 0.30, R * 0.20, R * 0.09, -0.4, 0, 7); g.fill();
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
