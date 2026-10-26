/* 朱批书房 · 扩展真题题库加载器
 * 题库包来自公开整理的真题库（ERRRC/xingcezhenti，经 jangviktor-web/GongkaoNaoku 去重整理）。
 * 版权归原作者与原题库平台，仅供个人学习使用，请勿公开传播。
 *
 * 加载方式：
 *  - 通过本地服务器 / 网站访问时：fetch JSON 题库包（带进度）；
 *  - 直接双击 index.html（file://）时：改用 <script> 加载同名 JS 题库包，
 *    绕过浏览器对本地文件 fetch 的限制。
 */
'use strict';

const PACK_QUESTIONS = [];

const PackStore = (() => {
  let promise = null;
  let loaded = false;
  let manifestData = null;

  const PACK_VERSION = '3.2';
  const base = () => 'js/data/packs/';
  const withVersion = (path) => location.protocol === 'file:' ? path : path + '?v=' + PACK_VERSION;

  function loadScript(src, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        script.remove();
        reject(new Error('加载超时：' + src));
      }, timeout);
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new Error('题库包加载失败：' + src));
      };
      document.head.appendChild(script);
    });
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + '：' + url);
    return res.json();
  }

  function collectChunks() {
    const all = [];
    (window.__PACK_CHUNKS || []).forEach(chunk => {
      if (chunk && Array.isArray(chunk.questions)) all.push(...chunk.questions);
    });
    return all;
  }

  async function loadViaScript(onProgress) {
    window.__PACK_CHUNKS = [];
    await loadScript(withVersion(base() + 'manifest.js'));
    const manifest = window.PACK_MANIFEST || { files: [] };
    manifestData = manifest;
    const files = Array.isArray(manifest.files) ? manifest.files : [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) onProgress({ done: i, total: files.length, file: file.file, count: file.count || 0 });
      const jsFile = String(file.file).replace(/\.json$/, '.js');
      await loadScript(withVersion(base() + jsFile));
      if (onProgress) onProgress({ done: i + 1, total: files.length, file: file.file, count: file.count || 0 });
    }

    return collectChunks();
  }

  async function loadViaFetch(onProgress) {
    const manifest = await fetchJson(withVersion(base() + 'manifest.json'));
    manifestData = manifest;
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const all = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) onProgress({ done: i, total: files.length, file: file.file, count: file.count || 0 });
      const list = await fetchJson(withVersion(base() + file.file));
      if (Array.isArray(list)) all.push(...list);
      if (onProgress) onProgress({ done: i + 1, total: files.length, file: file.file, count: file.count || 0 });
    }
    return all;
  }

  function load(onProgress) {
    if (promise) return promise;

    promise = (async () => {
      let all = [];
      if (location.protocol === 'file:') {
        all = await loadViaScript(onProgress);
      } else {
        try {
          all = await loadViaFetch(onProgress);
        } catch (err) {
          console.warn('JSON 题库包加载失败，改用脚本方式', err);
          all = await loadViaScript(onProgress);
        }
      }

      PACK_QUESTIONS.length = 0;
      PACK_QUESTIONS.push(...all);
      loaded = true;
      return all;
    })().catch(err => {
      promise = null;
      throw err;
    });

    return promise;
  }

  return {
    load,
    isLoaded() { return loaded; },
    total() { return PACK_QUESTIONS.length; },
    manifest() { return manifestData; }
  };
})();
