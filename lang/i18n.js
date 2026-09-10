// 多语言加载器：语言包各自独立（lang/<code>.js，向 window.I18N 注册），
// 本文件只负责 检测 / 切换 / 回退 / 应用，不包含任何具体文案。
(function () {
  const REG = window.I18N || {};
  const codes = Object.keys(REG);
  if (!codes.length) return;

  let cur = null;
  try { cur = localStorage.getItem('zc_lang'); } catch (e) {}
  if (!cur || codes.indexOf(cur) < 0) {
    const nav = (navigator.language || codes[0]).toLowerCase();
    cur = codes.find(c => nav.indexOf(c) === 0) || codes[0];
  }

  // 取词：当前语言缺失时回退到第一个已注册语言，再缺失返回 key 本身
  function t(key) {
    const d = REG[cur];
    if (d && d[key] !== undefined) return d[key];
    const fb = REG[codes[0]];
    return (fb && fb[key] !== undefined) ? fb[key] : key;
  }

  // 模板填充：t('waveN') 返回 '第 {0} 波'，fmt 填入参数
  function fmt(str) {
    const args = Array.prototype.slice.call(arguments, 1);
    return String(str).replace(/\{(\d+)\}/g, (m, n) => (args[n] !== undefined ? args[n] : m));
  }

  function applyLang() {
    document.documentElement.lang = cur;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    const btn = document.getElementById('btnLang');
    if (btn) btn.textContent = cur === 'zh' ? 'English' : '中文';
    if (typeof window.I18N_ONAPPLY === 'function') window.I18N_ONAPPLY();
  }

  function setLang(code) {
    if (codes.indexOf(code) < 0 || code === cur) return;
    cur = code;
    try { localStorage.setItem('zc_lang', cur); } catch (e) {}
    applyLang();
  }

  function toggleLang() {
    setLang(codes[(codes.indexOf(cur) + 1) % codes.length]);
  }

  window.I18N_API = {
    t, fmt, applyLang, setLang, toggleLang,
    get lang() { return cur; },
    get langs() { return codes.slice(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLang);
  } else {
    applyLang();
  }
})();
