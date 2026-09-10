'use strict';
// 排行榜：本机最高分榜。本作零依赖、不发网络请求，所以「榜」就是存在 localStorage 里的
// 本机记录（最多 BOARD_MAX 条）——不假装有云端榜，也不引入后端。
/* ================= 排行榜 ================= */
const BOARD_KEY = 'zc_board';
const BOARD_MAX = 10;
const BOARD_OVER_ROWS = 5;      // 结算界面上只露前 5 条，整榜在开始界面的面板里看
let lastRunId = null;           // 本局刚写入的条目 id（用于高亮那一行）
let lastRunRank = 0;            // 本局排名（1 起；0 = 没进榜）
let boardSeq = 0;               // 生成条目 id 用（同一毫秒内连打两局也不会撞）

function boardLoad() {
  try {
    const raw = STORE.get(BOARD_KEY, '');
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // 容错：坏数据（手改过 localStorage / 旧格式）不该让开始界面直接崩，丢弃形状不对的条目
    return list
      .filter(e => e && typeof e.s === 'number')
      .map(e => ({ id: typeof e.id === 'string' ? e.id : '', s: e.s | 0, w: e.w | 0,
                   k: e.k | 0, m: e.m ? 1 : 0, d: e.d | 0 }))
      .sort((a, b) => b.s - a.s || a.d - b.d)   // 同分：更早打出的排前面
      .slice(0, BOARD_MAX);
  } catch (e) { return []; }
}
function boardSave(list) {
  STORE.set(BOARD_KEY, JSON.stringify(list.slice(0, BOARD_MAX)));
}
// 写入一局成绩，返回排名（1 起；0 = 没进前 BOARD_MAX）
function boardAdd(entry) {
  entry.id = 'r' + (++boardSeq) + '-' + entry.d;
  const list = boardLoad();
  list.push(entry);
  list.sort((a, b) => b.s - a.s || a.d - b.d);
  const kept = list.slice(0, BOARD_MAX);
  const rank = kept.findIndex(e => e.id === entry.id) + 1;   // 0 = 没进榜
  boardSave(kept);
  lastRunId = rank > 0 ? entry.id : null;
  lastRunRank = rank;
  return rank;
}
function boardClear() {
  STORE.set(BOARD_KEY, '[]');
  lastRunId = null;
  lastRunRank = 0;
}
function boardHas(ts) { return boardLoad().some(e => e.d === ts); }

// 日期手动拼成 MM-DD HH:mm：toLocaleString 在不同语言/环境下的输出不可控，
// 而这一列只是给人看个时间，不值得为它引入格式化依赖。
function boardDate(ts) {
  const d = new Date(ts || 0);
  const p = n => (n < 10 ? '0' : '') + n;
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// 渲染到任意容器（整榜 / 结算界面的前 5 条共用一套）
function renderBoard(el, limit, highlightId) {
  if (!el) return;
  const list = boardLoad();
  el.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'bd-empty';
    empty.textContent = t('boardEmpty');
    el.appendChild(empty);
    return;
  }
  const head = document.createElement('div');
  head.className = 'bd-head';
  head.innerHTML = '<span>#</span><span class="bd-s">' + t('boardScore') + '</span>' +
                   '<span>' + t('boardWave') + '</span><span>' + t('boardKills') + '</span>' +
                   '<span>' + t('boardMode') + '</span><span>' + t('boardDate') + '</span>';
  el.appendChild(head);
  list.slice(0, limit || BOARD_MAX).forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'bd-row' + (e.id && e.id === highlightId ? ' now' : '') + (e.m ? ' vip' : '');
    row.innerHTML =
      '<span class="bd-r">' + (i + 1) + '</span>' +
      '<span class="bd-s">' + e.s + '</span>' +
      '<span class="bd-n">' + e.w + '</span>' +
      '<span class="bd-n">' + e.k + '</span>' +
      '<span class="bd-m">' + t(e.m ? 'modeVIPShort' : 'modeNormalShort') + '</span>' +
      '<span class="bd-d">' + boardDate(e.d) + '</span>';
    el.appendChild(row);
  });
}
// 两处榜单一起重画（语言切换、结算、返回主界面时调用）
function renderBoards() {
  renderBoard(document.getElementById('boardList'), BOARD_MAX, lastRunId);
  renderBoard(document.getElementById('ovBoard'), BOARD_OVER_ROWS, lastRunId);
}
