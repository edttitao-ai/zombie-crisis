'use strict';
// 音效合成模块（WebAudio，无外部素材）
/* ================= 音频（WebAudio 合成，无外部资源） ================= */
let actx = null;
let muted = STORE.get('zc_muted') === '1';
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
}
function tone(freq, dur, type, vol, slideTo) {
  if (!actx || muted) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, vol, freq) {
  if (!actx || muted) return;
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(actx.destination);
  src.start();
}
const S = {
  shoot()  { noiseBurst(0.08, 0.22, 1600); tone(150, 0.06, 'square', 0.07, 60); },
  hit()    { tone(160, 0.07, 'square', 0.09, 100); },
  // 击杀音效带音调参数：连杀越高音调越高，形成「越打越爽」的听觉反馈
  die(p)   { const k = p || 1; noiseBurst(0.22, 0.18, 600 * k); tone(90 * k, 0.2, 'sawtooth', 0.1, 45 * k); },
  hurt()   { tone(110, 0.22, 'sawtooth', 0.18, 55); },
  reload() { tone(420, 0.04, 'square', 0.07); setTimeout(() => tone(560, 0.04, 'square', 0.07), 130); },
  pickup() { tone(660, 0.07, 'sine', 0.12); setTimeout(() => tone(990, 0.1, 'sine', 0.12), 70); },
  wave()   { tone(160, 0.55, 'sawtooth', 0.1, 320); },
  clear()  { tone(520, 0.1, 'sine', 0.12); setTimeout(() => tone(780, 0.16, 'sine', 0.12), 110); },
  over()   { tone(220, 0.5, 'sawtooth', 0.14, 60); setTimeout(() => tone(140, 0.8, 'sawtooth', 0.14, 40), 420); },
  boom()   { noiseBurst(0.5, 0.4, 320); tone(60, 0.4, 'sawtooth', 0.2, 25); },
  dash()   { noiseBurst(0.12, 0.1, 1500); },
  pin()    { tone(720, 0.05, 'square', 0.08); },
  rail()   { tone(950, 0.16, 'sawtooth', 0.1, 140); noiseBurst(0.1, 0.14, 3000); },
  zap()    { tone(1400, 0.09, 'square', 0.1, 260); noiseBurst(0.14, 0.18, 4200); },
  buzz()   { tone(190, 0.12, 'sawtooth', 0.04, 240); },
  shatter() { noiseBurst(0.14, 0.2, 2600); tone(300, 0.1, 'triangle', 0.08, 120); },
  spit()   { noiseBurst(0.12, 0.15, 900); tone(420, 0.12, 'square', 0.06, 180); },
  scream() { tone(880, 0.5, 'sawtooth', 0.09, 1300); setTimeout(() => tone(660, 0.45, 'sawtooth', 0.06, 990), 60); },

  /* ===== 每把枪独立音色：火力升级时耳朵要听得出区别 ===== */
  smg()    { noiseBurst(0.055, 0.15, 2400); tone(280, 0.035, 'square', 0.045, 140); },
  flame()  { noiseBurst(0.11, 0.13, 620); },                                   // 低频喷气
  sniper() { noiseBurst(0.09, 0.34, 3000); tone(320, 0.28, 'sawtooth', 0.10, 60);
             setTimeout(() => noiseBurst(0.22, 0.10, 900), 70); },              // 余响
  swarm()  { for (let i = 0; i < 4; i++) setTimeout(() => {
               noiseBurst(0.09, 0.11, 1500 + i * 180);
               tone(300 + i * 45, 0.09, 'sawtooth', 0.045, 900 + i * 120);
             }, i * 55); },
  mini()   { noiseBurst(0.04, 0.13, 2800); tone(240, 0.03, 'square', 0.035, 120); },
  ricochet() { tone(1180, 0.07, 'square', 0.09, 520); noiseBurst(0.09, 0.14, 2200); },  // 弹跳：短促上滑
  roll()   { tone(90, 0.5, 'sawtooth', 0.13, 55); noiseBurst(0.34, 0.16, 480); },        // 沉重滚动

  /* ===== 宠物：每次出手都要有声音，否则僵尸就是「莫名其妙死了」 ===== */

  /* ===== Boss ===== */
  mortar()   { tone(120, 0.35, 'square', 0.11, 46); noiseBurst(0.22, 0.14, 620); }   // 迫击炮出膛的低沉"咚"
};
