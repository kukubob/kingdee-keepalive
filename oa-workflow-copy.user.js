// ==UserScript==
// @name         OA 一键复制审核流程
// @namespace    https://github.com/kukubob/oa-workflow-copy
// @version      1.2.0
// @description  复制流程编号或在 Codex 指定项目预填审核提示，隐藏流程页面水印。
// @match        *://*/spa/workflow/*
// @homepageURL  https://github.com/kukubob/personal-userscripts
// @downloadURL  https://raw.githubusercontent.com/kukubob/personal-userscripts/main/oa-workflow-copy.user.js
// @updateURL    https://raw.githubusercontent.com/kukubob/personal-userscripts/main/oa-workflow-copy.user.js
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
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

  // 仅隐藏已确认的流程水印容器，不碰表单、附件或原文件。
  const watermarkStyle = document.createElement('style');
  watermarkStyle.textContent = 'html[data-oa-workflow-clean] #wf_watremark_wrap { display:none !important; }';
  document.head.appendChild(watermarkStyle);

  const projectPathKey = 'codex-project-path';
  function configureProject() {
    const value = window.prompt('输入 Codex 已有项目的完整本地目录（仅保存在本机油猴设置中）：', GM_getValue(projectPathKey, ''));
    if (value === null) return null;
    const path = value.trim();
    if (!path || /[\r\n\0]/.test(path) || !(path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path))) {
      window.alert('请输入完整的绝对路径。');
      return null;
    }
    GM_setValue(projectPathKey, path);
    return path;
  }
  GM_registerMenuCommand('设置 Codex 项目目录', configureProject);

  const panel = document.createElement('div');
  panel.id = 'oa-workflow-tools';
  panel.style.cssText = 'position:fixed;right:32px;top:84px;z-index:2147483647;display:flex;gap:8px;';
  const button = document.createElement('button');
  button.id = elementId;
  button.type = 'button';
  button.style.cssText = 'width:126px;box-sizing:border-box;white-space:nowrap;padding:7px 11px;border:1px solid #d9dfe7;border-radius:6px;' +
    'background:#fff;color:#526174;font:13px/1.5 system-ui,sans-serif;cursor:pointer;' +
    'box-shadow:0 1px 4px #00000012;';
  button.setAttribute('aria-live', 'polite');
  const codexButton = document.createElement('button');
  codexButton.id = 'oa-open-codex-button';
  codexButton.type = 'button';
  codexButton.textContent = '在 Codex 中打开';
  codexButton.style.cssText = button.style.cssText;
  codexButton.style.width = '142px';
  codexButton.title = '打开所选 Codex 项目，预填审核流程编号，由你手动发送';
  codexButton.addEventListener('click', () => {
    const id = requestId();
    if (!id) return;
    const path = GM_getValue(projectPathKey, '') || configureProject();
    if (!path) return;
    const target = new URL('codex://new');
    target.searchParams.set('path', path);
    target.searchParams.set('prompt', `审核流程：${id}`);
    // 仅唤起客户端并预填草稿，不传递 OA 地址或自动发送。
    window.location.href = target.toString();
  });
  panel.append(button, codexButton);
  let displayedId;
  let resetTimer;
  let operation = 0;

  function positionButton() {
    // 固定在表单区域右上角，位于顶部操作栏下方。
    const header = document.querySelector('.wea-new-top-req-title');
    const rect = header?.getBoundingClientRect();
    const top = rect && rect.height > 0 ? Math.max(0, rect.bottom) + 12 : 84;
    panel.style.left = 'auto';
    panel.style.top = `${top}px`;
    panel.style.right = '32px';
    panel.style.bottom = 'auto';
  }

  function render() {
    const id = requestId();
    panel.style.display = id ? 'flex' : 'none';
    document.documentElement.toggleAttribute('data-oa-workflow-clean', Boolean(id));
    if (id !== displayedId) {
      displayedId = id;
      operation += 1;
      clearTimeout(resetTimer);
      button.disabled = false;
      button.textContent = '复制审核流程';
      button.title = id ? `复制：审核流程：${id}` : '';
    }
    if (id) positionButton();
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

  document.body.appendChild(panel);
  render();
  window.addEventListener('resize', render);
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  // 覆盖 pushState/replaceState 跳转，无须改写 OA 自身函数。
  setInterval(render, 800);
})();
