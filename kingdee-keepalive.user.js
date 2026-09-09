// ==UserScript==
// @name         金蝶云星空 HTML5 保持在线
// @namespace    https://github.com/kukubob/kingdee-keepalive
// @version      1.1.3
// @description  使用金蝶原生继续在线事件，定期更新闲置计时，不刷新业务页面。
// @match        *://*/k3cloud/html5/dform.aspx*
// @homepageURL  https://github.com/kukubob/personal-userscripts
// @downloadURL  https://raw.githubusercontent.com/kukubob/personal-userscripts/main/kingdee-keepalive.user.js
// @updateURL    https://raw.githubusercontent.com/kukubob/personal-userscripts/main/kingdee-keepalive.user.js
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

  let expanded = false;
  const panel = document.createElement('div');
  panel.id = ID;
  panel.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:2147483647;' +
    'display:flex;align-items:center;gap:6px;' +
    'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  const details = document.createElement('div');
  details.id = `${ID}-details`;
  details.style.cssText = 'display:none;align-items:center;gap:8px;padding:4px 8px;' +
    'border:1px solid #dce4ed;border-radius:5px;background:#f7f9fc;color:#66778a;white-space:nowrap;';
  const status = document.createElement('span');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.style.cssText = 'font:inherit;color:#66778a;background:none;border:0;padding:0;cursor:pointer;';
  details.append(status, toggle);
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.style.cssText = 'display:flex;align-items:center;justify-content:center;width:24px;height:24px;' +
    'border:0;padding:0;background:transparent;cursor:pointer;';
  dot.setAttribute('aria-controls', details.id);
  dot.setAttribute('aria-expanded', 'false');
  const indicator = document.createElement('span');
  indicator.style.cssText = 'display:block;width:10px;height:10px;border-radius:50%;background:#7b9c8b;';
  dot.append(indicator);
  panel.append(details, dot);
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
    if (status.textContent !== text) status.textContent = text;
    indicator.style.background = result || !navigator.onLine ? '#bd827b' :
      paused || !state ? '#a5adb5' : '#7b9c8b';
    toggle.textContent = paused ? '恢复' : '暂停';
    toggle.setAttribute('aria-pressed', String(paused));
    dot.setAttribute('aria-label', `${expanded ? '收起' : '展开'}金蝶保活状态：${label}`);
    dot.title = `金蝶保活：${label}，点击${expanded ? '收起' : '查看剩余时间'}`;
    details.title = '每分钟更新一次显示。' + (result ? `${result}。` : '') +
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
  dot.addEventListener('click', () => {
    expanded = !expanded;
    details.style.display = expanded ? 'flex' : 'none';
    dot.setAttribute('aria-expanded', String(expanded));
    render(snapshot());
  });
  toggle.addEventListener('click', () => {
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
