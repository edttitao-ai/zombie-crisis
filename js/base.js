'use strict';
// 基础层：画布 / 全局工具 / 预渲染层变量 / resize / DOM 引用
const { t, fmt } = window.I18N_API;
/* ================= 基础设置 ================= */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
let W = 0, H = 0;
let ground = null, groundCtx = null;   // 地面合成层（地形 + 贴花），render 每帧只 blit 这一张
let groundBase = null;                 // 地形底图（随机生成，只在尺寸/DPR 变化时重绘）
let vigCanvas = null;                  // 预渲染暗角（尺寸变化时置空重建）
let stains = [];                       // 血迹/焦痕贴花（带 born 时间戳，按年龄淡出）
let gameT = 0, stainT = 0;             // 游戏时钟 / 贴花老化节拍（暂停时不推进）
const SPR = {};                    // 预渲染精灵（僵尸躯体 / 各色光晕）
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand  = (a, b) => a + Math.random() * (b - a);
// resize() 的首次调用收口在 main.js：必须晚于 gfx.js 定义 buildSprites/buildGround
const WALK_FRAMES = 4;                 // 行走循环帧数（预渲染，逐帧只是换一张图）
const TAU = Math.PI * 2;
let lastDpr = 0, groundT = 0;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 精灵只取决于 DPR，与视口尺寸无关：仅在 DPR 变化时重建，
  // 否则拖动窗口会反复重绘，且精灵内的随机细节会让僵尸外观跳变
  if (dpr !== lastDpr) { buildSprites(); lastDpr = dpr; }
  vigCanvas = null;                          // 暗角随尺寸重建
  if (!ground) { buildGround(); return; }   // 首帧必须立刻有地面
  // 拖动过程中先复用旧地面（render 会拉伸到新尺寸），停手后再重绘
  clearTimeout(groundT);
  groundT = setTimeout(buildGround, 160);
}
window.addEventListener('resize', resize);

const elStart = document.getElementById('start');
const elOver  = document.getElementById('over');
const elPause = document.getElementById('pause');
const btnRetry = document.getElementById('btnRetry');
const bestStart = document.getElementById('bestStart');
const elCards = document.getElementById('cards');
const modeNormal = document.getElementById('modeNormal');
const modeVIP = document.getElementById('modeVIP');
