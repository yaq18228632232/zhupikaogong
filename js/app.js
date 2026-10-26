/* 朱批书房 · 应用入口：路由、侧栏、首页、交大入口、设置 */
'use strict';

const NAV_ITEMS = [
  { path: '/home', label: '首页', icon: 'i-home', title: '首页' },
  { path: '/practice', label: '行测刷题', icon: 'i-pen', title: '行测刷题' },
  { path: '/exam', label: '模拟考试', icon: 'i-timer', title: '模拟考试' },
  { path: '/shenlun', label: '申论学习', icon: 'i-book', title: '申论学习' },
  { path: '/aichat', label: 'AI 问答', icon: 'i-chat', title: 'AI 问答助手' },
  { path: '/news', label: '时政热点', icon: 'i-news', title: '时政热点' },
  { path: '/resources', label: '考公资源', icon: 'i-compass', title: '考公资源' },
  { path: '/mistakes', label: '错题本', icon: 'i-flag', title: '错题本' },
  { path: '/stats', label: '学习统计', icon: 'i-chart', title: '学习统计' },
  { path: '/import', label: '题库导入', icon: 'i-upload', title: '题库导入' },
  { path: '/sjtu', label: '交大入口', icon: 'i-link', title: '交大入口' },
  { path: '/account', label: '我的账号', icon: 'i-user', title: '我的账号' },
  { path: '/settings', label: '设置', icon: 'i-gear', title: '设置' }
];

const ROUTES = {
  '/home': () => Home,
  '/practice': () => Practice,
  '/exam': () => Exam,
  '/shenlun': () => Shenlun,
  '/aichat': () => AiChat,
  '/news': () => News,
  '/resources': () => Resources,
  '/mistakes': () => Mistakes,
  '/stats': () => Stats,
  '/import': () => ImportPage,
  '/sjtu': () => Sjtu,
  '/account': () => AccountPage,
  '/settings': () => Settings
};

/* ==================== 主题 ==================== */

const Theme = {
  apply(theme) {
    document.documentElement.dataset.theme = theme || 'crimson';
    $$('.theme-pick button').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === (theme || 'crimson')));
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#151619' : theme === 'blue' ? '#1F4E79' : '#C8102E');
  },
  set(theme) {
    Store.setSetting('theme', theme);
    Theme.apply(theme);
  }
};

/* ==================== 首页 ==================== */

const Home = (() => {
  function countdownText() {
    const dateStr = Store.get().settings.examDate;
    if (!dateStr) return '还没有设置考试日期，可在<a class="link" href="#/settings">设置</a>里添加，首页会显示倒计时。';
    const target = dateFromStr(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((target - today) / 86400000);
    if (days > 0) return `距离 <b>${esc(dateStr)}</b> 的考试还有 <b>${days}</b> 天。`;
    if (days === 0) return '<b>今天就是考试日</b>，沉着应考，祝顺利。';
    return '考试日期已过，可在<a class="link" href="#/settings">设置</a>中更新。';
  }

  function render(view) {
    const s = Store.stats();
    const stats = [
      { value: s.todayCount, unit: '题', label: '今日作答' },
      { value: s.accuracy, unit: '%', label: '总正确率' },
      { value: s.streak, unit: '天', label: '连续学习' },
      { value: s.mistakesCount, unit: '题', label: '错题本' }
    ].map(x => `<div class="stat"><b>${x.value}<small>${x.unit}</small></b><span>${x.label}</span></div>`).join('');

    const tiles = MODULES.map(m => {
      const slot = s.byModule[m.id];
      const attempted = slot && slot.attempted ? slot.attempted.size : 0;
      return `<a class="tile" href="#/practice">
        <span class="char-tile">${m.glyph}</span>
        <b>${esc(m.name)}</b>
        <span>${esc(m.desc)}</span>
        <span class="small">已做 ${attempted} / ${slot ? slot.bankSize : Bank.byModule(m.id).length} 题</span>
      </a>`;
    }).join('');

    const exams = Store.get().exams.slice(0, 3);
    const examHtml = exams.length ? `
      <div class="section-title"><h2>最近考试</h2><a class="more" href="#/stats">查看全部</a></div>
      <div class="card" style="padding:6px 12px">
        <table class="table">
          <thead><tr><th>时间</th><th>得分</th><th>答对</th></tr></thead>
          <tbody>${exams.map(e => `<tr><td>${fmtDateTime(e.t)}</td><td class="num"><b>${e.score}</b></td><td class="num">${e.correct} / ${e.total}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : '';

    const headlines = News.cachedTop(3);
    const newsHtml = headlines.length ? `
      <div class="section-title"><h2>今日时政</h2><a class="more" href="#/news">查看全部</a></div>
      <div class="card" style="padding:4px 16px">
        ${headlines.map(item => `
          <a class="home-news" href="${item.link ? esc(item.link) : '#/news'}" ${item.link ? 'target="_blank" rel="noopener noreferrer"' : ''}>
            <span class="home-news-src">${esc(item.source)}</span>
            <b>${esc(item.title)}</b>
          </a>`).join('')}
      </div>` : `
      <div class="section-title"><h2>今日时政</h2><a class="more" href="#/news">打开</a></div>
      <div class="note-banner">打开<a class="link" href="#/news">时政热点</a>页，自动获取中新网即时新闻和政府网最新政策，顺便积累申论素材。</div>`;

    view.innerHTML = `
      <section class="brief">
        <p class="eyebrow">${fmtDateCN(new Date())}</p>
        <h1>今日学习简报</h1>
        <p class="lead">${countdownText()}</p>
        <div class="stat-row">${stats}</div>
        <div class="brief-actions">
          <a class="btn btn-primary" href="#/practice">开始刷题</a>
          <a class="btn btn-outline" href="#/exam">模拟考试</a>
          <a class="btn btn-outline" href="#/shenlun">写申论</a>
          <a class="btn btn-ghost" href="#/news">时政热点</a>
          <a class="btn btn-ghost" href="#/import">导入题库</a>
        </div>
      </section>

      <div class="section-title"><h2>行测模块</h2><a class="more" href="#/practice">进入练习</a></div>
      <div class="tile-grid">${tiles}</div>

      ${newsHtml}

      ${examHtml}

      <div class="section-title"><h2>怎么用</h2></div>
      <div class="grid grid-3">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:6px">刷题与模考</h3>
          <p class="small muted">按模块练习即时看解析；模拟考试按国考 135 题、120 分钟组卷，交卷自动评分。答错自动进错题本。</p>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:6px">导入自己的题库</h3>
          <p class="small muted">支持 PDF / Word(.docx) / 文本，自动识别题目并校对导入；也可以用大模型根据材料出题。</p>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:6px">数据在本机</h3>
          <p class="small muted">练习记录存在浏览器里，不上传服务器。换设备前在设置中导出 JSON 备份。</p>
        </div>
      </div>`;
  }

  return { render };
})();

/* ==================== 交大入口 ==================== */

const Sjtu = (() => {
  function render(view) {
    const cats = SJTU_LINKS.categories.map(cat => `
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
        <h1>交大入口</h1>
        <p class="lead">常用的上海交通大学网站，按用途分类。全部在新标签页打开，不影响这里的做题进度。</p>
      </div>
      <div class="note-banner">
        <b>关于登录</b>　点击卡片后在新标签页登录一次，勾选“记住我”或让浏览器保存密码，之后一般无需重复登录。本站不保存、不代理任何交大账号信息，登录状态完全由浏览器管理。
      </div>
      ${cats}
      <div class="note-banner mt-24">
        <b>提示</b>　若某个地址发生变化或无法访问，可以直接修改 <span class="kbd">js/data/sjtu.js</span> 中的链接，或在设置页查看文件说明。
      </div>`;
  }

  return { render };
})();

/* ==================== 设置 ==================== */

const Settings = (() => {
  const HIST_LIMIT = 300;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function timeLabel(t) {
    const d = new Date(t);
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (sameDay) return hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  /* 类型标签配色：按类别映射到已有语义色，未收录的类型用主色 */
  const TAG_TONE = { '答题': 't-answer', '错题': 't-wrong', '申论': 't-write', '模考': 't-exam', '设置': 't-cfg', '数据': 't-data', '题库': 't-bank' };
  function tagClass(type) {
    return 'h-tag ' + (TAG_TONE[type] || 't-answer');
  }

  function renderHistory(list) {
    if (!list.length) {
      return '<div class="hist-empty">还没有操作记录。去练几道题、写一段申论，回来就能看到。</div>';
    }
    return '<div class="hist-list">' + list.map(h => {
      let text = esc(h.text);
      if (h.batch && h.n > 1) text += '<span class="small muted"> · 同批共 ' + h.n + ' 题</span>';
      return `<div class="hist-item">
        <span class="h-time">${timeLabel(h.t)}</span>
        <span class="${tagClass(h.type)}">${esc(h.type)}</span>
        <span class="h-text">${text}</span>
      </div>`;
    }).join('') + '</div>';
  }

  function historyText(list) {
    const head = '朱批书房 · 操作记录（导出时间 ' + new Date().toLocaleString('zh-CN') + '）\n' +
      '共 ' + list.length + ' 条\n' + '-'.repeat(40) + '\n';
    return head + list.map(h => {
      const d = new Date(h.t);
      const ts = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
      return ts + '  [' + h.type + ']  ' + h.text + (h.batch && h.n > 1 ? '（同批共 ' + h.n + ' 题）' : '');
    }).join('\n') + '\n';
  }

  function render(view) {
    const settings = Store.get().settings;
    const histList = Store.history();
    const acctSnap = (typeof Account !== 'undefined') ? Account.snapshot() : { user: null, filesystem: false };
    const acctSigned = !!(acctSnap && acctSnap.user);
    const acctLine = acctSnap && acctSnap.filesystem
      ? '当前通过本地文件打开，云账号不可用；通过线上地址访问即可注册。'
      : acctSigned
        ? '已登录为 ' + Account.maskEmail(acctSnap.user.email) + '，学习进度会自动同步到云端。'
        : '可选功能：用邮箱验证码注册后，做题记录、错题、草稿可在多台设备之间同步。不注册也完全可用。';
    const ai = settings.ai || {};
    const hasOwnKey = !!(ai.apiKey && String(ai.apiKey).trim());
    const hasSharedKey = typeof AI_SHARED_KEY === 'string' && AI_SHARED_KEY.trim() !== '';
    const keyStateLine = hasOwnKey
      ? '当前使用<b>你自己填写的 Key</b>（仅本机保存）。清空后即回到站点共享额度。'
      : hasSharedKey
        ? '当前使用<b>站点共享额度</b>，无需填写即可使用；额度用尽或想用自己的额度，可在下面填自己的 Key。'
        : '当前<b>尚未配置 Key</b>，AI 批改与 AI 出题需要你先在下面填入自己的 Key。';

    /* 当前保存的模型名若不在可用清单里，说明是之前填错的，
     * 它会导致每次 AI 批改都被接口拒绝——这里直接摆出来并给一键修复。 */
    const modelCheck = aiCheckModel(ai.baseUrl || AI_DEFAULT.baseUrl, ai.model || AI_DEFAULT.model);
    const themes = [
      ['crimson', '交大红', '#C8102E'],
      ['blue', '政务蓝', '#1F4E79'],
      ['dark', '深色', '#23262B']
    ].map(([id, name, color]) => `
      <button class="theme-card-pick" type="button" data-set-theme="${id}" aria-pressed="${settings.theme === id}">
        <i style="background:${color}"></i>${name}
      </button>`).join('');

    view.innerHTML = `
      <div class="page-head">
        <h1>设置</h1>
        <p class="lead">主题、考试倒计时、数据备份和大模型接口都在这里管理。</p>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:14px">外观主题</h2>
        <div class="theme-cards">${themes}</div>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">扩展真题题库</h2>
        <p class="small muted">${PackStore.isLoaded()
          ? '当前已加载 ' + PackStore.total() + ' 道扩展真题。'
          : '扩展题库未加载（可刷新页面重试）。'}题库包约 70MB，包含约 2.5 万道历年国考、省考行测真题（含图形与图表题），图片按需加载。</p>
        <label class="row" style="gap:8px;margin-top:12px;font-size:13.5px;color:var(--ink-2)">
          <input type="checkbox" id="pack-toggle" ${settings.packEnabled !== false ? 'checked' : ''}> 启动时加载扩展题库（关闭后仅使用内置 210 题）
        </label>
        <p class="desc">题库来源：ERRRC/xingcezhenti（经 GongkaoNaoku 整理）。真题版权归原作者与原题库平台，仅供个人学习，请勿公开传播；公开部署前请删除 <span class="kbd">js/data/packs/</span> 并关闭此项。</p>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:14px">备考倒计时</h2>
        <div class="field">
          <label for="exam-date">考试日期</label>
          <input class="input" type="date" id="exam-date" value="${esc(settings.examDate || '')}">
          <p class="desc">设置后，首页会显示距离考试的天数。国考、市考、选调等都可以随时修改。</p>
        </div>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">云账号与同步</h2>
        <p class="small muted" style="margin-bottom:12px">${acctLine}</p>
        <a class="btn ${acctSigned ? 'btn-outline' : 'btn-primary'}" href="#/account">${acctSigned ? '查看我的账号' : '邮箱注册 / 登录'}</a>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:14px">数据备份</h2>
        <p class="small muted" style="margin-bottom:14px">所有数据保存在当前浏览器中。清除浏览器数据、换浏览器或换设备都会丢失记录，建议定期导出备份。</p>
        <div class="row">
          <button class="btn btn-primary" type="button" id="export-data">导出备份 JSON</button>
          <label class="btn btn-outline" for="import-file" style="margin:0">导入备份<input type="file" id="import-file" accept=".json,application/json" hidden></label>
          <button class="btn btn-ghost" type="button" id="clear-data">清空所有数据</button>
        </div>
        <p class="desc" id="import-note"></p>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">操作记录</h2>
        <p class="small muted">每次答题、加错题、存草稿、交卷、改设置都会立刻写入浏览器本地存储，刷新、关标签页、重启浏览器都不会丢。最多保留最近 ${HIST_LIMIT} 条。</p>
        ${renderHistory(histList)}
        <div class="row" style="margin-top:12px">
          <button class="btn btn-outline" type="button" id="export-hist">导出记录 TXT</button>
          <button class="btn btn-ghost" type="button" id="clear-hist" ${histList.length ? '' : 'disabled'}>清空记录</button>
        </div>
        <p class="hist-foot">当前共 ${histList.length} 条${histList.length >= HIST_LIMIT ? '（已达上限，最早的记录会自动滚掉）' : ''}。</p>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:14px">AI 出题接口</h2>
        <p class="small muted" style="margin-bottom:14px">用于「题库导入 → AI 出题」和「申论写作 → AI 批改」。支持 OpenAI 兼容接口，默认地址为${esc(AI_DEFAULT.name)}。${keyStateLine}</p>
        ${modelCheck.ok ? '' : `
        <div class="note-banner mb-16" style="border-color:var(--color-border-danger)">
          <b style="color:var(--color-text-danger)">当前模型不可用 · AI 批改会失败</b><br>
          ${esc(modelCheck.reason)}
          <div class="row" style="margin-top:10px">
            <button class="btn btn-primary" type="button" id="fix-model">改回默认模型（${esc(AI_DEFAULT.model)}）</button>
          </div>
        </div>`}
        <div class="field">
          <label for="ai-base">接口地址</label>
          <input class="input" type="text" id="ai-base" placeholder="${esc(AI_DEFAULT.baseUrl)}" value="${esc(ai.baseUrl || '')}">
        </div>
        <div class="field">
          <label for="ai-key">你的 API Key（可选）</label>
          <input class="input" type="password" id="ai-key" placeholder="留空则使用站点共享额度" value="${esc(ai.apiKey || '')}" autocomplete="off">
          <p class="desc">不填也能用 AI 批改与 AI 出题，默认走站点共享额度。想用自己的额度时，把 Key 粘贴到这里即可；它只保存在这台电脑的浏览器里，不会上传，也不会分享给其他人。清空后自动回到共享额度。</p>
        </div>
        <div class="field">
          <label for="ai-model">模型</label>
          <select class="select" id="ai-model">
            ${AI_DEFAULT.models.map(m => `<option value="${esc(m.id)}" ${ai.model === m.id ? 'selected' : ''}>${esc(m.label)}${m.note ? ' · ' + esc(m.note) : ''}</option>`).join('')}
            ${ai.model && !AI_DEFAULT.models.some(m => m.id === ai.model) ? `<option value="${esc(ai.model)}" selected>自定义：${esc(ai.model)}</option>` : ''}
          </select>
          <input class="input mt-8" type="text" id="ai-model-custom" placeholder="也可直接填写调用名，如 deepseek-chat">
          <p class="desc">推理型模型（deepseek-reasoner）返回较慢，批改大作文时可能接近超时，日常批改建议用 deepseek-chat 或 qwen。</p>
        </div>
        <div class="row">
          <button class="btn btn-primary" type="button" id="save-ai">保存接口设置</button>
          <button class="btn btn-outline" type="button" id="test-ai">测试连接</button>
          <button class="btn btn-ghost" type="button" id="reset-ai">恢复默认</button>
          <span class="small muted" id="ai-test-note"></span>
        </div>
      </div>

      <div class="card">
        <h2 style="font-size:17px;margin-bottom:10px">关于本站</h2>
        <p class="small muted">朱批书房是纯静态的个人学习网站，无需服务器。内置题目为示例内容，正式备考请以真题和权威资料为准。题目、素材、网站链接都可以直接在源码中修改。</p>
      </div>`;

    $$('[data-set-theme]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        Theme.set(btn.dataset.setTheme);
        render(view);
      });
    });

    const packToggle = $('#pack-toggle', view);
    if (packToggle) packToggle.addEventListener('change', () => {
      Store.setSetting('packEnabled', packToggle.checked);
      toast('已保存，刷新页面后生效');
    });

    const dateInput = $('#exam-date', view);
    dateInput.addEventListener('change', () => {
      Store.setSetting('examDate', dateInput.value);
      toast(dateInput.value ? '已设置考试日期' : '已清除考试日期');
    });

    $('#export-data', view).addEventListener('click', () => {
      downloadFile(`朱批书房-备份-${todayStr()}.json`, JSON.stringify(Store.exportObject(), null, 2));
      toast('备份已导出');
    });

    const importFile = $('#import-file', view);
    importFile.addEventListener('change', async () => {
      if (!importFile.files.length) return;
      const file = importFile.files[0];
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        const ok = await confirmDialog({
          title: '导入备份',
          text: '导入会用备份文件中的数据覆盖当前所有学习记录（作答、错题、草稿、导入题库和设置）。确定继续吗？',
          okText: '覆盖导入'
        });
        if (!ok) return;
        Store.importObject(obj);
        Theme.apply(Store.get().settings.theme);
        toast('导入成功，正在刷新…');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        $('#import-note').textContent = '导入失败：' + (err.message || '文件格式不正确');
        toast('导入失败');
      } finally {
        importFile.value = '';
      }
    });

    $('#clear-data', view).addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '清空所有数据',
        text: '将删除全部做题记录、错题本、申论草稿、导入的题库和设置（主题除外）。此操作无法恢复，建议先导出备份。确定清空吗？',
        okText: '确认清空'
      });
      if (!ok) return;
      Store.resetAll();
      toast('已清空，正在刷新…');
      setTimeout(() => location.reload(), 600);
    });

    const exportHist = $('#export-hist', view);
    if (exportHist) exportHist.addEventListener('click', () => {
      const list = Store.history();
      if (!list.length) { toast('还没有操作记录'); return; }
      downloadFile(`朱批书房-操作记录-${todayStr()}.txt`, historyText(list), 'text/plain');
      toast('记录已导出');
    });

    const clearHist = $('#clear-hist', view);
    if (clearHist) clearHist.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '清空操作记录',
        text: '只清空操作记录，做题记录、错题本、草稿和设置都不受影响。确定清空吗？',
        okText: '清空记录'
      });
      if (!ok) return;
      Store.clearHistory();
      render(view);
      toast('操作记录已清空');
    });

    function readAIForm() {
      const pick = $('#ai-model', view).value;
      const custom = $('#ai-model-custom', view).value.trim();
      return {
        baseUrl: $('#ai-base', view).value.trim() || AI_DEFAULT.baseUrl,
        apiKey: $('#ai-key', view).value.trim(),
        model: custom || pick || AI_DEFAULT.model
      };
    }

    $('#save-ai', view).addEventListener('click', () => {
      const cfg = readAIForm();
      const chk = aiCheckModel(cfg.baseUrl, cfg.model);
      if (!chk.ok) { toast(chk.reason); return; }
      Store.setAI(cfg);
      toast('接口设置已保存');
    });

    const fixBtn = $('#fix-model', view);
    if (fixBtn) fixBtn.addEventListener('click', () => {
      const sel = $('#ai-model', view);
      const custom = $('#ai-model-custom', view);
      if (sel) sel.value = AI_DEFAULT.model;
      if (custom) custom.value = '';
      Store.setAI({ baseUrl: AI_DEFAULT.baseUrl, apiKey: (Store.get().settings.ai || {}).apiKey || '', model: AI_DEFAULT.model });
      render(view);
      toast('已改回默认模型：' + AI_DEFAULT.model);
    });

    const testBtn = $('#test-ai', view);
    if (testBtn) testBtn.addEventListener('click', async () => {
      const cfg = readAIForm();
      const note = $('#ai-test-note', view);
      if (!AI.hasKey(cfg)) { toast(AI.MISSING_KEY); return; }
      const chk = aiCheckModel(cfg.baseUrl, cfg.model);
      if (!chk.ok) { note.textContent = '失败：' + chk.reason; toast('模型不可用'); return; }
      testBtn.disabled = true;
      note.textContent = '测试中…（最长 60 秒）';
      try {
        const reply = await AI.chat(cfg, '只回复两个字：可用', { system: '你是接口连通性测试助手。', timeout: 60000 });
        note.textContent = '连通正常 · ' + cfg.model + ' 返回「' + String(reply).trim().slice(0, 20) + '」';
        toast('接口可用');
      } catch (err) {
        note.textContent = '失败：' + (err.message || err);
        toast('连接失败');
      } finally {
        testBtn.disabled = false;
      }
    });

    const resetBtn = $('#reset-ai', view);
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '恢复默认接口',
        text: '将把接口地址和模型恢复为 ' + AI_DEFAULT.name + ' 的默认值，并清空你自己填写的 Key。确定吗？',
        okText: '恢复默认'
      });
      if (!ok) return;
      Store.resetAI();
      render(view);
      toast('已恢复默认接口');
    });
  }

  return { render };
})();

/* ==================== 我的账号 ==================== */

const AccountPage = (() => {
  let countdown = 0;
  let timer = null;
  let notice = '';

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    countdown = 0;
  }

  function syncLine() {
    const snap = Account.snapshot();
    if (!snap.user) return '';
    if (snap.lastSyncAt) {
      const d = new Date(snap.lastSyncAt);
      const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '上次同步 ' + hm;
    }
    return '已登录，尚未同步';
  }

  function signedInView(view) {
    const snap = Account.snapshot();
    const u = snap.user || {};
    const data = Store.get();
    const count = (data.answers || []).length;
    return `
      <div class="page-head">
        <h1>我的账号</h1>
        <p class="lead">进度已绑定到邮箱，换电脑、换浏览器只要登录就能接上。</p>
      </div>

      <div class="card mb-16">
        <div class="acct-head">
          <div class="acct-avatar">${esc((u.email || '我').slice(0, 1).toUpperCase())}</div>
          <div class="acct-id">
            <div class="acct-email">${esc(Account.maskEmail(u.email) || '已登录')}</div>
            <div class="small muted">${esc(syncLine())}</div>
          </div>
          <button class="btn btn-ghost" type="button" id="acct-signout">退出登录</button>
        </div>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">进度同步</h2>
        <p class="small muted" style="margin-bottom:14px">答题记录、错题、申论草稿、模考成绩、导入题库都会同步到云端。主题外观和 AI 接口属于本机偏好，不上传。</p>
        <div class="acct-stats">
          <div><b>${count}</b><span>累计答题</span></div>
          <div><b>${Object.keys(data.mistakes || {}).length}</b><span>错题</span></div>
          <div><b>${Object.keys(data.drafts || {}).length}</b><span>申论草稿</span></div>
          <div><b>${(data.exams || []).length}</b><span>模考</span></div>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn btn-primary" type="button" id="acct-push">立即上传本机进度</button>
          <button class="btn btn-outline" type="button" id="acct-pull">用云端进度覆盖本机</button>
        </div>
        <p class="desc" id="acct-note">${esc(notice)}</p>
      </div>

      <div class="card">
        <h2 style="font-size:17px;margin-bottom:10px">关于账号</h2>
        <p class="small muted">账号仅用于同步学习进度，不会发送营销邮件。如需删除账号数据，先点"退出登录"，再在下方清空本机数据；如需彻底删除云端记录，可联系站长处理。</p>
      </div>`;
  }

  function guestView(view) {
    const snap = Account.snapshot();
    const disabled = snap.filesystem ? 'disabled' : '';
    const offline = !snap.filesystem && snap.ready === false && snap.lastError ? snap.lastError : '';
    const offlineTip = offline ? `<p class="desc" style="color:var(--warn)">${esc(offline)}</p>` : '';
    const tip = snap.filesystem
      ? '当前是用本地文件方式打开的页面，浏览器不允许直接访问云服务。请通过线上地址访问后再注册。'
      : '不注册也能正常使用，所有记录存在本机。注册后可以在多台设备之间同步进度。';
    return `
      <div class="page-head">
        <h1>我的账号</h1>
        <p class="lead">用邮箱收验证码即可登录，无需设置密码。</p>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">邮箱登录 / 注册</h2>
        <p class="small muted" style="margin-bottom:16px">${esc(tip)}</p>
        ${offlineTip}
        <form id="acct-form" autocomplete="off">
          <div class="field">
            <label for="acct-email">邮箱地址</label>
            <div class="acct-row">
              <input class="input" type="email" id="acct-email" placeholder="you@example.com" ${disabled} required>
              <button class="btn btn-outline" type="button" id="acct-send" ${disabled}>获取验证码</button>
            </div>
          </div>
          <div class="field">
            <label for="acct-code">验证码</label>
            <input class="input" type="text" id="acct-code" inputmode="numeric" maxlength="8" placeholder="请输入邮箱收到的数字验证码" ${disabled}>
            <p class="desc">首次登录会直接创建账号，老邮箱会直接登录，两种情况下发的验证码都是一样的。</p>
          </div>
          <div class="row">
            <button class="btn btn-primary" type="submit" id="acct-submit" ${disabled}>登录 / 注册</button>
          </div>
          <p class="desc" id="acct-note">${esc(notice)}</p>
        </form>
      </div>

      <div class="card mb-16">
        <h2 style="font-size:17px;margin-bottom:8px">进入方式</h2>
        <p class="small muted" style="margin-bottom:12px">${App.gateSeenNow()
          ? '当前已选择「先逛逛」，之后打开链接会直接进站。想恢复成每次打开都先问一句，点下面的按钮。'
          : '当前每次打开链接都会先显示登录选择页。'}</p>
        <button class="btn btn-outline" type="button" id="acct-gate-reset">恢复「打开先选择登录」</button>
      </div>

      <div class="card">
        <h2 style="font-size:17px;margin-bottom:10px">注册后能得到什么</h2>
        <ul class="plain-list">
          <li>做题记录、错题本、申论草稿跨设备同步，换电脑不用重新来过。</li>
          <li>电脑和手机可以同时用，进度自动合并。</li>
          <li>不注册也完全可用，注册与否随时可以退出。</li>
        </ul>
      </div>`;
  }

  function render(view) {
    const snap = Account.snapshot();
    view.innerHTML = snap.user ? signedInView(view) : guestView(view);

    if (snap.user) {
      const out = $('#acct-signout', view);
      if (out) out.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '退出登录',
          text: '退出后本机记录会保留，只是不再自动同步到云端。确定退出吗？',
          okText: '退出登录'
        });
        if (!ok) return;
        stopTimer();
        await Account.signOut();
        Store.enableCloud(false);
        notice = '已退出登录，本机记录仍然保留。';
        render(view);
        App.refreshChrome();
        toast('已退出登录');
      });

      const push = $('#acct-push', view);
      if (push) push.addEventListener('click', async () => {
        push.disabled = true;
        const note = $('#acct-note', view);
        note.textContent = '正在上传…';
        try {
          await Store.syncNow();
          note.textContent = '已上传，当前进度以本机为准。';
          toast('上传完成');
        } catch (err) {
          note.textContent = '上传失败：' + (err.message || err);
          toast('上传失败');
        } finally {
          push.disabled = false;
        }
      });

      const pull = $('#acct-pull', view);
      if (pull) pull.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: '用云端进度覆盖本机',
          text: '会把本机的答题记录、错题、草稿、模考成绩替换成云端的版本。此操作不可撤销，建议先导出备份。确定继续吗？',
          okText: '覆盖本机'
        });
        if (!ok) return;
        const note = $('#acct-note', view);
        note.textContent = '正在拉取…';
        try {
          const remote = await Account.pull();
          if (!remote) { note.textContent = '云端还没有该账号的进度。'; return; }
          Store.adoptRemote(remote.data);
          notice = '已用云端进度覆盖本机，正在刷新…';
          toast('已完成，正在刷新…');
          setTimeout(() => location.reload(), 700);
        } catch (err) {
          note.textContent = '拉取失败：' + (err.message || err);
        }
      });
      return;
    }

    const gateReset = $('#acct-gate-reset', view);
    if (gateReset) gateReset.addEventListener('click', () => {
      App.resetGate();
      render(view);
      toast('已恢复，下次打开会先显示登录选择');
    });

    const emailEl = $('#acct-email', view);
    const codeEl = $('#acct-code', view);
    const sendBtn = $('#acct-send', view);
    const note = $('#acct-note', view);

    if (!sendBtn || snap.filesystem) return;

    sendBtn.addEventListener('click', async () => {
      if (countdown > 0) return;
      const email = emailEl.value.trim();
      sendBtn.disabled = true;
      note.textContent = '正在发送验证码…';
      try {
        await Account.sendCode(email);
        note.textContent = '验证码已发送，请查看 ' + email + ' 的收件箱（含垃圾邮件）。';
        toast('验证码已发送');
        countdown = 60;
        stopTimer();
        timer = setInterval(() => {
          countdown -= 1;
          if (countdown <= 0) { stopTimer(); sendBtn.disabled = false; sendBtn.textContent = '重新获取'; return; }
          sendBtn.textContent = countdown + ' 秒后重发';
        }, 1000);
        sendBtn.textContent = countdown + ' 秒后重发';
        codeEl.focus();
      } catch (err) {
        note.textContent = '发送失败：' + (err.message || err);
        sendBtn.disabled = false;
      }
    });

    $('#acct-form', view).addEventListener('submit', async ev => {
      ev.preventDefault();
      const submit = $('#acct-submit', view);
      submit.disabled = true;
      note.textContent = '正在校验…';
      try {
        const res = await Account.verifyCode(codeEl.value);
        Store.enableCloud(true);
        notice = res.isNew ? '注册成功，已开始同步本机进度。' : '登录成功，正在合并进度。';
        const remote = await Account.pull();
        if (remote && remote.data && Store.localStorageEmpty()) {
          Store.adoptRemote(remote.data);
        } else {
          await Store.syncNow();
        }
        toast(res.isNew ? '注册成功' : '登录成功');
        stopTimer();
        render(view);
        App.refreshChrome();
      } catch (err) {
        note.textContent = '登录失败：' + (err.message || err);
        submit.disabled = false;
      }
    });

    codeEl.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); $('#acct-form', view).requestSubmit(); }
    });
  }

  return { render, leave() { stopTimer(); } };
})();

/* ==================== 路由与外壳 ==================== */

const App = (() => {
  let currentPath = '/home';
  let lastView = '/home';
  let lastPage = null;
  let started = false;

  function buildNav() {
    const nav = $('#nav');
    nav.innerHTML = NAV_ITEMS.map(item => `
      <a class="nav-item" href="#${item.path}" data-path="${item.path}">
        <svg aria-hidden="true"><use href="#${item.icon}"/></svg>
        <span>${item.label}</span>
        ${item.path === '/news' ? '<span class="nav-badge" id="news-badge" hidden></span>' : ''}
        ${item.path === '/account' ? '<span class="nav-badge" id="acct-badge" hidden>已登录</span>' : ''}
      </a>`).join('');
    $$('.nav-item', nav).forEach(a => a.addEventListener('click', closeSidebar));
  }

  function setActiveNav(path) {
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.path === path));
  }

  function updateTopbar(path) {
    const item = NAV_ITEMS.find(x => x.path === path) || NAV_ITEMS[0];
    $('#topbar-title').textContent = item.title;
    $('#topbar-date').textContent = fmtDateCN(new Date());
    const streak = Store.streak();
    const chip = $('#topbar-streak');
    if (streak > 0) {
      chip.hidden = false;
      chip.textContent = `连续 ${streak} 天`;
    } else {
      chip.hidden = true;
    }
    document.title = item.title + ' · 朱批书房';
  }

  /* 账号状态变化时刷新侧栏徽标与顶栏（登录 / 退出后调用） */
  function refreshChrome() {
    const badge = $('#acct-badge');
    if (badge) badge.hidden = !(typeof Account !== 'undefined' && Account.isSignedIn());
    if (currentPath === '/account') {
      const view = $('#view');
      try { AccountPage.render(view); } catch (err) { console.warn(err); }
    }
  }

  function parsePath() {
    const raw = location.hash.replace(/^#/, '') || '/home';
    const path = raw.split('?')[0];
    return ROUTES[path] ? path : '/home';
  }

  function route() {
    const path = parsePath();

    if (Exam.isActive() && path !== '/exam') {
      const ok = window.confirm('模拟考试正在进行，离开将放弃本次考试（作答不会保存）。确定离开吗？');
      if (!ok) {
        location.hash = '#/exam';
        return;
      }
      Exam.abandon();
    }

    if (lastPage && lastPage.leave) { try { lastPage.leave(); } catch (e) { /* 忽略 */ } }
    currentPath = path;
    const view = $('#view');
    view.innerHTML = '';
    const page = ROUTES[path]();
    lastPage = page;
    try {
      page.render(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="empty"><b>页面出错了</b>${esc(err.message || String(err))}<br>请刷新页面重试；如果问题持续，请检查浏览器控制台。</div>`;
    }
    setActiveNav(path);
    updateTopbar(path);
    if (path !== lastView) window.scrollTo(0, 0);
    lastView = path;
  }

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#scrim').hidden = false;
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#scrim').hidden = true;
  }

  /* ==================== 进入选择层 ====================
     打开链接先让用户选「登录」还是「先逛逛」，选完才加载题库并进站。
     已登录（会话有效）或之前选过「先逛逛」的，直接进，不重复打扰。 */

  const GATE_KEY = 'zhubi_gate_v1';

  function gateSeen() {
    try { return !!localStorage.getItem(GATE_KEY); } catch (e) { return false; }
  }

  function markGateSeen(kind) {
    try {
      localStorage.setItem(GATE_KEY, JSON.stringify({ kind: kind, t: Date.now() }));
    } catch (e) { /* 无痕模式下忽略 */ }
  }

  function gateEls() {
    return {
      gate: $('#gate'),
      shell: $('#shell'),
      choose: $('#gate-choose'),
      login: $('#gate-login-panel'),
      loading: $('#gate-loading'),
      note: $('#gate-note'),
      bar: $('#gate-bar')
    };
  }

  function showGatePanel(which) {
    const g = gateEls();
    if (!g.gate) return;
    g.choose.hidden = which !== 'choose';
    g.login.hidden = which !== 'login';
    g.loading.hidden = which !== 'loading';
    const first = which === 'login' ? $('#gate-email') : null;
    if (first) setTimeout(() => first.focus(), 60);
  }

  /* 显示 / 隐藏进入层：集中在一处改，避免 boot 里散落的显隐赋值互相覆盖。 */
  function showGate() {
    const g = gateEls();
    if (!g.gate) return;
    if (g.shell) g.shell.hidden = true;
    g.gate.hidden = false;
    document.body.style.overflow = 'hidden';
    showGatePanel('choose');
  }

  function hideGate() {
    const g = gateEls();
    if (g.gate) g.gate.hidden = true;
    if (g.shell) g.shell.hidden = false;
    document.body.style.overflow = '';
  }

  /* 进入站点：立刻隐身选择层并渲染当前页，题库在后台加载，加载完再静默重画。
   * 早先这里是 await 题库加载 → 页面空着等几十兆 JSON，首次进入白屏很久；
   * 现在先给用户能看到、能点的界面，统计类数字在题库到位后自动更新。 */
  async function enterSite(withProgress) {
    hideGate();
    route();

    if (Store.get().settings.packEnabled !== false) {
      const setText = (main, sub, pct) => {
        if (!withProgress) return;
        const t = $('#gate-load-text');
        const s2 = $('#gate-load-sub');
        const b = $('#gate-bar');
        if (t) t.textContent = main;
        if (s2) s2.textContent = sub || '';
        if (b && pct != null) b.style.width = Math.round(pct * 100) + '%';
      };
      /* 不 await：题库体积大，阻塞在这里会让首屏迟迟不出现 */
      PackStore.load(p => {
        const pct = p.total ? p.done / p.total : 0;
        setText('正在加载扩展真题题库…',
          p.done >= p.total
            ? `已加载 ${p.done}/${p.total} 个题库包`
            : `第 ${p.done + 1}/${p.total} 个题库包`,
          pct);
      }).then(() => {
        /* 题库到位：当前页依赖题目数量，静默重画一次 */
        if (currentPath === '/home' || currentPath === '/practice' || currentPath === '/mistakes') {
          try { route(); } catch (err) { console.warn(err); }
        }
      }).catch(err => {
        console.warn('扩展题库加载失败', err);
        toast('扩展题库加载失败，已使用内置题库');
      });
    }

    if (typeof Account !== 'undefined') {
      Account.init().then(() => {
        if (Account.isSignedIn()) {
          Store.enableCloud(true);
          refreshChrome();
        }
      }).catch(err => console.warn('云账号初始化失败', err));
      Account.onSync(() => refreshChrome());
    }
  }

  /* 登录层：发码 → 输码 → 进站 */
  function bindGateLogin(onDone) {
    let countdown = 0;
    let timer = null;
    let challengeReady = false;

    const emailEl = $('#gate-email');
    const codeEl = $('#gate-code');
    const sendBtn = $('#gate-send');
    const submitBtn = $('#gate-submit');
    const note = $('#gate-note');

    function startCountdown() {
      countdown = 60;
      sendBtn.disabled = true;
      sendBtn.textContent = countdown + ' 秒后重发';
      clearInterval(timer);
      timer = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          clearInterval(timer);
          sendBtn.disabled = false;
          sendBtn.textContent = '重新获取';
          return;
        }
        sendBtn.textContent = countdown + ' 秒后重发';
      }, 1000);
    }

    sendBtn.addEventListener('click', async () => {
      if (countdown > 0) return;
      const email = emailEl.value.trim();
      sendBtn.disabled = true;
      note.textContent = '正在发送验证码…';
      try {
        await Account.sendCode(email);
        challengeReady = true;
        note.textContent = '验证码已发送到 ' + email + '，请查收（含垃圾邮件箱）。';
        startCountdown();
        codeEl.focus();
      } catch (err) {
        note.textContent = '发送失败：' + (err.message || err);
        sendBtn.disabled = false;
      }
    });

    emailEl.addEventListener('input', () => { challengeReady = false; });

    $('#gate-form').addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!challengeReady) {
        note.textContent = '请先点「获取验证码」，收到邮件后再填入。';
        return;
      }
      submitBtn.disabled = true;
      note.textContent = '正在校验…';
      try {
        const res = await Account.verifyCode(codeEl.value);
        clearInterval(timer);
        onDone(res);
      } catch (err) {
        note.textContent = '登录失败：' + (err.message || err);
        submitBtn.disabled = false;
      }
    });
  }

  async function boot() {
    Theme.apply(Store.get().settings.theme || 'crimson');
    buildNav();

    window.addEventListener('hashchange', route);
    if (!location.hash) {
      history.replaceState(null, '', '#/home');
    }

    /* 侧栏主题切换 */
    $$('.theme-pick button').forEach(btn => {
      btn.addEventListener('click', () => {
        Theme.set(btn.dataset.themeSet);
      });
    });

    await startGate();
  }

  /* 进入层（登录 / 先逛逛）或直接进站。
   * 从 boot() 里拆出来单独成函数：显隐逻辑集中，便于排查与复用。 */
  async function startGate() {
    const g = gateEls();
    if (!g.gate) { await enterSite(false); return; }

    /* 顺序有讲究：先探登录态（可能要等 SDK 与网络），探完再决定显隐，
       避免先闪一下选择层又跳走。 */
    let signedIn = false;
    if (typeof Account !== 'undefined') {
      try {
        const sdk = await Account.init();
        signedIn = !!(sdk && Account.isSignedIn());
      } catch (err) {
        console.warn('云账号初始化失败，按未登录处理', err);
      }
    }

    if (signedIn || gateSeen()) {
      await enterSite(false);
      return;
    }
    showGate();

    $('#gate-login').addEventListener('click', () => {
      if (typeof Account !== 'undefined' && Account.snapshot().filesystem) {
        showGatePanel('login');
        $('#gate-login-lead').textContent = '当前是用本地文件打开的页面，浏览器不允许访问云服务。可以先点下方「返回」，选择「先逛逛」。';
        $('#gate-send').disabled = true;
        $('#gate-submit').disabled = true;
        return;
      }
      showGatePanel('login');
    });

    $('#gate-back').addEventListener('click', () => {
      $('#gate-note').textContent = '';
      showGatePanel('choose');
    });

    $('#gate-guest').addEventListener('click', () => {
      markGateSeen('guest');
      enterSite(false);
    });

    bindGateLogin(async res => {
      markGateSeen('account');
      Store.enableCloud(true);
      /* 本机是空的就从云端拉，否则以本机为准推上去 */
      try {
        const remote = await Account.pull();
        if (remote && remote.data && Store.localStorageEmpty()) Store.adoptRemote(remote.data);
        else await Store.syncNow();
      } catch (err) { console.warn('登录后同步失败', err); }

      showGatePanel('loading');
      $('#gate-load-title').textContent = res.isNew ? '注册成功' : '登录成功';
      $('#gate-load-text').textContent = '正在准备书房…';
      await enterSite(true);
      toast(res.isNew ? '注册成功，开始学习吧' : '登录成功');
    });
  }

  async function init() {
    if (started) return;
    started = true;

    $('#menu-btn').addEventListener('click', openSidebar);
    $('#scrim').addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSidebar();
    });

    News.startPolling();
    News.updateBadge();

    try {
      await boot();
    } catch (err) {
      console.error('启动失败', err);
      const g = gateEls();
      if (g.gate) g.gate.hidden = true;
      if (g.shell) g.shell.hidden = false;
      route();
      toast('启动时出现问题，已使用内置题库');
    }
  }

  return {
    init,
    route,
    refreshChrome,
    gateSeenNow: gateSeen,
    resetGate() {
      try { localStorage.removeItem(GATE_KEY); } catch (e) { /* 忽略 */ }
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
