// ==UserScript==
// @name         金蝶云星空 HTML5 保持在线
// @namespace    https://github.com/kukubob/kingdee-keepalive
// @version      1.1.1
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

  const IDLE_TARGET = 60; // 人工操作已更新计时时，不重复发保活请求。
  const RETRY_DELAY = 60_000;
  const STORAGE_KEY = `${ID}:paused`;
  let paused = false;
  try { paused = sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { /* 可选存储 */ }
  let lastAttempt = -Infinity;
  let result = '';
  let timer;

  const panel = document.createElement('button');
  panel.id = ID;
  panel.type = 'button';
  panel.style.cssText = 'position:fixed;right:12px;bottom:10px;z-index:2147483647;' +
    'padding:4px 8px;border:1px solid #dce4ed;border-radius:5px;' +
    'background:#f7f9fc;color:#66778a;white-space:nowrap;cursor:pointer;' +
    'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  document.body.appendChild(panel);

  function snapshot() {
    const app = page.ClientAppProxy?.Current;
    const last = Number(app?.lastRequestTime);
    const limit = Number(app?.IdleTimeout);
    if (!app?.rootForm?.server || !Number.isFinite(last) ||
        !Number.isFinite(limit) || limit <= 0) return null;
    // 与当前金蝶 KD.dateDiff 的绝对差、向下取整逻辑一致。
    return { app, last, limit, idle: Math.floor(Math.abs(Date.now() - last) / 1000),
      enabled: Boolean(app.AppTimeOutEnable) };
  }
  function render(state) {
    const remaining = state ? Math.max(0, state.limit - state.idle) : 0;
    const time = !state ? '等待登录' : !state.enabled ? '无闲置限制' :
      remaining <= 0 ? '已达闲置上限' : remaining < 60 ? '剩余不足 1 分钟' :
      `剩余约 ${Math.ceil(remaining / 60)} 分钟`;
    const label = paused ? '已暂停' : !navigator.onLine ? '断网' : result ? '异常' : '保活中';
    const text = `${label} · ${time}`;
    if (panel.textContent !== text) panel.textContent = text;
    panel.style.color = result || !navigator.onLine ? '#b42318' : '#66778a';
    panel.setAttribute('aria-pressed', String(paused));
    panel.title = `${paused ? '点击恢复保活' : '点击暂停保活'}。每分钟更新一次显示。` +
      (result ? `${result}。` : '') +
      '剩余时间来自金蝶前端闲置计时，不代表服务器会话有效期。';
  }
  function tick() {
    let state = snapshot();
    if (!paused && state?.enabled && navigator.onLine && state.idle >= IDLE_TARGET &&
        Date.now() - lastAttempt >= RETRY_DELAY) {
      const app = state.app;
      const root = app.rootForm;
      if (typeof root.fireCustomEventsNoData !== 'function' || typeof app.updateLastReqTime !== 'function') {
        result = '接口不可用 · 保活未执行';
      } else {
        lastAttempt = Date.now();
        try {
          // 复用原生继续在线事件，表单变更数据参数为 null。
          root.fireCustomEventsNoData('Kingdee.BOS.LogOutPreFivePoint', '');
          app.updateLastReqTime([{ actionname: 'idlewithhold' }], {});
          state = snapshot();
          result = state && state.idle < IDLE_TARGET ? '' : '计时未重置 · 请检查';
        } catch {
          result = '调用异常 · 稍后重试';
        }
      }
    }
    render(state);
  }
  panel.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem(STORAGE_KEY, paused ? '1' : '0'); } catch { /* 可选存储 */ }
    result = '';
    tick();
  });
  function start() {
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 60_000); // 每分钟检查保活并更新显示，不显示秒数。
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('online', tick);
  window.addEventListener('offline', tick);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', start);
  start();
})();
