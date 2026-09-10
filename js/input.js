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
    // 排行榜面板开着时，回车/ Esc 只负责关面板 —— 否则回车会顺手开一局
    if (!elBoard.classList.contains('hidden')) {
      if (e.code === 'Escape' || e.code === 'Enter') closeBoard();
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') { startGame(lastMode); return; }
    if (e.code === 'KeyV') { startGame(true); return; }
  }
  if (state === 'gameover' && (e.code === 'Enter' || e.code === 'KeyR')) { startGame(lastMode); return; }
  if (state === 'gameover' && e.code === 'Escape') { goHome(); return; }
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
  const want = petDef(petPick);
  if (want.vip && !vip) {
    // 选了 VIP 专属宠物却开普通局：明确说清这一局会用谁，别让玩家以为拿到了
    petHintEl.textContent = fmt(t('petFallback'), t(want.nameKey));
  }
  pickMode = vip;              // 记住这次选的模式，回到开始界面时宠物栏的解锁状态与它一致
  startGame(vip);
}
modeNormal.addEventListener('click', () => startFromMode(false));
modeVIP.addEventListener('click', () => startFromMode(true));
btnRetry.addEventListener('click', () => startGame(lastMode));
document.getElementById('btnLang').addEventListener('click', () => window.I18N_API.toggleLang());

/* ================= 开始界面：宠物栏 =================
   一屏常驻。鼠标移到某个模式卡上时，petRow 的可选状态跟着切换 ——
   普通模式下 VIP 专属那两只带锁标、点了会给提示，而不是静默失败。 */
const petRowEl = document.getElementById('petRow');
const petHintEl = document.getElementById('petHint');
let pickMode = lastMode;                        // 当前打算玩的模式，决定哪些宠物可选
function petUnlocked(d) { return !d.vip || pickMode; }
function renderPetRow() {
  if (!petRowEl) return;
  petRowEl.innerHTML = '';
  for (const d of PETS) {
    const locked = !petUnlocked(d);
    const el = document.createElement('div');
    el.className = 'pet-chip' + (d.id === petPick ? ' on' : '') + (locked ? ' locked' : '');
    el.style.setProperty('--pc', d.col);
    el.innerHTML =
      '<div class="p-icon">' + d.icon + '</div>' +
      '<div class="p-name">' + t(d.nameKey) + '</div>' +
      (d.vip ? '<div class="p-tag">VIP</div>' : '') +
      '<div class="p-desc">' + t(d.descKey) + '</div>';
    el.addEventListener('click', () => {
      if (locked) { petHintEl.textContent = fmt(t('petLocked'), t(d.nameKey)); return; }
      petPick = d.id;
      STORE.set('zc_pet', petPick);
      petHintEl.textContent = fmt(t('petChosen'), t(d.nameKey));
      renderPetRow();
    });
    petRowEl.appendChild(el);
  }
  if (petHintEl && !petHintEl.textContent) petHintEl.textContent = t('petHintDefault');
}
function setPickMode(vip) {
  if (pickMode === vip) return;
  pickMode = vip;
  renderPetRow();
}
modeNormal.addEventListener('mouseenter', () => setPickMode(false));
modeVIP.addEventListener('mouseenter', () => setPickMode(true));
renderPetRow();

/* ================= 排行榜面板 / 结束本局 =================
   榜单是本机的（写在 localStorage 里，游戏本身不发任何网络请求）。
   开始界面用「排行榜」按钮打开；暂停菜单的「结束本局」把当前成绩结算进榜，
   而不是非得等玩家被打死 —— 主动认输也是一局的合法结局。 */
const elBoard = document.getElementById('board');
const btnBoardClear = document.getElementById('btnBoardClear');
let boardClearArmed = false, boardClearT = 0;
function openBoard() {
  boardClearArmed = false;
  btnBoardClear.textContent = t('boardClear');
  renderBoards();
  elBoard.classList.remove('hidden');
  elStart.classList.add('hidden');
}
function closeBoard() {
  elBoard.classList.add('hidden');
  if (state === 'start') elStart.classList.remove('hidden');
}
// 回开始界面：结算/榜单都收起来，并刷新最高分与榜单（刚打完的那局可能是新纪录）
function goHome() {
  state = 'start';
  paused = false;
  elOver.classList.add('hidden');
  elBoard.classList.add('hidden');
  elStart.classList.remove('hidden');
  showBest();
  renderBoards();
}
document.getElementById('btnBoard').addEventListener('click', openBoard);
document.getElementById('btnBoardClose').addEventListener('click', closeBoard);
document.getElementById('btnHome').addEventListener('click', goHome);
document.getElementById('btnEnd').addEventListener('click', () => endRun());
// 清空不可撤销，所以做两段式确认：第一次点变成「再点一次确认清空」，3 秒后自动收回
btnBoardClear.addEventListener('click', () => {
  if (!boardClearArmed) {
    boardClearArmed = true;
    btnBoardClear.textContent = t('boardClearConfirm');
    clearTimeout(boardClearT);
    boardClearT = setTimeout(() => {
      boardClearArmed = false;
      btnBoardClear.textContent = t('boardClear');
    }, 3000);
    return;
  }
  clearTimeout(boardClearT);
  boardClearArmed = false;
  btnBoardClear.textContent = t('boardClear');
  boardClear();
  renderBoards();
});
