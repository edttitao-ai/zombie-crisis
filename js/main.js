'use strict';
// 入口与主循环：初始化顺序（resize → reset）+ 顿帧缩放 dt + rAF 驱动
/* ================= 主循环 ================= */
function showBest() {
  bestStart.textContent = best > 0 ? fmt(t('best'), best) : t('firstRun');
}
window.I18N_ONAPPLY = () => { showBest(); renderPetRow(); };
showBest();

let last = performance.now();
let frameCount = 0;
function frame(now) {
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // 击杀顿帧：打中大体型时短暂放慢时间，制造打击感。只缩放 update 的步长，
  // 渲染照常 —— 顿帧是「世界慢下来」而不是「掉帧」。
  if (hitStopT > 0) { hitStopT = Math.max(0, hitStopT - dt); dt *= 0.28; }
  if (state === 'playing' && !paused && !cardOpen) update(dt);
  render();
  frameCount++;
  requestAnimationFrame(frame);
}
resize();   // 首帧必须有画布尺寸与地面（原在 base 段顶部调用）
reset(); // 主循环从加载即开始渲染，实体必须先于首帧初始化
requestAnimationFrame(frame);
