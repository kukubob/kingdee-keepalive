// ==UserScript==
// @name         OA 一键复制审核流程
// @namespace    https://github.com/kukubob/oa-workflow-copy
// @version      1.0.3
// @description  点击小按钮，将当前流程编号复制为“审核流程：编号”。
// @match        *://*/spa/workflow/*
// @homepageURL  https://github.com/kukubob/personal-userscripts
// @downloadURL  https://raw.githubusercontent.com/kukubob/personal-userscripts/main/oa-workflow-copy.user.js
// @updateURL    https://raw.githubusercontent.com/kukubob/personal-userscripts/main/oa-workflow-copy.user.js
// @run-at       document-idle
// @grant        GM_setClipboard
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const elementId = 'oa-copy-workflow-button';
  if (window.top !== window.self || document.getElementById(elementId)) return;

  function requestId() {
    const url = new URL(location.href);
    const route = url.hash.slice(1);
    const queryStart = route.indexOf('?');
    // 只在流程详情路由显示，附件和流程列表不显示。
    if (!/^\/main\/workflow\/req\/?$/.test(route.split('?')[0])) return null;
    const params = new URLSearchParams(queryStart < 0 ? '' : route.slice(queryStart + 1));
    const values = params.has('requestid') ? params.getAll('requestid') : url.searchParams.getAll('requestid');
    return values.length === 1 && /^[1-9]\d*$/.test(values[0]) ? values[0] : null;
  }

  const button = document.createElement('button');
  button.id = elementId;
  button.type = 'button';
  button.style.cssText = 'position:fixed;right:16px;top:20px;z-index:2147483647;' +
    'padding:7px 11px;border:1px solid #d9dfe7;border-radius:6px;' +
    'background:#fff;color:#526174;font:13px/1.5 system-ui,sans-serif;cursor:pointer;' +
    'box-shadow:0 1px 4px #00000012;';
  button.setAttribute('aria-live', 'polite');
  let displayedId;
  let resetTimer;
  let operation = 0;

  function render() {
    const id = requestId();
    button.hidden = !id;
    if (id !== displayedId) {
      displayedId = id;
      operation += 1;
      clearTimeout(resetTimer);
      button.disabled = false;
      button.textContent = '复制审核流程';
      button.title = id ? `复制：审核流程：${id}` : '';
    }
  }

  button.addEventListener('click', () => {
    render(); // 点击时重新取号，避免单页跳转后复制旧编号。
    const id = requestId();
    if (!id) return;
    const currentOperation = ++operation;
    button.disabled = true;
    button.textContent = '复制中…';
    function finish(message) {
      if (currentOperation !== operation) return;
      clearTimeout(resetTimer);
      button.disabled = false;
      button.textContent = message;
      resetTimer = setTimeout(() => {
        button.textContent = '复制审核流程';
      }, 1800);
    }
    // 扩展剪贴板 API 支持 HTTP 页面；不读取原有剪贴板内容。
    resetTimer = setTimeout(() => finish('未确认复制，请重试'), 4000);
    try {
      GM_setClipboard(`审核流程：${id}`, 'text', () => finish('已复制'));
    } catch {
      finish('复制失败，请重试');
    }
  });

  document.body.appendChild(button);
  render();
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  // 覆盖 pushState/replaceState 跳转，无须改写 OA 自身函数。
  setInterval(render, 800);
})();
