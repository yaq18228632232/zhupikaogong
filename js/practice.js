/* 朱批书房 · 行测刷题 */
'use strict';

const Practice = (() => {
  let session = null;     // { ids, idx, entries, startAt, title, moduleId }
  let clockTimer = null;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const SESSION_SIZE = 20;
  const MIX_SIZE = 15;

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  function startClock(startAt) {
    stopClock();
    clockTimer = setInterval(() => {
      const el = $('#session-clock');
      if (!el) { stopClock(); return; }
      el.textContent = fmtClock((Date.now() - startAt) / 1000);
    }, 1000);
  }

  function render(view) {
    if (session) renderQuestion(view);
    else renderPicker(view);
  }

  /* ---------- 选择模块 ---------- */

  function renderPicker(view) {
    stopClock();
    const stats = Store.stats();
    const tiles = MODULES.map(m => {
      const slot = stats.byModule[m.id] || { attempted: new Set(), correct: 0, answered: 0, bankSize: 0 };
      const attempted = slot.attempted ? slot.attempted.size : 0;
      const acc = slot.answered ? pct(slot.correct, slot.answered) : null;
      return `
        <button class="tile" type="button" data-start="${m.id}">
          <span class="char-tile">${m.glyph}</span>
          <b>${esc(m.name)}</b>
          <span>${esc(m.desc)}</span>
          <span class="small">每组 ${Math.min(SESSION_SIZE, slot.bankSize || Bank.byModule(m.id).length)} 题 · 已做 ${attempted} / ${slot.bankSize || Bank.byModule(m.id).length} 题${acc === null ? '' : ' · 正确率 ' + acc + '%'}</span>
        </button>`;
    }).join('');

    view.innerHTML = `
      <div class="page-head">
        <h1>行测刷题</h1>
        <p class="lead">按模块练习，每组 20 题，优先出没做过的题，做完一轮自动换一批。答完立即看解析，答错的题会自动进入错题本；也可以在“题库导入”里导入题库或从链接更新题库。</p>
      </div>
      <div class="row" style="margin-bottom:18px">
        <span class="chip">累计作答 ${stats.total} 题</span>
        <span class="chip ok">总正确率 ${stats.accuracy}%</span>
        <span class="chip ${stats.mistakesCount ? 'warn' : ''}">错题本 ${stats.mistakesCount} 题</span>
      </div>
      <div class="tile-grid">${tiles}
        <button class="tile" type="button" data-start="mix">
          <span class="char-tile">综</span>
          <b>随机综合练习</b>
          <span>五个模块各抽 3 题，优先出没做过的题</span>
          <span class="small">每组 15 题 · 共 ${Bank.all().length} 题可抽</span>
        </button>
      </div>

      <div class="section-title"><h2>在线题库</h2><span class="more">外部网站 · 新标签打开</span></div>
      <div class="grid grid-2">
        ${ONLINE_BANKS.map(b => `
          <a class="link-card" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">
            <span class="glyph">${esc(b.glyph)}</span>
            <span><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></span>
            <span class="ext" aria-hidden="true">↗</span>
          </a>`).join('')}
      </div>

      <div class="note-banner mt-24">
        <b>建议</b>　行测备考讲究“限时刷题 + 错题复盘”。练习时留意页面右上角的计时，做完一套后回顾错题，比盲目刷量更有效。
      </div>`;
  }

  /* ---------- 开始 ---------- */

  /* 出题优先级：没做过 → 错题本中久未复习 → 最久没做的，保证每次练习尽量换新题 */
  function pickQuestions(pool, size) {
    const history = Store.get().answers;
    const stats = new Map();
    history.forEach(a => {
      const cur = stats.get(a.q) || { last: 0 };
      cur.last = Math.max(cur.last, a.t);
      stats.set(a.q, cur);
    });
    const mistakeSet = new Set(Store.mistakeIds());
    const fresh = [];
    const review = [];
    const rest = [];
    pool.forEach(q => {
      const s = stats.get(q.id);
      if (!s) fresh.push(q);
      else if (mistakeSet.has(q.id)) review.push({ q, last: s.last });
      else rest.push({ q, last: s.last });
    });
    return []
      .concat(shuffle(fresh).map(q => q.id))
      .concat(review.sort((a, b) => a.last - b.last).map(x => x.q.id))
      .concat(rest.sort((a, b) => a.last - b.last).map(x => x.q.id))
      .slice(0, Math.min(size, pool.length));
  }

  function startSession(moduleId) {
    let ids;
    let title;
    if (moduleId === 'mix') {
      ids = [];
      MODULES.forEach(m => { ids = ids.concat(pickQuestions(Bank.byModule(m.id), 3)); });
      ids = shuffle(ids).slice(0, MIX_SIZE);
      title = '随机综合练习';
    } else {
      ids = pickQuestions(Bank.byModule(moduleId), SESSION_SIZE);
      title = Bank.moduleName(moduleId) + ' · 练习';
    }
    if (!ids.length) { toast('该模块暂时没有题目，可先到“题库导入”添加'); return; }
    session = {
      ids,
      idx: 0,
      entries: ids.map(() => null),
      startAt: Date.now(),
      title,
      moduleId
    };
    render($('#view'));
    window.scrollTo(0, 0);
  }

  /* ---------- 答题 ---------- */

  function renderQuestion(view) {
    const q = Bank.byId(session.ids[session.idx]);
    if (!q) { session = null; renderPicker(view); return; }

    const entry = session.entries[session.idx];
    const answered = !!(entry && entry.confirmed);
    const n = session.ids.length;
    const m = Bank.moduleInfo(q.module);

    const stem = questionStem(q);
    const options = q.options.map((opt, i) => {
      let cls = 'opt';
      let mark = '';
      if (answered) {
        cls += ' locked';
        if (i === q.answer) { cls += ' correct'; mark = '正确答案'; }
        if (i === entry.choice) {
          if (entry.choice === q.answer) { mark = '你的选择'; }
          else { cls += ' wrong'; mark = '你的选择'; }
        }
      } else if (entry && entry.choice === i) {
        cls += ' selected';
      }
      return `<button class="${cls}" type="button" data-opt="${i}" ${answered ? 'disabled' : ''}>
        <span class="letter">${LETTERS[i]}</span>
        <span>${esc(opt)}</span>
        ${mark ? `<span class="opt-mark">${mark}</span>` : ''}
      </button>`;
    }).join('');

    view.innerHTML = `
      <div class="session-bar">
        <div class="left">
          <span class="session-title">${esc(session.title)}</span>
          <span class="chip">${esc(m.name)}</span>
          <span class="chip">第 ${session.idx + 1} / ${n} 题</span>
        </div>
        <div class="left">
          <span class="timer">已用 <b id="session-clock">${fmtClock((Date.now() - session.startAt) / 1000)}</b></span>
          <button class="btn btn-ghost btn-sm" type="button" id="exit-practice">退出练习</button>
        </div>
      </div>
      <div class="progress-line"><i style="width:${((session.idx + (answered ? 1 : 0)) / n) * 100}%"></i></div>

      <div class="qcard">
        <div class="qmeta">
          <span class="chip primary">${esc(m.short)}</span>
          <span>${esc(q.tag || '示例题')}</span>
        </div>
        ${questionMaterial(q)}
        <div class="qstem">${stem}</div>
        <div class="opts">${options}</div>
        ${answered ? renderExplain(q, entry, LETTERS) : ''}
        <div class="qfoot">
          <span class="hint">${answered ? '已作答，可继续下一题' : '选择一个答案后点击“确认答案”'}</span>
          <span class="row">
            ${answered ? `<button class="btn btn-outline btn-sm" type="button" data-askq="${esc(q.id)}">问 AI 讲解</button>` : ''}
            ${answered
              ? `<button class="btn btn-primary" type="button" id="next-q">${session.idx + 1 < n ? '下一题' : '查看结果'}</button>`
              : `<button class="btn btn-primary" type="button" id="confirm-q" ${entry ? '' : 'disabled'}>确认答案</button>`}
          </span>
        </div>
      </div>`;

    startClock(session.startAt);

    $$('.opt', view).forEach(btn => {
      btn.addEventListener('click', () => {
        const cur = session.entries[session.idx];
        if (cur && cur.confirmed) return;
        session.entries[session.idx] = { choice: Number(btn.dataset.opt), confirmed: false, correct: null };
        renderQuestion(view);
      });
    });

    const confirmBtn = $('#confirm-q', view);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const cur = session.entries[session.idx];
        if (!cur || cur.confirmed) return;
        const correct = cur.choice === q.answer;
        cur.confirmed = true;
        cur.correct = correct;
        Store.recordAnswer({ qid: q.id, module: q.module, correct, mode: 'practice' });
        if (!correct) Store.addMistake(q.id);
        renderQuestion(view);
      });
    }

    /* A：带着这道题去问 AI（自动打包题干、选项、答案与解析） */
    $$('[data-askq]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof AiChat !== 'undefined' && AiChat.askQuestion) {
          AiChat.askQuestion(btn.dataset.askq);
        }
      });
    });

    const nextBtn = $('#next-q', view);
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (session.idx + 1 < n) {
          session.idx += 1;
          renderQuestion(view);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          renderSummary(view);
        }
      });
    }

    $('#exit-practice', view).addEventListener('click', async () => {
      const done = session ? session.entries.filter(e => e && e.confirmed).length : 0;
      if (done > 0) {
        const ok = await confirmDialog({
          title: '退出练习',
          text: '本次练习的作答记录会保留，但未完成的进度将丢失。确定退出吗？',
          okText: '退出'
        });
        if (!ok) return;
      }
      stopClock();
      session = null;
      renderPicker($('#view'));
    });
  }

  function renderExplain(q, entry, letters) {
    return `<div class="explain">
      <h4>答案与解析</h4>
      <p><b>正确答案：${letters[q.answer]}</b>${entry.correct ? '　<span class="chip ok">回答正确</span>' : '　<span class="chip bad">回答错误</span>'}</p>
      <p>${esc(q.explain)}</p>
    </div>`;
  }

  /* ---------- 结果 ---------- */

  function renderSummary(view) {
    stopClock();
    const done = session.entries.filter(e => e && e.confirmed).length;
    const correct = session.entries.filter(e => e && e.confirmed && e.correct).length;
    const seconds = Math.round((Date.now() - session.startAt) / 1000);
    const wrong = session.entries
      .map((e, i) => ({ e, q: Bank.byId(session.ids[i]) }))
      .filter(x => x.e && !x.e.correct && x.q);

    const wrongHtml = wrong.length ? `
      <div class="section-title"><h2>本次错题</h2><span class="more">已加入错题本</span></div>
      <div class="flex-col">
        ${wrong.map(({ q }, i) => `
          <div class="imp-item">
            <div class="imp-stem"><b>${i + 1}. ${esc(stripHtml(q.stem)).slice(0, 110)}${stripHtml(q.stem).length > 110 ? '…' : ''}</b>
              <div class="opts-preview">正确答案：${LETTERS[q.answer]}　${esc(truncate(q.explain, 90))}</div>
            </div>
          </div>`).join('')}
      </div>` : `<div class="note-banner"><b>全对</b>　这一组没有错题，可以挑战下一个模块。</div>`;

    view.innerHTML = `
      <div class="result-hero">
        <div class="spread">
          <div>
            <div class="big">${correct}<small>/ ${done} 题正确</small></div>
            <div class="sub">正确率 ${pct(correct, done)}% · 用时 ${fmtClock(seconds)} · ${esc(session.title)}</div>
          </div>
          <div class="row">
            <button class="btn btn-primary" type="button" id="again">再练一组</button>
            <button class="btn btn-outline" type="button" id="back">返回选模块</button>
          </div>
        </div>
      </div>
      ${wrongHtml}`;

    $('#again', view).addEventListener('click', () => startSession(session.moduleId));
    $('#back', view).addEventListener('click', () => { session = null; renderPicker(view); });
  }

  function truncate(text, n) {
    const s = String(text || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function bind(view) {
    $$('[data-start]', view).forEach(btn => {
      btn.addEventListener('click', () => startSession(btn.dataset.start));
    });
  }

  /* 供 AI 问答页的「相关题目」跳过来：直接把这一道题作为一组练习打开 */
  function openQuestion(qid) {
    const q = Bank.byId(qid);
    if (!q) return false;
    stopClock();
    session = {
      ids: [qid],
      idx: 0,
      entries: [null],
      startAt: Date.now(),
      title: '题目详情',
      moduleId: q.module
    };
    return true;
  }

  return {
    render(view) {
      render(view);
      bind(view);
    },
    stop() { stopClock(); },
    openQuestion
  };
})();
