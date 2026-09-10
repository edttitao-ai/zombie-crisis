'use strict';
// 本地存储安全封装：个别内嵌环境（如受限 iframe）访问 localStorage 会直接抛异常，
// 顶层裸读会让整个脚本加载失败。所有 zc_* 键的读写一律走这里。
window.STORE = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
};
