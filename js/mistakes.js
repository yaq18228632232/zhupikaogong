/* 朱批书房 · 错题本与学习统计 */
'use strict';

const Mistakes = (() => {
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  let filter = 'all';
  let openId = null;
  let redo = null; // { qid, choice, checked }

  function render(view) {
    const records = Store.mistakeIds()
      .map(id => ({ id, info: Store.get().mistakes[id], q: Bank.byId(id) }))
      .filter(x => x.q)
      .sort((a, b) => (b.info.lastAt || 0) - (a.info.lastAt || 0));

    const counts = { all: records.length };
    MODULES.forEach(m => { counts[m.id] = records.filter(r => r.q.module === m.id).length; });

    const visible = filter === 'all' ? records : records.filter(r => r.q.module === filter);

    const filterTabs = ['all'].concat(MODULES.map(m => m.id)).map(id => {
      const label = id === 'all' ? '全部' : Bank.moduleInfo(id).short;
      const count = counts[id] || 0;
      return `<button type="button" data-filter="${id}" class="${filter === id ? 'active' : ''}">${label}${count ? ' ' + count : ''}</button>`;
    }).join('');

    const listHtml = visible.length ? visible.map(rec => renderItem(rec)).join('') : `
      <div class="empty">
        <b>${records.length ? '该模块暂无错题' : '错题本还是空的'}</b>
        ${records.length ? '换一个模块看看吧。' : '练习或模拟考试中答错的题会自动收集到这里，方便集中复盘。'}
        ${records.length ? '' : '<div><a class="btn btn-primary btn-sm" href="#/practice">去刷题</a></div>'}
      </div>`;

    view.innerHTML = `
      <div class="page-head">
        <h1>错题本</h1>
        <p class="lead">答错的题自动收录。建议隔天重做一遍，连续两次答对后移出错题本。</p>
      </div>
      <div class="spread mb-16">
        <div class="seg">${filterTabs}</div>
        <span class="chip">共 ${records.length} 道错题</span>
      </div>
      <div class="flex-col">${listHtml}</div>`;

    $$('[data-filter]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        openId = null;
        redo = null;
        render(view);
      });
    });

    bindItems(view, records);
  }

  function renderItem(rec) {
    const { q, info } = rec;
    const m = Bank.moduleInfo(q.module);
    const isOpen = openId === q.id;
    const stemText = stripHtml(q.stem);

    let redoHtml = '';
    if (isOpen) {
      const chosen = redo && redo.qid === q.id ? redo.choice : null;
      const checked = redo && redo.qid === q.id && redo.checked;
      const opts = q.options.map((opt, i) => {
        let cls = 'opt';
        let mark = '';
        if (checked) {
          cls += ' locked';
          if (i === q.answer) { cls += ' correct'; mark = '正确答案'; }
          if (i === chosen && i !== q.answer) { cls += ' wrong'; mark = '你的选择'; }
        } else if (i === chosen) {
          cls += ' selected';
        }
        return `<button class="${cls}" type="button" data-action="choose" data-qid="${esc(q.id)}" data-opt="${i}" ${checked ? 'disabled' : ''}>
          <span class="letter">${LETTERS[i]}</span><span>${esc(opt)}</span>
          ${mark ? `<span class="opt-mark">${mark}</span>` : ''}
        </button>`;
      }).join('');

      redoHtml = `
        <div class="rule-double" style="margin:14px 0"></div>
        ${questionMaterial(q)}
        <div class="qstem" style="margin-top:0">${questionStem(q)}</div>
        <div class="opts">${opts}</div>
        ${checked ? `<div class="explain"><h4>答案与解析</h4><p><b>正确答案：${LETTERS[q.answer]}</b>${chosen === q.answer ? '　<span class="chip ok">回答正确</span>' : '　<span class="chip bad">回答错误</span>'}</p><p>${esc(q.explain)}</p></div>` : ''}
        <div class="row" style="margin-top:16px">
          ${checked
            ? (chosen === q.answer
              ? `<button class="btn btn-primary btn-sm" type="button" data-action="master" data-qid="${esc(q.id)}">已掌握，移出错题本</button>`
              : `<button class="btn btn-outline btn-sm" type="button" data-action="retry" data-qid="${esc(q.id)}">再试一次</button>`)
            : `<button class="btn btn-primary btn-sm" type="button" data-action="check" data-qid="${esc(q.id)}" ${chosen === null ? 'disabled' : ''}>确认答案</button>`}
          <button class="btn btn-ghost btn-sm" type="button" data-action="close" data-qid="${esc(q.id)}">收起</button>
        </div>`;
    }

    return `
      <div class="imp-item">
        <div class="imp-top">
          <div class="imp-stem">
            <div class="row" style="margin-bottom:6px">
              <span class="chip primary">${esc(m.short)}</span>
              <span class="chip">错过 ${info.wrongCount} 次</span>
              <span class="chip">${info.lastAt ? '最近 ' + fmtDateTime(info.lastAt).slice(5) : ''}</span>
            </div>
            <b>${esc(stemText).slice(0, 120)}${stemText.length > 120 ? '…' : ''}</b>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-outline btn-sm" type="button" data-action="toggle" data-qid="${esc(q.id)}">${isOpen ? '收起' : '重做这道题'}</button>
          <button class="btn btn-outline btn-sm" type="button" data-action="askai" data-qid="${esc(q.id)}">问 AI 讲解</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="remove" data-qid="${esc(q.id)}">移出错题本</button>
        </div>
        ${redoHtml}
      </div>`;
  }

  function bindItems(view, records) {
    $$('[data-action]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.dataset.qid;
        const action = btn.dataset.action;
        const q = Bank.byId(qid);
        if (!q) return;

        /* A：带着错题去问 AI，让它分析为什么错、以后怎么避免 */
        if (action === 'askai') {
          if (typeof AiChat === 'undefined' || !AiChat.askQuestion) return;
          AiChat.askQuestion(qid);
          return;
        }

        if (action === 'toggle') {
          openId = openId === qid ? null : qid;
          redo = null;
          render(view);
        } else if (action === 'close') {
          openId = null;
          redo = null;
          render(view);
        } else if (action === 'choose') {
          redo = { qid, choice: Number(btn.dataset.opt), checked: false };
          render(view);
        } else if (action === 'check') {
          if (!redo || redo.qid !== qid || redo.choice === null) return;
          const correct = redo.choice === q.answer;
          redo.checked = true;
          Store.recordAnswer({ qid, module: q.module, correct, mode: 'review' });
          if (!correct) Store.addMistake(qid);
          render(view);
        } else if (action === 'retry') {
          redo = { qid, choice: null, checked: false };
          render(view);
        } else if (action === 'master') {
          Store.removeMistake(qid);
          openId = null;
          redo = null;
          toast('已移出错题本');
          render(view);
        } else if (action === 'remove') {
          Store.removeMistake(qid);
          openId = null;
          redo = null;
          toast('已移出错题本');
          render(view);
        }
      });
    });
  }

  return { render };
})();

/* ==================== 学习统计 ==================== */

const Stats = (() => {
  function render(view) {
    const s = Store.stats();
    const maxDay = Math.max(1, ...s.last7.map(d => d.count));
    const exams = Store.get().exams.slice(0, 10);

    const moduleRows = MODULES.map(m => {
      const slot = s.byModule[m.id];
      const acc = slot.answered ? pct(slot.correct, slot.answered) : 0;
      return `
        <div class="bar-row">
          <span class="label">${esc(m.name)}</span>
          <div class="bar"><i class="${acc >= 60 ? 'ok' : ''}" style="width:${acc}%"></i></div>
          <span class="val">${slot.answered ? acc + '% · ' + slot.answered + ' 题' : '暂无作答'}</span>
        </div>`;
    }).join('');

    const week = s.last7.map(d => `
      <div class="week-col">
        <b>${d.count || ''}</b>
        <i class="${d.count ? '' : 'zero'}" style="height:${d.count ? Math.max(6, (d.count / maxDay) * 88) : 3}px"></i>
        <span>${d.label}</span>
      </div>`).join('');

    const examRows = exams.length ? exams.map(e => `
      <tr>
        <td>${fmtDateTime(e.t)}</td>
        <td class="num"><b>${e.score}</b></td>
        <td class="num">${e.correct} / ${e.total}</td>
        <td class="num">${fmtClock(e.duration)}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="muted">还没有考试记录</td></tr>';

    view.innerHTML = `
      <div class="page-head">
        <h1>学习统计</h1>
        <p class="lead">所有数据只保存在这台设备的浏览器里。换设备前，记得在设置中导出备份。</p>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><b>${s.total}<small>题</small></b><span>累计作答</span></div>
        <div class="kpi"><b>${s.accuracy}<small>%</small></b><span>总正确率</span></div>
        <div class="kpi"><b>${s.streak}<small>天</small></b><span>连续学习</span></div>
        <div class="kpi"><b>${s.mistakesCount}<small>题</small></b><span>错题本存量</span></div>
      </div>

      <div class="section-title"><h2>近 7 天做题量</h2></div>
      <div class="card"><div class="week-chart">${week}</div></div>

      <div class="section-title"><h2>分模块正确率</h2></div>
      <div class="card">${moduleRows}</div>

      <div class="section-title"><h2>考试记录</h2><span class="more">最佳 ${s.bestExam || '—'} 分</span></div>
      <div class="card" style="padding:6px 12px">
        <table class="table">
          <thead><tr><th>交卷时间</th><th>得分</th><th>答对</th><th>用时</th></tr></thead>
          <tbody>${examRows}</tbody>
        </table>
      </div>

      <div class="note-banner mt-24">
        <b>关于数据</b>　清除浏览器数据、更换浏览器或设备都会导致记录丢失。建议每周在<a class="link" href="#/settings">设置</a>中导出一次 JSON 备份。
      </div>`;
  }

  return { render };
})();
