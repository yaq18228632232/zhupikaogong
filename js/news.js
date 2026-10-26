/* 朱批书房 · 时政热点（RSS 抓取 + 提醒） */
'use strict';

const News = (() => {
  const CACHE_KEY = 'zhubi_news_cache_v1';
  const SEEN_KEY = 'zhubi_news_seen_v1';
  const POLL_MS = 15 * 60 * 1000;

  let items = [];            // {id,title,link,date,desc,source,tag}
  let status = 'idle';       // idle | loading | ok | cached | error
  let errors = [];
  let lastUpdated = 0;
  let filter = 'all';
  let newIds = new Set();
  let unseenCount = 0;
  let refreshing = false;
  let pollTimer = null;

  const LETTERS = ['A', 'B', 'C', 'D'];
  void LETTERS;

  /* ---------- 工具 ---------- */

  function cleanText(html) {
    const s = String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    const ta = document.createElement('textarea');
    ta.innerHTML = s;
    return ta.value.replace(/\s+/g, ' ').trim();
  }

  function parseDate(value) {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function fmtNewsDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
      : `${d.getMonth() + 1}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- 抓取 ---------- */

  function normalizeItem(raw, source) {
    const title = cleanText(raw.title);
    if (!title) return null;
    const link = String(raw.link || '').trim();
    const date = parseDate(raw.pubDate || raw.date || raw.published);
    const desc = cleanText(raw.description || raw.desc || raw.summary).slice(0, 160);
    return {
      id: link || source.id + '|' + title,
      title,
      link,
      date,
      desc,
      source: source.name,
      tag: source.tag
    };
  }

  async function fetchFeed(source) {
    const rssUrl = source.url;

    /* 方式一：rss2json（返回 JSON，自带 CORS） */
    try {
      const res = await fetchWithTimeout(
        'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl),
        15000
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'ok' && Array.isArray(data.items)) {
          const list = data.items.map(it => normalizeItem(it, source)).filter(Boolean);
          if (list.length) return list;
        }
      }
    } catch (err) { /* 尝试下一种方式 */ }

    /* 方式二：allorigins 代理原始 XML（自带 CORS） */
    try {
      const res = await fetchWithTimeout(
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl),
        15000
      );
      if (res.ok) {
        const text = await res.text();
        const list = parseRssXml(text, source);
        if (list.length) return list;
      }
    } catch (err) { /* 失败 */ }

    throw new Error(source.name + ' 暂时无法获取');
  }

  function parseRssXml(text, source) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    return Array.from(doc.querySelectorAll('item')).map(node => {
      const get = tag => {
        const el = node.querySelector(tag);
        return el ? el.textContent : '';
      };
      return normalizeItem({
        title: get('title'),
        link: get('link'),
        pubDate: get('pubDate'),
        description: get('description')
      }, source);
    }).filter(Boolean);
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cache = JSON.parse(raw);
      if (cache && Array.isArray(cache.items)) {
        items = cache.items;
        lastUpdated = cache.updatedAt || 0;
        status = items.length ? 'cached' : 'idle';
      }
    } catch (err) { /* 忽略损坏缓存 */ }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        updatedAt: lastUpdated,
        items: items.slice(0, 80)
      }));
    } catch (err) { /* 空间不足时忽略 */ }
  }

  function getSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (!raw) return { ids: [], ts: 0 };
      const obj = JSON.parse(raw);
      return { ids: Array.isArray(obj.ids) ? obj.ids : [], ts: obj.ts || 0 };
    } catch (err) { return { ids: [], ts: 0 }; }
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify({
        ids: items.slice(0, 200).map(i => i.id),
        ts: Date.now()
      }));
    } catch (err) { /* 忽略 */ }
    unseenCount = 0;
    updateBadge();
  }

  function computeUnseen(list) {
    const seen = getSeen();
    if (!seen.ids.length) return { count: 0, ids: new Set() };
    const ids = new Set();
    list.forEach(item => { if (!seen.ids.includes(item.id)) ids.add(item.id); });
    return { count: ids.size, ids };
  }

  function updateBadge() {
    const badge = document.querySelector('#news-badge');
    if (!badge) return;
    if (unseenCount > 0) {
      badge.hidden = false;
      badge.textContent = unseenCount > 99 ? '99+' : String(unseenCount);
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function mergeItems(groups) {
    const map = new Map();
    groups.flat().forEach(item => {
      if (!map.has(item.id)) map.set(item.id, item);
    });
    return Array.from(map.values())
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, 80);
  }

  /* ---------- 刷新 ---------- */

  async function refresh({ silent = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    if (!silent) {
      status = 'loading';
      rerenderIfNews();
    }

    const results = await Promise.allSettled(NEWS_SOURCES.map(s => fetchFeed(s)));
    const groups = [];
    const errs = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') groups.push(r.value);
      else errs.push(r.reason && r.reason.message ? r.reason.message : NEWS_SOURCES[i].name + ' 获取失败');
    });

    const fresh = mergeItems(groups);
    errors = errs;

    if (fresh.length) {
      const unseen = computeUnseen(fresh);
      newIds = unseen.ids;
      unseenCount = unseen.count;
      items = fresh;
      lastUpdated = Date.now();
      status = 'ok';
      saveCache();
      if (unseenCount > 0) notifyNew(unseenCount);
    } else if (items.length) {
      status = 'cached';
    } else {
      status = 'error';
    }

    refreshing = false;
    updateBadge();
    rerenderIfNews();
  }

  function rerenderIfNews() {
    const h = location.hash || '';
    if (h.startsWith('#/news') || h.startsWith('#/home')) {
      try { App.route(); } catch (err) { /* 应用尚未就绪 */ }
    }
  }

  function notifyNew(count) {
    const settings = Store.get().settings;
    if (!settings.newsNotify) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const first = items.find(i => newIds.has(i.id));
    try {
      const n = new Notification('时政热点有更新', {
        body: (first ? first.title : `${count} 条新内容`) + (count > 1 ? `（共 ${count} 条）` : ''),
        tag: 'zhubi-news'
      });
      n.onclick = () => { window.focus(); location.hash = '#/news'; n.close(); };
    } catch (err) { /* 某些浏览器要求 Service Worker，忽略 */ }
  }

  async function enableNotify() {
    if (!('Notification' in window)) { toast('当前浏览器不支持桌面通知'); return; }
    if (Store.get().settings.newsNotify) {
      Store.setSetting('newsNotify', false);
      toast('已关闭桌面提醒');
      rerenderIfNews();
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        Store.setSetting('newsNotify', true);
        toast('已开启桌面提醒：有新热点时会通知你');
      } else {
        toast('未获得通知权限，可在浏览器设置中允许');
      }
    } catch (err) {
      toast('无法开启通知：' + err.message);
    }
    rerenderIfNews();
  }

  /* ---------- 页面 ---------- */

  function render(view) {
    if (!items.length && status === 'idle') {
      setTimeout(() => refresh(), 0);
    } else if (Date.now() - lastUpdated > 10 * 60 * 1000 && !refreshing) {
      setTimeout(() => refresh({ silent: true }), 0);
    }

    const tags = ['all'].concat(Array.from(new Set(NEWS_SOURCES.map(s => s.tag))));
    const tabs = tags.map(tag => {
      const label = tag === 'all' ? '全部' : tag;
      return `<button type="button" data-news-filter="${tag}" class="${filter === tag ? 'active' : ''}">${esc(label)}</button>`;
    }).join('');

    const visible = (filter === 'all' ? items : items.filter(i => i.tag === filter)).slice(0, 40);

    const listHtml = visible.length ? visible.map(item => `
      <article class="news-item">
        <div class="news-meta">
          <span class="chip primary">${esc(item.tag)}</span>
          <span>${esc(item.source)}</span>
          <span>${fmtNewsDate(item.date)}</span>
          ${newIds.has(item.id) ? '<span class="chip warn">新</span>' : ''}
        </div>
        <h3 class="news-title">
          ${item.link
            ? `<a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`
            : esc(item.title)}
        </h3>
        ${item.desc ? `<p class="news-desc">${esc(item.desc)}</p>` : ''}
      </article>`).join('') : `
      <div class="empty">
        <b>${status === 'loading' ? '正在获取最新时政…' : '暂时没有可显示的新闻'}</b>
        ${status === 'error' ? '抓取服务可能被网络限制，可直接点击下方来源浏览。' : '点击“刷新”重试，或直接访问下方官方来源。'}
      </div>`;

    const notifySupported = 'Notification' in window;
    const notifyOn = Store.get().settings.newsNotify && notifySupported && Notification.permission === 'granted';

    const statusLine = status === 'loading'
      ? '<span class="chip">正在刷新…</span>'
      : status === 'error'
        ? '<span class="chip bad">获取失败</span>'
        : status === 'cached'
          ? '<span class="chip warn">显示缓存内容</span>'
          : status === 'ok'
            ? '<span class="chip ok">已更新</span>'
            : '';

    view.innerHTML = `
      <div class="page-head">
        <h1>时政热点</h1>
        <p class="lead">自动抓取官方媒体与政策发布的最新内容，用于申论素材积累和时政常识。页面打开时刷新一次，之后每 15 分钟自动检查更新。</p>
      </div>

      <div class="card mb-16">
        <div class="spread">
          <div class="row">
            <span class="session-title">最新时政</span>
            ${statusLine}
            <span class="small muted">${lastUpdated ? '上次更新 ' + fmtDateTime(lastUpdated) : '尚未更新'}</span>
          </div>
          <div class="row">
            ${notifySupported ? `<button class="btn ${notifyOn ? 'btn-outline' : 'btn-ghost'} btn-sm" type="button" id="notify-btn">${notifyOn ? '桌面提醒已开启' : '开启桌面提醒'}</button>` : ''}
            <button class="btn btn-primary btn-sm" type="button" id="refresh-news" ${refreshing ? 'disabled' : ''}>${refreshing ? '刷新中…' : '刷新'}</button>
          </div>
        </div>
        ${errors.length ? `<p class="small muted" style="margin-top:10px">部分来源暂时不可用：${esc(errors.join('；'))}</p>` : ''}
        <div class="seg mt-16">${tabs}</div>
      </div>

      <div class="flex-col">${listHtml}</div>

      <div class="section-title"><h2>官方来源</h2><span class="more">点击直接浏览</span></div>
      <div class="grid grid-2">
        ${NEWS_SOURCES.map(s => {
          /* 这里要跳官网首页，不是 RSS 地址——RSS 打开是一堆 XML */
          const home = s.home || String(s.url || '').replace(/\/rss\/.*$/, '').replace(/\/pushinfo.*$/, '');
          return `
          <a class="link-card" href="${esc(home)}" target="_blank" rel="noopener noreferrer">
            <span class="glyph">${esc(s.tag.charAt(0))}</span>
            <span><b>${esc(s.name)}</b><span>${esc(home.replace(/^https?:\/\//, ''))}</span></span>
            <span class="ext" aria-hidden="true">↗</span>
          </a>`;
        }).join('')}
      </div>

      <div class="note-banner mt-24">
        <b>关于“推送”</b>　纯静态网站无法在浏览器关闭后推送消息。这里的做法是：页面打开期间每 15 分钟自动刷新，有新内容时在左侧“时政热点”旁显示数量角标，并可选择开启桌面提醒（需浏览器允许通知）。抓取通过公共 RSS 转换服务完成，若网络受限导致失败，可直接点击上方官方来源浏览。
      </div>`;

    $$('[data-news-filter]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.newsFilter;
        render(view);
      });
    });

    const refreshBtn = $('#refresh-news', view);
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());

    const notifyBtn = $('#notify-btn', view);
    if (notifyBtn) notifyBtn.addEventListener('click', enableNotify);

    /* 用户已看到本页内容，清除未读角标（保留本次“新”标记） */
    if (items.length && status !== 'loading') markSeen();
  }

  function cachedTop(n) {
    return items.slice(0, n);
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastUpdated > POLL_MS) {
        refresh({ silent: true });
      }
    });
    /* 首次静默获取，用于首页和角标 */
    if (!items.length) refresh({ silent: true });
  }

  /* 初始化缓存 */
  loadCache();
  if (items.length) {
    const unseen = computeUnseen(items);
    unseenCount = unseen.count;
    newIds = unseen.ids;
  }

  return {
    render,
    refresh,
    cachedTop,
    startPolling,
    updateBadge,
    markSeen
  };
})();
