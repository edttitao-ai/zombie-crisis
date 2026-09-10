'use strict';
// 输入：键盘 / 鼠标 / 全部事件接线（改按键与操作看这里）
/* ================= 输入 ================= */
const keys = {};
// 直接用视口尺寸居中：本文件在 main.js 的 resize() 之前加载，不能依赖 W
const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyM') {
    muted = !muted;
    STORE.set('zc_muted', muted ? '1' : '0');
  }
  if (e.code === 'KeyL') window.I18N_API.toggleLang();
  if (state === 'start') {
    if (e.code === 'Enter' || e.code === 'Space') { startGame(lastMode); return; }
    if (e.code === 'KeyV') { startGame(true); return; }
  }
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'KeyR')) { startGame(lastMode); return; }
  if (state === 'playing') {
    if (cardOpen && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4')) {
      const c = cardPicks[+e.code.slice(-1) - 1];
      if (c) pickCard(c);
      return;
    }
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') throwGrenade();
    if (e.code === 'KeyF') throwMolotov();
    if (e.code === 'KeyQ') useMedkit();
    if (e.code === 'KeyX') dropWeapon();
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      paused = !paused;
      elPause.classList.toggle('hidden', !paused);
    }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => {
  if (e.button === 2) { if (state === 'playing' && !paused) throwGrenade(); return; }
  if (e.button === 0) { mouse.down = true; ensureAudio(); }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) { mouse.down = false; mouse.semiHeld = false; }
});
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => {
  if (state === 'playing' && !paused) { paused = true; elPause.classList.remove('hidden'); }
  // 失焦期间松开的键收不到 keyup/mouseup（在窗口外释放时不派发到本页），
  // 残留状态会让恢复后角色自行漂移或持续开火，一并清空
  for (const k in keys) keys[k] = false;
  mouse.down = false;
  mouse.semiHeld = false;
});
function startFromMode(vip) {
  startGame(vip);
}
modeNormal.addEventListener('click', () => startFromMode(false));
modeVIP.addEventListener('click', () => startFromMode(true));
btnRetry.addEventListener('click', () => startGame(lastMode));
document.getElementById('btnLang').addEventListener('click', () => window.I18N_API.toggleLang());

