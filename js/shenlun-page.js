/* 朱批书房 · 申论学习 */
'use strict';

const Shenlun = (() => {
  let tab = 'methods';
  let openMethod = SHENLUN.methods[0].id;
  let hintOpen = false;

  /* 题库 = 真题 + 模拟题，真题排在前面 */
  const ALL_PROMPTS = (typeof SHENLUN_ZHENTI !== 'undefined' ? SHENLUN_ZHENTI.slice() : [])
    .concat(Array.isArray(SHENLUN.prompts) ? SHENLUN.prompts.slice() : []);
  const TYPES = ['归纳概括', '综合分析', '提出对策', '贯彻执行', '文章写作'];

  let filterKind = 'all';   // all | real | mock
  let filterType = 'all';   // all | 题型

  let promptId = (ALL_PROMPTS.find(p => p.type === '文章写作') || ALL_PROMPTS[0]).id;

  function allPrompts() { return ALL_PROMPTS; }

  const REAL_COUNT = ALL_PROMPTS.filter(p => p.real).length;

  function visiblePrompts() {
    return ALL_PROMPTS.filter(p => {
      const okKind = filterKind === 'all' ? true : filterKind === 'real' ? !!p.real : !p.real;
      const okType = filterType === 'all' ? true : p.type === filterType;
      return okKind && okType;
    });
  }

  function findPrompt(id) {
    return ALL_PROMPTS.find(p => p.id === id) || ALL_PROMPTS[0];
  }

  /* AI 批改状态 */
  let grading = false;
  let gradeError = '';
  let manualText = '';

  const RUBRICS = {
    '归纳概括': [['要点全面', 40], ['准确提炼', 25], ['条理清晰', 20], ['语言简练', 15]],
    '综合分析': [['观点明确', 20], ['分析深入', 35], ['结构完整', 25], ['语言表达', 20]],
    '提出对策': [['对策针对性', 30], ['措施可行性', 30], ['内容具体', 25], ['条理清晰', 15]],
    '贯彻执行': [['格式规范', 20], ['内容完整', 35], ['语言得体', 25], ['条理清晰', 20]],
    '文章写作': [['立意准确', 25], ['结构完整', 20], ['论证充分', 30], ['语言表达', 25]]
  };

  function render(view) {
    const tabs = [
      ['methods', '方法技巧'],
      ['themes', '素材库'],
      ['essays', '范文'],
      ['write', '写作练习']
    ].map(([id, label]) => `<button type="button" data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');

    let body = '';
    if (tab === 'methods') body = renderMethods();
    else if (tab === 'themes') body = renderThemes();
    else if (tab === 'essays') body = renderEssays();
    else body = renderWrite();

    view.innerHTML = `
      <div class="page-head">
        <h1>申论学习</h1>
        <p class="lead">五种题型的方法与模板、热点素材、范文示例，以及可以随时保存的写作练习区。题库共 ${ALL_PROMPTS.length} 道，其中 ${REAL_COUNT} 道近年国考、省考、联考真题。写完可以直接让 AI 按评分维度批改。申论提高靠“动笔写 + 对照改”，不要只看不写。</p>
      </div>
      <div class="seg" style="margin-bottom:22px">${tabs}</div>
      <div id="shenlun-body">${body}</div>`;

    $$('[data-tab]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        hintOpen = false;
        render(view);
      });
    });

    if (tab === 'methods') bindMethods(view);
    if (tab === 'write') bindWrite(view);
  }

  /* ---------- 方法技巧 ---------- */

  function renderMethods() {
    return SHENLUN.methods.map((m, i) => `
      <div class="acc ${openMethod === m.id ? 'open' : ''}" data-method="${m.id}">
        <button class="acc-head" type="button" data-method-toggle="${m.id}">
          <span><span class="idx">${String(i + 1).padStart(2, '0')}</span>${esc(m.title)}</span>
          <svg width="18" height="18"><use href="#i-arrow"/></svg>
        </button>
        <div class="acc-body">
          <p class="muted small" style="margin-bottom:6px">${esc(m.summary)}</p>
          <h5>作答步骤</h5>
          <ol>${m.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          <h5>结构模板</h5>
          <div class="template">${esc(m.template)}</div>
          <h5>常见失分点</h5>
          <ul>${m.pitfalls.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>
      </div>`).join('');
  }

  function bindMethods(view) {
    $$('[data-method-toggle]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        openMethod = openMethod === btn.dataset.methodToggle ? null : btn.dataset.methodToggle;
        render(view);
      });
    });
  }

  /* ---------- 素材库 ---------- */

  function renderThemes() {
    return `
      <div class="grid grid-2">
        ${SHENLUN.themes.map(t => `
          <div class="card theme-card">
            <div class="theme-head">
              <span class="char-tile">${t.glyph}</span>
              <div><h3>${esc(t.title)}</h3><p class="small muted">${esc(t.angle)}</p></div>
            </div>
            <div class="point-block">
              <h5>核心观点</h5>
              <ul class="list-dash">${t.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
            </div>
            <div class="point-block">
              <h5>可用表述</h5>
              ${t.phrases.map(p => `<p class="phrase">${esc(p)}</p>`).join('')}
            </div>
            <div class="point-block">
              <h5>案例</h5>
              <ul class="list-dash">${t.cases.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ---------- 范文 ---------- */

  function renderEssays() {
    return SHENLUN.essays.map(e => `
      <div class="card essay-card mb-24">
        <div class="row" style="justify-content:space-between">
          <span class="chip primary">${esc(e.type)}</span>
          <span class="small muted">${esc(e.title)}</span>
        </div>
        <div class="essay-prompt"><b>题目：</b>${esc(e.prompt)}</div>
        <details class="disclosure">
          <summary>阅读全文（${countChars(e.body.map(x => typeof x === 'string' ? x : x.text).join(''))} 字）</summary>
          <div class="essay-body">
            ${e.body.map(item => {
              if (typeof item === 'string') return `<p>${esc(item)}</p>`;
              if (item.h) return `<p class="essay-title">${esc(item.text)}</p>`;
              if (item.sign) return `<p style="text-align:right;text-indent:0">${esc(item.text)}</p>`;
              return `<p>${esc(item.text)}</p>`;
            }).join('')}
          </div>
        </details>
        <div class="review-box">
          <h5>点评</h5>
          ${esc(e.review)}
        </div>
      </div>`).join('');
  }

  /* ---------- 写作练习 ---------- */

  function parseTarget(requirement) {
    const range = requirement.match(/(\d{2,4})\s*[-—~至]\s*(\d{2,4})\s*字/);
    if (range) return { min: Number(range[1]), max: Number(range[2]), label: `${range[1]}—${range[2]} 字` };
    const max = requirement.match(/不超过\s*(\d{2,4})\s*字/);
    if (max) return { min: null, max: Number(max[1]), label: `不超过 ${max[1]} 字` };
    const target = requirement.match(/(\d{2,4})\s*字/);
    if (target) return { min: Number(target[1]), max: Number(target[1]), label: `${target[1]} 字左右` };
    return { min: null, max: null, label: '' };
  }

  function renderWrite() {
    const prompt = findPrompt(promptId);
    const list = visiblePrompts();
    const draft = Store.getDraft(prompt.id);
    const target = parseTarget(prompt.requirement);
    const text = draft ? draft.text : '';
    const ai = Store.get().settings.ai || {};
    const aiReady = AI.hasKey(ai);
    const grade = Store.getGrade(prompt.id);

    return `
      <div class="note-banner mb-16">
        <b>字数规则</b>　申论小题（归纳概括、综合分析、提出对策、贯彻执行）一般 200—500 字；文章写作（大作文）国考多为 1000—1200 字，省考与联考多为 800—1200 字。本练习以题目中的具体要求为准，字数上限超出时编辑器会提示。
      </div>
      <div class="write-area">
        <aside class="write-side">
          <div class="spread" style="margin-bottom:10px">
            <h3 style="font-size:16px">练习题目</h3>
            <span class="small muted">共 ${ALL_PROMPTS.length} 道 · 当前 ${list.length} 道</span>
          </div>
          <div class="prompt-filter">
            ${[['all', '全部'], ['real', '真题'], ['mock', '模拟题']].map(([k, label]) => `<button type="button" data-fkind="${k}" class="${filterKind === k ? 'active' : ''}">${label}</button>`).join('')}
          </div>
          <div class="prompt-filter">
            <span class="pf-label">题型</span>
            <button type="button" data-ftype="all" class="${filterType === 'all' ? 'active' : ''}">不限</button>
            ${TYPES.map(t => `<button type="button" data-ftype="${t}" class="${filterType === t ? 'active' : ''}">${t}</button>`).join('')}
          </div>
          <div class="prompt-list">
            ${list.length ? list.map(p => {
              const d = Store.getDraft(p.id);
              const t = parseTarget(p.requirement);
              return `<button class="prompt-item ${p.id === prompt.id ? 'active' : ''}" type="button" data-prompt="${p.id}">
                <span class="p-type">${p.real ? '<span class="p-real">真题</span>' : ''}${esc(p.type)}${t.label ? ' · ' + esc(t.label) : ''}</span>${esc(p.title)}${d && d.text.trim() ? '<span class="p-done">已写</span>' : ''}
              </button>`;
            }).join('') : '<p class="small muted">该筛选下暂无题目，换个条件试试。</p>'}
          </div>
        </aside>

        <section>
          <div class="card mb-16">
            <div class="row" style="justify-content:space-between;margin-bottom:8px">
              <span>
                <span class="chip primary">${esc(prompt.type)}</span>
                ${prompt.source ? `<span class="src-chip" style="margin-left:6px">${esc(prompt.source)}</span>` : ''}
              </span>
              <span class="chip">${target.label}</span>
            </div>
            <h2 style="font-size:19px;margin-bottom:8px">${esc(prompt.title)}</h2>
            <p style="font-size:14px"><b>作答要求：</b>${esc(prompt.requirement)}</p>
            <div class="material-box">
              <h4>给定材料${prompt.real ? '（真题梗概）' : ''}</h4>
              <p>${esc(prompt.material)}</p>
              ${prompt.real ? '<p class="small muted" style="margin-top:8px">真题原文资料约数千字，此处为要点梗概，供审题、搭框架、练分条使用；临考前建议另找完整真题原文限时作答。</p>' : ''}
            </div>
            <div class="row">
              <button class="btn btn-outline btn-sm" type="button" id="toggle-hint">${hintOpen ? '收起参考思路' : '查看参考思路'}</button>
              <span class="small muted">建议先自己完整写一遍，再看思路对照。</span>
            </div>
            ${hintOpen ? `<div class="note-banner mt-16"><b>思路提示</b>　${esc(prompt.hint)}</div>` : ''}
          </div>

          <div class="card editor-box">
            <div class="spread" style="margin-bottom:10px">
              <h3 style="font-size:16px">我的作答</h3>
              <span class="small muted" id="save-status">${draft ? '草稿已载入 · ' + fmtDateTime(draft.updatedAt) : '开始输入后自动保存'}</span>
            </div>
            <textarea id="draft-text" placeholder="在这里作答，内容会自动保存在本机浏览器中……">${esc(text)}</textarea>
            <div class="editor-meta">
              <span id="word-count">${countChars(text)} 字${target.label ? ' · 要求' + target.label : ''}</span>
              <span class="row">
                <button class="btn btn-ghost btn-sm" type="button" id="export-draft">导出 TXT</button>
                <button class="btn btn-ghost btn-sm" type="button" id="clear-draft">清空重写</button>
              </span>
            </div>
          </div>

          <div class="card mt-16">
            <div class="spread">
              <div>
                <h3 style="font-size:16px">AI 批改</h3>
                <p class="small muted" style="margin-top:2px">按题型评分维度给出模拟分数、优缺点和修改建议。AI 估分仅供参考，不能替代老师阅卷。</p>
              </div>
              <div class="row">
                <button class="btn btn-ghost btn-sm" type="button" id="copy-grade-prompt">复制批改提示词</button>
                <button class="btn ${grade ? 'btn-outline' : 'btn-primary'} btn-sm" type="button" id="grade-btn" ${grading ? 'disabled' : ''}>${grading ? '批改中…（最长 90 秒）' : grade ? '重新批改' : '开始批改'}</button>
              </div>
            </div>

            ${basicChecksHtml(text, target)}

            ${!aiReady ? `<div class="note-banner warn mt-16"><b>尚未配置大模型</b>　请先在<a class="link" href="#/settings">设置</a>中填写你自己的 API Key（只保存在本机）；也可以复制批改提示词，粘贴到任意大模型对话中，再把评分 JSON 粘贴回来。</div>` : ''}
            ${gradeError ? `<div class="note-banner warn mt-16"><b>批改失败</b>　${esc(gradeError)}</div>` : ''}

            ${grade ? renderGrade(grade, text) : '<p class="small muted" style="margin-top:12px">完成作答后点击“开始批改”，结果会保存在本机，切换题目后可回来查看。</p>'}

            <details class="disclosure" ${(!aiReady || gradeError) ? 'open' : ''}>
              <summary>手动批改：复制提示词 → 粘贴评分结果</summary>
              <div class="row mt-8">
                <button class="btn btn-outline btn-sm" type="button" id="copy-grade-prompt-2">复制批改提示词</button>
                <span class="small muted">粘贴到大模型对话，把返回的 JSON 粘到下面</span>
              </div>
              <textarea class="textarea mt-8" id="manual-grade" rows="5" placeholder='粘贴形如 {"total":72,"dimensions":[{"name":"要点全面","score":30,"full":40,"comment":"……"}],"summary":"……"} 的 JSON'>${esc(manualText)}</textarea>
              <div class="row-end mt-8"><button class="btn btn-outline btn-sm" type="button" id="parse-manual-grade">解析并保存评分</button></div>
            </details>
          </div>

          <div class="card mt-16">
            <h3 style="font-size:15px;margin-bottom:8px">写完后自查</h3>
            <div class="flex-col">
              ${prompt.checklist.map(c => `<label class="row" style="gap:8px;font-size:13.5px;color:var(--ink-2)"><input type="checkbox" style="accent-color:var(--primary)"> ${esc(c)}</label>`).join('')}
            </div>
          </div>
        </section>
      </div>`;
  }

  function bindWrite(view) {
    $$('[data-fkind]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        filterKind = btn.dataset.fkind;
        filterType = 'all';
        const list = visiblePrompts();
        if (list.length && !list.some(p => p.id === promptId)) promptId = list[0].id;
        hintOpen = false;
        render(view);
      });
    });

    $$('[data-ftype]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        filterType = btn.dataset.ftype;
        const list = visiblePrompts();
        if (list.length && !list.some(p => p.id === promptId)) promptId = list[0].id;
        hintOpen = false;
        render(view);
      });
    });

    $$('[data-prompt]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        promptId = btn.dataset.prompt;
        hintOpen = false;
        gradeError = '';
        manualText = '';
        render(view);
      });
    });

    const toggle = $('#toggle-hint', view);
    if (toggle) toggle.addEventListener('click', () => {
      hintOpen = !hintOpen;
      render(view);
    });

    const ta = $('#draft-text', view);
    const counter = $('#word-count', view);
    const status = $('#save-status', view);
    const prompt = findPrompt(promptId);
    const target = parseTarget(prompt.requirement);

    if (ta) {
      const save = debounce(() => {
        Store.saveDraft(prompt.id, ta.value);
        if (status) status.textContent = '已自动保存 ' + fmtDateTime(Date.now()).slice(11);
      }, 600);

      ta.addEventListener('input', () => {
        const n = countChars(ta.value);
        if (counter) {
          let text = `${n} 字`;
          if (target.label) {
            text += ' · 要求' + target.label;
            if (target.max && n > target.max) text += '（已超出）';
          }
          counter.textContent = text;
          counter.classList.toggle('over', !!(target.max && n > target.max));
          counter.classList.toggle('ok', !!(target.min && n >= target.min && (!target.max || n <= target.max)));
        }
        save();
      });
    }

    const exportBtn = $('#export-draft', view);
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const text = ta ? ta.value : '';
      if (!text.trim()) { toast('还没有内容可导出'); return; }
      downloadFile(`申论练习-${prompt.title}-${todayStr()}.txt`, text, 'text/plain');
    });

    const clearBtn = $('#clear-draft', view);
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: '清空重写', text: '当前草稿将被清空，且无法恢复。确定吗？', okText: '清空' });
      if (!ok) return;
      Store.saveDraft(prompt.id, '');
      render(view);
      toast('已清空');
    });

    const gradeBtn = $('#grade-btn', view);
    if (gradeBtn) gradeBtn.addEventListener('click', () => gradeEssay(view, prompt, ta));

    ['#copy-grade-prompt', '#copy-grade-prompt-2'].forEach(sel => {
      const btn = $(sel, view);
      if (btn) btn.addEventListener('click', () => copyGradePrompt(prompt, ta));
    });

    const manualTa = $('#manual-grade', view);
    if (manualTa) manualTa.addEventListener('input', () => { manualText = manualTa.value; });

    const parseBtn = $('#parse-manual-grade', view);
    if (parseBtn) parseBtn.addEventListener('click', () => {
      if (manualTa) manualText = manualTa.value;
      parseManualGrade(view, prompt, ta);
    });
  }

  /* ---------- AI 批改 ---------- */

  function basicChecksHtml(text, target) {
    const n = countChars(text);
    const paras = text.split(/\n+/).filter(s => s.trim()).length;
    const bullets = (text.match(/(?:^|[；;。：:\n])\s*(?:[一二三四五六七八九十]+[、．.]|（[一二三四五六七八九十]+）|\d{1,2}[、．.]|一是|二是|三是|四是|五是|首先|其次|再次|最后)/g) || []).length;
    let wordCls = '';
    let wordText = `字数 ${n}`;
    if (target.label) wordText += ` · 要求${target.label}`;
    if (target.max && n > target.max) { wordCls = 'bad'; wordText += '（超出）'; }
    else if (target.min && n >= target.min) wordCls = 'ok';
    return `<div class="row mt-16">
      <span class="chip ${wordCls}">${wordText}</span>
      <span class="chip">段落 ${paras}</span>
      <span class="chip">分条 / 分论点标记 ${bullets}</span>
    </div>`;
  }

  function buildGradePrompt(prompt, text) {
    const rubric = (RUBRICS[prompt.type] || RUBRICS['文章写作'])
      .map(([name, full]) => `${name}（满分 ${full} 分）`).join('、');
    const chars = countChars(text);
    return [
      '你是一名资深申论阅卷老师。请严格按照公务员申论阅卷标准，批改下面的考生作答。',
      '题型：' + prompt.type,
      '题目：' + prompt.title,
      prompt.source ? '来源：' + prompt.source + '（真题，给定资料为梗概）' : '',
      '作答要求：' + prompt.requirement,
      '给定材料：',
      '"""',
      String(prompt.material || '').slice(0, 3000),
      '"""',
      `考生作答（${chars} 字）：`,
      '"""',
      String(text || '').slice(0, 6000),
      '"""',
      '评分维度：' + rubric + '。',
      '批改要求：',
      '1. 按各维度给出整数分数，维度得分之和等于总分（0—100）；',
      '2. 优点和问题要具体，指出作答中的实际表现；',
      '3. 给出 3—5 条可操作的改进建议；',
      '4. revised 字段给出一段 100 字以内的修改示范，不需要可留空；',
      '5. 只输出 JSON，不要输出 markdown 代码块或其他解释文字。',
      '输出格式：',
      '{"total":72,"level":"良好","dimensions":[{"name":"要点全面","score":30,"full":40,"comment":"……"}],"strengths":["……"],"weaknesses":["……"],"suggestions":["……"],"summary":"……","revised":"……"}'
    ].join('\n');
  }

  function normalizeGrade(obj, prompt, text) {
    const rubric = RUBRICS[prompt.type] || RUBRICS['文章写作'];
    const toArray = v => Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : (v ? [String(v)] : []);

    let dims = Array.isArray(obj.dimensions) ? obj.dimensions.map(d => {
      const full = Number(d.full) || 0;
      let score = Number(d.score) || 0;
      if (full > 0) score = Math.max(0, Math.min(full, score));
      return { name: String(d.name || ''), score: score, full: full, comment: String(d.comment || '') };
    }).filter(d => d.name) : [];

    if (!dims.length) {
      dims = rubric.map(([name, full]) => ({ name: name, score: 0, full: full, comment: '' }));
    }

    const dimSum = dims.reduce((sum, d) => sum + d.score, 0);
    let total = Number(obj.total != null ? obj.total : obj.score);
    if (!Number.isFinite(total) || total <= 0) total = dimSum;
    total = Math.max(0, Math.min(100, Math.round(total)));

    const level = total >= 85 ? '优秀' : total >= 70 ? '良好' : total >= 60 ? '及格' : '待提高';
    const ai = Store.get().settings.ai || {};

    return {
      t: Date.now(),
      total: total,
      level: level,
      dimensions: dims,
      strengths: toArray(obj.strengths).slice(0, 6),
      weaknesses: toArray(obj.weaknesses || obj.problems).slice(0, 6),
      suggestions: toArray(obj.suggestions).slice(0, 6),
      summary: String(obj.summary || obj.comment || ''),
      revised: String(obj.revised || ''),
      chars: countChars(text),
      type: prompt.type,
      title: prompt.title,
      model: ai.model || ''
    };
  }

  function renderGrade(grade, currentText) {
    const levelCls = grade.total >= 70 ? 'ok' : grade.total >= 60 ? 'warn' : 'bad';
    const changed = countChars(currentText) !== grade.chars;
    const list = arr => (arr && arr.length)
      ? `<ul class="list-dash">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '<p class="small muted">暂无</p>';

    return `
      <div class="grade-block">
        <div class="grade-head">
          <div class="grade-score"><b>${grade.total}</b><small>/ 100</small></div>
          <div>
            <span class="chip ${levelCls}">${esc(grade.level || '')}</span>
            <p class="small muted">${fmtDateTime(grade.t)}${grade.model ? ' · ' + esc(grade.model) : ''} · 基于 ${grade.chars} 字${changed ? ' · <span style="color:var(--warn)">作答已修改，建议重新批改</span>' : ''}</p>
          </div>
        </div>
        <div class="grade-dims">
          ${grade.dimensions.map(d => `
            <div class="bar-row">
              <span class="label">${esc(d.name)}</span>
              <div class="bar"><i style="width:${pct(d.score, d.full || 1)}%"></i></div>
              <span class="val">${d.score} / ${d.full} 分</span>
            </div>
            ${d.comment ? `<p class="grade-comment">${esc(d.comment)}</p>` : ''}`).join('')}
        </div>
        <div class="grid grid-2 mt-16">
          <div class="review-box" style="background:var(--ok-soft)"><h5 style="color:var(--ok)">优点</h5>${list(grade.strengths)}</div>
          <div class="review-box" style="background:var(--bad-soft)"><h5 style="color:var(--bad)">问题</h5>${list(grade.weaknesses)}</div>
        </div>
        <div class="review-box mt-16"><h5>改进建议</h5>${list(grade.suggestions)}</div>
        ${grade.summary ? `<p class="mt-16" style="font-size:14px;line-height:1.9"><b>总评：</b>${esc(grade.summary)}</p>` : ''}
        ${grade.revised ? `<details class="disclosure mt-8"><summary>查看修改示范</summary><p style="font-family:var(--font-serif);font-size:14.5px;line-height:1.95;margin-top:8px">${esc(grade.revised)}</p></details>` : ''}
      </div>`;
  }

  async function gradeEssay(view, prompt, ta) {
    const text = ta ? ta.value : '';
    if (countChars(text) < 30) { toast('请先完成作答（至少 30 字）'); return; }

    Store.saveDraft(prompt.id, text);
    const ai = Store.get().settings.ai || {};
    if (!AI.hasKey(ai)) {
      toast(AI.MISSING_KEY);
      render(view);
      return;
    }

    grading = true;
    gradeError = '';
    render(view);

    const prompt_ = buildGradePrompt(prompt, text);
    const opts = {
      system: '你是一名资深申论阅卷老师，严格按评分标准打分，只输出 JSON。',
      temperature: 0.3
    };

    try {
      let content = null;
      let usedModel = ai.model || AI_DEFAULT.model;

      try {
        content = await AI.chat(ai, prompt_, opts);
      } catch (first) {
        /* 模型名填错会被接口拒绝（403）。这里自动用默认模型再试一次，
         * 免得用户必须手动进设置页才能继续批改。 */
        if (first.code !== 'MODEL_DENIED') throw first;
        const fallback = Object.assign({}, ai, { model: AI_DEFAULT.model, baseUrl: AI_DEFAULT.baseUrl });
        if (fallback.model === (ai.model || '')) throw first;
        content = await AI.chat(fallback, prompt_, opts);
        usedModel = AI_DEFAULT.model;
        Store.setAI({ model: AI_DEFAULT.model, baseUrl: AI_DEFAULT.baseUrl });
        toast('当前模型不可用，已临时改用 ' + AI_DEFAULT.model + ' 完成批改');
      }

      const grade = normalizeGrade(AI.parseJSON(content), prompt, text);
      grade.model = usedModel;
      Store.saveGrade(prompt.id, grade);
      grading = false;
      if ((location.hash || '').startsWith('#/shenlun')) render(view);
      toast('批改完成：' + grade.total + ' 分');
    } catch (err) {
      grading = false;
      gradeError = err.message || String(err);
      if ((location.hash || '').startsWith('#/shenlun')) render(view);
      toast('批改失败，可尝试手动批改');
    }
  }

  async function copyGradePrompt(prompt, ta) {
    const text = ta ? ta.value : '';
    if (countChars(text) < 20) { toast('请先写一些内容再复制提示词'); return; }
    try {
      await copyText(buildGradePrompt(prompt, text));
      toast('批改提示词已复制');
    } catch (err) {
      toast('复制失败，请手动选中文本复制');
    }
  }

  function parseManualGrade(view, prompt, ta) {
    if (!manualText.trim()) { toast('请先粘贴批改结果 JSON'); return; }
    try {
      const text = ta ? ta.value : '';
      const grade = normalizeGrade(AI.parseJSON(manualText), prompt, text);
      Store.saveDraft(prompt.id, text);
      Store.saveGrade(prompt.id, grade);
      gradeError = '';
      render(view);
      toast('已保存批改结果：' + grade.total + ' 分');
    } catch (err) {
      gradeError = '解析失败：' + err.message;
      render(view);
    }
  }

  return { render };
})();
