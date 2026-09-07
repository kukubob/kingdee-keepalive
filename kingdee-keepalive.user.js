// ==UserScript==
// @name         金蝶云星空 HTML5 保持在线
// @namespace    https://github.com/kukubob/kingdee-keepalive
// @version      1.0.0
// @description  使用金蝶原生继续在线事件，定期更新闲置计时，不刷新业务页面。
// @match        *://*/k3cloud/html5/dform.aspx*
// @homepageURL  https://github.com/kukubob/kingdee-keepalive
// @downloadURL  https://raw.githubusercontent.com/kukubob/kingdee-keepalive/main/kingdee-keepalive.user.js
// @updateURL    https://raw.githubusercontent.com/kukubob/kingdee-keepalive/main/kingdee-keepalive.user.js
// @run-at       document-idle
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  if (window.top !== window.self ||
      new URLSearchParams(location.search).get('formId')?.toLowerCase() !== 'bos_htmlconsole') return;
  const ID = 'local-kingdee-keepalive';
  if (document.getElementById(ID)) return;

  // 与当前版本“闲置退出前，选择继续在线”的原生代码一致。
  // 不调用 TimerElapsed：该路径会读取表单变更数据。
  const INTERVAL = 60_000;
  const STORAGE_KEY = `${ID}:paused`;
  let paused = false;
  try { paused = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { /* 存储禁用仍可运行 */ }
  let lastAttempt = 0;
  let timer;
  const panel = document.createElement('button');
  panel.id = ID;
  panel.type = 'button';
  panel.style.cssText = 'position:fixed;right:16px;bottom:14px;z-index:2147483647;' +
    'border:1px solid #bbc8d8;border-radius:6px;padding:7px 11px;' +
    'background:#f4f8ff;color:#24456a;font:12px/1.5 sans-serif;cursor:pointer;';
  panel.title = '每分钟调用金蝶原生继续在线事件。时间表示调用时间，不代表服务器已确认续期。点击暂停/恢复。';
  document.body.appendChild(panel);

  function display(text) { panel.textContent = `金蝶保活 · ${text}`; }
  function tick() {
    if (paused) { display('已暂停（点击恢复）'); return; }
    const app = page.ClientAppProxy?.Current;
    const root = app?.rootForm;
    if (!root?.server || typeof root.fireCustomEventsNoData !== 'function' ||
        typeof app.updateLastReqTime !== 'function') {
      display('等待已登录主页 / 接口不可用');
      return;
    }
    if (!navigator.onLine) { display('网络离线，等待恢复'); return; }
    if (lastAttempt && Date.now() - lastAttempt < INTERVAL) return;
    lastAttempt = Date.now();
    try {
      root.fireCustomEventsNoData('Kingdee.BOS.LogOutPreFivePoint', '');
      app.updateLastReqTime([{ actionname: 'idlewithhold' }], {});
      // 此原生函数没有服务器确认回调，不将无异常返回标为“续期成功”。
      display(`已调用 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`);
    } catch {
      display('调用异常，稍后重试');
    }
  }
  panel.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem(STORAGE_KEY, paused ? '1' : '0'); } catch { /* 可选 */ }
    lastAttempt = 0;
    tick();
  });
  function start() {
    clearInterval(timer);
    tick();
    timer = setInterval(tick, INTERVAL);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('online', tick);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', start);
  start();
})();
