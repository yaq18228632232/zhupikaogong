/* 朱批书房 · 模拟考试 */
'use strict';

const Exam = (() => {
  let exam = null;       // { ids, idx, answers, startAt, endAt, durationSec, scorePer }
  let lastResult = null; // { record, wrong, unanswered }
  let clockTimer = null;
  let beforeUnloadHandler = null;

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  const EXAM_NOTE = '示例卷按国考副省级行测结构组卷：常识判断 20 题、言语理解与表达 40 题、数量关系 15 题、判断推理 40 题、资料分析 20 题，共 135 题，限时 120 分钟，满分 100 分。每次组卷会优先避开上一套已考题目；导入题库后，模考仍按该结构抽取题目。';

  const FULL_COUNT = 135;
  const FULL_MINUTES = 120;
  const QUOTAS = [
    ['changshi', 20],
    ['yanyu', 40],
    ['shuliang', 15],
    ['panduan', 40],
    ['ziliao', 20]
  ];

  function buildExamIds() {
    const all = Bank.all();
    if (all.length < FULL_COUNT) return all.map(q => q.id);

    /* 优先避开上一套考过的题，让每次模考尽量换新 */
    const recent = new Set();
    Store.get().exams.slice(0, 1).forEach(e => (e.ids || []).forEach(id => recent.add(id)));

    const ids = [];
    QUOTAS.forEach(([mid, quota]) => {
      const pool = Bank.byModule(mid);
      let picked = shuffle(pool.filter(q => !recent.has(q.id))).slice(0, quota);
      if (picked.length < quota) {
        const used = new Set(picked.map(q => q.id));
        picked = picked.concat(
          shuffle(pool.filter(q => !used.has(q.id))).slice(0, quota - picked.length)
        );
      }
      ids.push(...picked.map(q => q.id));
    });

    if (ids.length < FULL_COUNT) {
      const used = new Set(ids);
      const rest = shuffle(all.filter(q => !used.has(q.id)).map(q => q.id));
      while (ids.length < FULL_COUNT && rest.length) ids.push(rest.shift());
    }
    return ids.slice(0, FULL_COUNT);
  }

  function examConfig() {
    const bankCount = Bank.all().length;
    const count = Math.min(FULL_COUNT, bankCount);
    const full = bankCount >= FULL_COUNT;
    const durationSec = full
      ? FULL_MINUTES * 60
      : Math.max(10, Math.round(FULL_MINUTES * count / FULL_COUNT)) * 60;
    return { count, durationSec, full, bankCount };
  }

  function clearUnload() {
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  function render(view) {
    if (exam) renderExam(view);
    else if (lastResult) renderResult(view);
    else renderIntro(view);
  }

  /* ---------- 考前说明 ---------- */

  function renderIntro(view) {
    stopClock();
    const cfg = examConfig();
    const exams = Store.get().exams.slice(0, 8);
    const best = Store.stats().bestExam;

    const historyHtml = exams.length ? `
      <div class="section-title"><h2>历史成绩</h2><span class="more">最近 ${exams.length} 次</span></div>
      <div class="card" style="padding:6px 12px">
        <table class="table">
          <thead><tr><th>交卷时间</th><th>得分</th><th>答对</th><th>用时</th></tr></thead>
          <tbody>
            ${exams.map(e => `<tr>
              <td>${fmtDateTime(e.t)}</td>
              <td class="num"><b>${e.score}</b> 分</td>
              <td class="num">${e.correct} / ${e.total}</td>
              <td class="num">${fmtClock(e.duration)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '';

    view.innerHTML = `
      <div class="page-head">
        <h1>模拟考试</h1>
        <p class="lead">按真实考试节奏限时作答，交卷后自动评分，并给出各模块得分情况。每次组卷会优先避开上一套题目，考试期间离开页面会终止本次考试。</p>
      </div>
      <div class="card pad-lg">
        <div class="spread">
          <div>
            <h2 style="font-size:21px;margin-bottom:8px">行测模拟考试 · 示例卷</h2>
            <div class="row">
              <span class="chip">${cfg.count} 题</span>
              <span class="chip">限时 ${Math.round(cfg.durationSec / 60)} 分钟</span>
              <span class="chip">满分 100 分</span>
              <span class="chip">题库 ${Bank.all().length} 题</span>
              ${best ? `<span class="chip ok">历史最佳 ${best} 分</span>` : ''}
            </div>
          </div>
          <button class="btn btn-primary btn-lg" type="button" id="start-exam">开始考试</button>
        </div>
        <div class="rule-double"></div>
        <p class="small muted">${EXAM_NOTE}</p>
        ${cfg.full ? '' : `<div class="note-banner warn mt-16"><b>题库不足 135 题</b>　当前题库共 ${cfg.bankCount} 题，本次按全部题目组卷，限时按比例折算为 ${Math.round(cfg.durationSec / 60)} 分钟。导入题库后可组成 135 题完整卷。</div>`}
        <div class="note-banner mt-16">
          <b>考试规则</b>　① 全部为单项选择，答错或不答均不得分；② 可随时通过答题卡跳转题目；③ 倒计时结束自动交卷；④ 考试期间不要关闭或刷新页面。
        </div>
      </div>
      ${historyHtml}`;

    $('#start-exam', view).addEventListener('click', () => startExam(view));
  }

  /* ---------- 开始考试 ---------- */

  function startExam(view) {
    const ids = buildExamIds();
    if (!ids.length) { toast('题库为空，无法开始考试'); return; }
    const cfg = examConfig();
    exam = {
      ids,
      idx: 0,
      answers: {},
      startAt: Date.now(),
      endAt: Date.now() + cfg.durationSec * 1000,
      durationSec: cfg.durationSec,
      scorePer: 100 / ids.length
    };
    beforeUnloadHandler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    renderExam(view);
    window.scrollTo(0, 0);
  }

  /* ---------- 考试界面 ---------- */

  function renderExam(view) {
    if (!exam) return;
    const q = Bank.byId(exam.ids[exam.idx]);
    if (!q) return;
    const n = exam.ids.length;
    const chosen = exam.answers[q.id];
    const m = Bank.moduleInfo(q.module);

    const options = q.options.map((opt, i) => {
      const cls = 'opt' + (chosen === i ? ' selected' : '');
      return `<button class="${cls}" type="button" data-opt="${i}">
        <span class="letter">${LETTERS[i]}</span>
        <span>${esc(opt)}</span>
      </button>`;
    }).join('');

    const sheet = exam.ids.map((id, i) => {
      const answered = exam.answers[id] !== undefined;
      const cls = 'sheet-num' + (answered ? ' answered' : '') + (i === exam.idx ? ' current' : '');
      return `<button class="${cls}" type="button" data-jump="${i}">${i + 1}</button>`;
    }).join('');

    const answeredCount = Object.keys(exam.answers).length;

    view.innerHTML = `
      <div class="session-bar">
        <div class="left">
          <span class="session-title">行测模拟考试</span>
          <span class="chip">第 ${exam.idx + 1} / ${n} 题</span>
          <span class="chip">已答 ${answeredCount} 题</span>
        </div>
        <div class="left">
          <span class="timer" id="exam-timer">剩余 <b id="exam-clock">${fmtClock((exam.endAt - Date.now()) / 1000)}</b></span>
          <button class="btn btn-outline btn-sm" type="button" id="submit-exam">交卷</button>
        </div>
      </div>
      <div class="exam-layout">
        <div class="qcard">
          <div class="qmeta">
            <span class="chip primary">${esc(m.short)}</span>
            <span>第 ${exam.idx + 1} 题 · 每题 ${exam.scorePer.toFixed(2)} 分</span>
          </div>
          ${questionMaterial(q)}
          <div class="qstem">${questionStem(q)}</div>
          <div class="opts">${options}</div>
          <div class="qfoot">
            <span class="row">
              <button class="btn btn-outline btn-sm" type="button" id="prev-q" ${exam.idx === 0 ? 'disabled' : ''}>上一题</button>
              <button class="btn btn-outline btn-sm" type="button" id="next-q" ${exam.idx === n - 1 ? 'disabled' : ''}>下一题</button>
            </span>
            <span class="hint">答案可随时修改，交卷前不会显示对错</span>
          </div>
        </div>
        <aside class="answer-sheet">
          <h3>答题卡</h3>
          <div class="sheet-scroll"><div class="sheet-grid">${sheet}</div></div>
          <div class="sheet-legend">
            <span><i class="on"></i>已答</span>
            <span><i></i>未答</span>
          </div>
          <div class="rule-double" style="margin:14px 0"></div>
          <p class="small muted">已答 ${answeredCount} / ${n} 题</p>
          <button class="btn btn-primary mt-8" type="button" id="submit-exam-2" style="width:100%">交卷并评分</button>
        </aside>
      </div>`;

    startClock();

    $$('.opt', view).forEach(btn => {
      btn.addEventListener('click', () => {
        exam.answers[q.id] = Number(btn.dataset.opt);
        renderExam(view);
      });
    });

    $$('[data-jump]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        exam.idx = Number(btn.dataset.jump);
        renderExam(view);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    const prev = $('#prev-q', view);
    if (prev) prev.addEventListener('click', () => {
      if (exam.idx > 0) { exam.idx -= 1; renderExam(view); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    const next = $('#next-q', view);
    if (next) next.addEventListener('click', () => {
      if (exam.idx < exam.ids.length - 1) { exam.idx += 1; renderExam(view); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    ['#submit-exam', '#submit-exam-2'].forEach(sel => {
      const btn = $(sel, view);
      if (btn) btn.addEventListener('click', () => requestSubmit(false));
    });
  }

  function startClock() {
    stopClock();
    const tick = () => {
      const el = $('#exam-clock');
      if (!el || !exam) { stopClock(); return; }
      const remain = (exam.endAt - Date.now()) / 1000;
      el.textContent = fmtClock(remain);
      const timer = $('#exam-timer');
      if (timer) timer.classList.toggle('warn', remain <= 300);
      if (remain <= 0) {
        stopClock();
        grade(true);
      }
    };
    clockTimer = setInterval(tick, 1000);
    tick();
  }

  /* ---------- 交卷 ---------- */

  async function requestSubmit(auto) {
    if (!exam) return;
    const unanswered = exam.ids.length - Object.keys(exam.answers).length;
    if (!auto) {
      const ok = await confirmDialog({
        title: '确认交卷',
        text: unanswered > 0
          ? `还有 ${unanswered} 题未作答。交卷后将立即评分，确定交卷吗？`
          : '所有题目均已作答。确定交卷并评分吗？',
        okText: '交卷'
      });
      if (!ok) return;
    }
    grade(auto);
  }

  function grade(auto) {
    if (!exam) return;
    stopClock();
    clearUnload();

    const n = exam.ids.length;
    const parts = {};
    let correct = 0;
    const wrong = [];
    let unansweredCount = 0;

    exam.ids.forEach(id => {
      const q = Bank.byId(id);
      if (!q) return;
      const chosen = exam.answers[id];
      const isCorrect = chosen === q.answer;
      if (isCorrect) correct += 1;
      if (!parts[q.module]) parts[q.module] = { total: 0, correct: 0 };
      parts[q.module].total += 1;
      if (isCorrect) parts[q.module].correct += 1;

      Store.recordAnswer({ qid: id, module: q.module, correct: isCorrect, mode: 'exam' });
      if (chosen === undefined) {
        unansweredCount += 1;
      } else if (!isCorrect) {
        Store.addMistake(id);
        wrong.push({ q, chosen });
      }
    });

    const duration = Math.min(exam.durationSec, Math.round((Date.now() - exam.startAt) / 1000));
    const score = Math.round(correct / n * 1000) / 10;

    const record = {
      t: Date.now(),
      name: '行测模拟考试',
      score,
      correct,
      total: n,
      duration,
      parts,
      ids: exam.ids.slice()
    };
    Store.addExam(record);
    lastResult = { record, wrong, unanswered: unansweredCount, auto: !!auto };
    exam = null;
    renderResult($('#view'));
    window.scrollTo(0, 0);
    if (auto) toast('考试时间到，已自动交卷');
  }

  /* ---------- 成绩报告 ---------- */

  function renderResult(view) {
    if (!lastResult) { renderIntro(view); return; }
    const { record, wrong, unanswered, auto } = lastResult;

    const partRows = MODULES.filter(m => record.parts[m.id]).map(m => {
      const p = record.parts[m.id];
      return `<tr>
        <td>${esc(m.name)}</td>
        <td class="num">${p.correct} / ${p.total}</td>
        <td>
          <div class="bar"><i style="width:${pct(p.correct, p.total)}%"></i></div>
        </td>
        <td class="num">${pct(p.correct, p.total)}%</td>
      </tr>`;
    }).join('');

    const wrongHtml = wrong.length ? `
      <div class="section-title"><h2>错题回顾</h2><span class="more">已加入错题本</span></div>
      <div class="flex-col">
        ${wrong.map(({ q, chosen }, i) => `
          <div class="imp-item">
            <div class="imp-stem">
              <b>${i + 1}. ${esc(stripHtml(q.stem)).slice(0, 100)}${stripHtml(q.stem).length > 100 ? '…' : ''}</b>
              <div class="opts-preview">你的答案：${LETTERS[chosen]}　正确答案：${LETTERS[q.answer]}　${esc(q.explain).slice(0, 100)}${q.explain.length > 100 ? '…' : ''}</div>
            </div>
          </div>`).join('')}
      </div>` : '<div class="note-banner"><b>本卷无错题</b>　状态很好，可以把时间留给申论了。</div>';

    const scoreText = Number.isInteger(record.score) ? record.score : record.score.toFixed(1);

    view.innerHTML = `
      <div class="result-hero">
        <div class="spread">
          <div>
            <div class="big">${scoreText}<small>分</small></div>
            <div class="sub">答对 ${record.correct} / ${record.total} 题 · 用时 ${fmtClock(record.duration)} · ${fmtDateTime(record.t)}${auto ? ' · 超时自动交卷' : ''}</div>
            ${unanswered ? `<p class="small muted mt-8">未作答 ${unanswered} 题，未作答计为答错，不计入错题本。</p>` : ''}
          </div>
          <div class="row">
            <button class="btn btn-primary" type="button" id="exam-again">再考一次</button>
            <button class="btn btn-outline" type="button" id="go-mistakes">去错题本</button>
          </div>
        </div>
      </div>

      <div class="section-title"><h2>分模块表现</h2></div>
      <div class="card" style="padding:10px 16px">
        <table class="table">
          <thead><tr><th>模块</th><th>答对 / 题量</th><th style="width:40%">正确率</th><th></th></tr></thead>
          <tbody>${partRows}</tbody>
        </table>
      </div>

      ${wrongHtml}`;

    $('#exam-again', view).addEventListener('click', () => {
      lastResult = null;
      startExam(view);
    });
    $('#go-mistakes', view).addEventListener('click', () => { location.hash = '#/mistakes'; });
  }

  return {
    render,
    isActive() { return !!exam; },
    abandon() {
      stopClock();
      clearUnload();
      exam = null;
    },
    stop() { stopClock(); }
  };
})();
