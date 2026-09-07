// ==UserScript==
// @name         金蝶云星空 HTML5 保持在线
// @namespace    https://github.com/kukubob/kingdee-keepalive
// @version      1.1.0
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

  const panel = document.createElement('section');
  panel.id = ID;
  panel.style.cssText = 'position:fixed;right:16px;bottom:14px;z-index:2147483647;' +
    'box-sizing:border-box;width:256px;padding:12px 14px;border:1px solid #dce4ed;' +
    'border-radius:12px;background:#fff;color:#243447;box-shadow:0 3px 14px #17314b14;' +
    'font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
  const heading = document.createElement('div');
  heading.textContent = '距闲置退出';
  heading.style.cssText = 'font-size:12px;color:#66778a;';
  const countdown = document.createElement('div');
  countdown.style.cssText = 'font-size:28px;font-weight:650;line-height:1.35;font-variant-numeric:tabular-nums;';
  const detail = document.createElement('div');
  detail.style.cssText = 'color:#66778a;margin-top:2px;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;';
  const status = document.createElement('span');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.style.cssText = 'font:inherit;border:1px solid #dce4ed;border-radius:6px;padding:3px 10px;' +
    'background:#f7f9fc;color:#334960;cursor:pointer;';
  row.append(status, toggle);
  panel.append(heading, countdown, detail, row);
  panel.title = '倒计时读取金蝶当前闲置设置。人工操作与保活都会重置它。这里只反映前端闲置计时，不代表服务器会话有效期。';
  document.body.appendChild(panel);

  function duration(seconds) {
    const value = Math.max(0, Math.floor(seconds));
    const h = Math.floor(value / 3600);
    const m = Math.floor(value % 3600 / 60);
    const s = value % 60;
    return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
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
    toggle.textContent = paused ? '恢复保活' : '暂停保活';
    toggle.setAttribute('aria-pressed', String(paused));
    countdown.textContent = !state ? '— —' : !state.enabled ? '未启用' : duration(state.limit - state.idle);
    countdown.style.color = state?.enabled && state.limit - state.idle <= 300 ? '#b45309' : '#243447';
    detail.textContent = !state ? '等待金蝶登录完成' :
      `已闲置 ${duration(state.idle)} · 上限 ${duration(state.limit)}`;
    if (paused) {
      status.textContent = '已暂停 · 倒计时继续';
      status.style.color = '#8a5a12';
    } else if (!navigator.onLine) {
      status.textContent = '断网 · 无法保活';
      status.style.color = '#b42318';
    } else if (!state) {
      status.textContent = '等待就绪';
      status.style.color = '#66778a';
    } else if (result) {
      status.textContent = result;
      status.style.color = '#b42318';
    } else {
      status.textContent = state.enabled ? '自动保活已开启' : '闲置退出已关闭';
      status.style.color = '#16704a';
    }
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
  toggle.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem(STORAGE_KEY, paused ? '1' : '0'); } catch { /* 可选存储 */ }
    result = '';
    tick();
  });
  function start() {
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 1000); // 每秒本地读数；请求受闲置阈值与重试间隔限制。
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('online', tick);
  window.addEventListener('offline', tick);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', start);
  start();
})();
