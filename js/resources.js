/* 朱批书房 · 考公资源导航 */
'use strict';

const Resources = (() => {
  function render(view) {
    const cats = KAOGONG_LINKS.categories.map(cat => `
      <div class="cat-head">
        <span class="char-tile">${cat.glyph}</span>
        <div>
          <h2>${esc(cat.name)}</h2>
          <p>${esc(cat.note)}</p>
        </div>
      </div>
      <div class="grid grid-2">
        ${cat.items.map(item => `
          <a class="link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="glyph">${esc(item.glyph)}</span>
            <span>
              <b>${esc(item.name)}</b>
              <span>${esc(item.desc)}</span>
            </span>
            <span class="ext" aria-hidden="true">↗</span>
          </a>`).join('')}
      </div>`).join('');

    view.innerHTML = `
      <div class="page-head">
        <h1>考公资源</h1>
        <p class="lead">备考学习网站、考试信息发布平台和权威时政媒体。全部在新标签页打开，不影响站内做题进度。</p>
      </div>

      <div class="note-banner">
        <b>时政热点</b>　除了下方媒体入口，站内“时政热点”页会自动抓取中新网即时新闻与政府网政策发布，并在有新内容时提醒。
        <a class="btn btn-outline btn-sm" href="#/news" style="margin-left:10px">打开时政热点</a>
      </div>

      ${cats}

      <div class="note-banner mt-24">
        <b>提示</b>　考试公告以官方网站为准，谨防非官方渠道的“保过”“内部资料”等虚假信息。链接失效或需要增删，可修改 <span class="kbd">js/data/kaogong.js</span>。
      </div>`;
  }

  return { render };
})();
