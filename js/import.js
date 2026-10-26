/* 朱批书房 · 题库导入（PDF / Word / 文本 / AI 出题） */
'use strict';

const ImportPage = (() => {
  const PDF_VERSION = '3.11.174';
  const CDN = {
    pdf: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VERSION}/pdf.min.js`,
    pdfWorker: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_VERSION}/pdf.worker.min.js`,
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  };
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  let tab = 'file';
  let files = [];          // {name, status, cls}
  let parsed = [];         // 待导入题目
  let defaultModule = 'auto';
  let busy = false;
  let aiBusy = false;
  let aiMaterial = '';
  let aiJsonText = '';
  let aiPromptCache = '';
  let aiError = '';
  let uidSeq = 0;

  const nextUid = () => 'p' + (++uidSeq);

  /* ==================== 入口 ==================== */

  function render(view) {
    const tabs = [
      ['file', '文件解析'],
      ['ai', 'AI 出题'],
      ['manage', '我的题库']
    ].map(([id, label]) => `<button type="button" data-tab="${id}" class="${tab === id ? 'active' : ''}">${label}</button>`).join('');

    let body = '';
    if (tab === 'file') body = renderFileTab();
    else if (tab === 'ai') body = renderAITab();
    else body = renderManageTab();

    view.innerHTML = `
      <div class="page-head">
        <h1>题库导入</h1>
        <p class="lead">上传 PDF、Word（.docx）或文本文件，自动识别题干、选项、答案和解析，校对后导入题库。也可以让大模型根据学习材料出题。文件只在本机浏览器中解析，不会上传到任何服务器。</p>
      </div>
      <div class="seg" style="margin-bottom:22px">${tabs}</div>
      ${body}`;

    $$('[data-tab]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        render(view);
      });
    });

    if (tab === 'file') bindFileTab(view);
    if (tab === 'ai') bindAITab(view);
    if (tab === 'manage') bindManageTab(view);
  }

  /* ==================== 文件解析 ==================== */

  function renderFileTab() {
    const fileRows = files.map(f => `
      <div class="file-row">
        <span class="fname">${esc(f.name)}</span>
        <span class="fstatus ${f.cls || ''}">${esc(f.status)}</span>
      </div>`).join('');

    return `
      <div class="dropzone" id="dropzone" role="button" tabindex="0">
        <div class="dz-icon"><svg width="34" height="34"><use href="#i-upload"/></svg></div>
        <b>点击选择文件，或把文件拖到这里</b>
        <span>支持 PDF、Word（.docx）、TXT、Markdown；单个文件建议不超过 25MB</span>
        <input type="file" id="file-input" multiple accept=".pdf,.docx,.txt,.md" hidden>
      </div>
      <div class="mt-8">${fileRows}</div>

      <div class="note-banner warn mt-16">
        <b>解析说明</b>　① 扫描版 PDF（整页图片）没有文字层，无法直接解析，请先 OCR 或换用文字版；② 旧版 .doc 请先另存为 .docx；③ 题库排版越接近“1. 题干 A. 选项 B. 选项 答案：A 解析：……”格式，识别越准确，识别不了的段落会列出来供你调整。
      </div>

      <details class="disclosure mt-16">
        <summary>没有文件？直接粘贴文本解析</summary>
        <textarea class="textarea" id="paste-text" placeholder="把题目文本粘贴到这里，例如：&#10;1. 我国的根本政治制度是（ ）&#10;A. 人民代表大会制度  B. 民族区域自治制度&#10;C. 基层群众自治制度  D. 多党合作制度&#10;答案：A&#10;解析：……"></textarea>
        <div class="row-end mt-8"><button class="btn btn-outline btn-sm" type="button" id="parse-paste">解析文本</button></div>
      </details>

      ${parsed.length ? renderPreview() : ''}`;
  }

  function bindFileTab(view) {
    const dz = $('#dropzone', view);
    const input = $('#file-input', view);
    if (dz && input) {
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
      input.addEventListener('change', () => { if (input.files.length) handleFiles(input.files); input.value = ''; });
    }

    const pasteBtn = $('#parse-paste', view);
    if (pasteBtn) pasteBtn.addEventListener('click', () => {
      const ta = $('#paste-text', view);
      const text = ta ? ta.value : '';
      if (text.replace(/\s/g, '').length < 10) { toast('请先粘贴题目文本'); return; }
      const items = parseQuestions(text);
      if (!items.length) { toast('没有识别出题目，请检查格式'); return; }
      items.forEach(it => { it.source = '粘贴文本'; });
      parsed = parsed.concat(items);
      toast(`识别出 ${items.length} 题`);
      render(view);
    });

    bindPreview(view);
  }

  /* ==================== 文件读取 ==================== */

  async function handleFiles(fileList) {
    const list = Array.from(fileList);
    if (busy) { toast('正在解析，请稍候'); return; }
    busy = true;
    for (const file of list) {
      const rec = { name: file.name, status: '解析中…', cls: '' };
      files.push(rec);
      render($('#view'));
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('文件超过 25MB，请拆分后再试');
        const text = await extractText(file);
        const items = parseQuestions(text);
        if (!items.length) throw new Error('未识别出题目，请检查排版或使用“粘贴文本”');
        items.forEach(it => { it.source = file.name; });
        parsed = parsed.concat(items);
        rec.status = `解析出 ${items.length} 题`;
        rec.cls = 'ok';
      } catch (err) {
        rec.status = err.message || '解析失败';
        rec.cls = 'bad';
      }
      render($('#view'));
    }
    busy = false;
  }

  async function extractText(file) {
    const name = file.name.toLowerCase();
    if (/\.(txt|md|markdown)$/.test(name)) {
      return await file.text();
    }
    if (/\.docx$/.test(name)) {
      await loadScript(CDN.mammoth);
      if (!window.mammoth) throw new Error('Word 解析库加载失败，请检查网络后重试');
      const buf = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
      return result.value || '';
    }
    if (/\.pdf$/.test(name)) {
      await loadScript(CDN.pdf);
      const pdfjsLib = window.pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF 解析库加载失败，请检查网络后重试');
      pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
      const data = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data }).promise;
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        let line = '';
        let lastY = null;
        const lines = [];
        content.items.forEach(item => {
          const y = item.transform ? item.transform[5] : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
            lines.push(line);
            line = '';
          }
          line += item.str;
          if (item.hasEOL) { lines.push(line); line = ''; }
          if (y !== null) lastY = y;
        });
        if (line) lines.push(line);
        pages.push(lines.join('\n'));
      }
      const text = pages.join('\n\n');
      const density = text.replace(/\s/g, '').length / Math.max(1, doc.numPages);
      if (density < 20) throw new Error('未提取到有效文字，可能是扫描版 PDF（图片型），请先 OCR 或换用文字版文件');
      return text;
    }
    if (/\.doc$/.test(name)) throw new Error('旧版 .doc 无法直接解析，请用 Word 另存为 .docx 后重试');
    throw new Error('不支持的文件类型');
  }

  /* ==================== 文本解析 ==================== */

  function normalizeText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/　/g, ' ')
      .replace(/[Ａ-Ｆ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[．。]/g, m => m === '．' ? '.' : m)
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseQuestions(text) {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    const lines = normalized.split('\n');
    const blocks = [];
    let cur = null;

    const startRe = /^\s*(?:第\s*)?(\d{1,3})\s*[.、．)）]\s*(?!\d)/;
    for (const line of lines) {
      const m = line.match(startRe);
      if (m) {
        cur = { num: Number(m[1]), lines: [line.trim()] };
        blocks.push(cur);
      } else if (cur) {
        cur.lines.push(line);
      }
    }

    const answerMap = buildAnswerMap(normalized);
    const items = [];

    blocks.forEach(block => {
      const item = parseBlock(block);
      if (!item) return;
      if (item.answer === null && answerMap[item.num] !== undefined) {
        const idx = LETTERS.indexOf(answerMap[item.num]);
        if (idx >= 0 && idx < item.options.length) item.answer = idx;
      }
      item.include = item.options.length >= 2 && item.answer !== null;
      items.push(item);
    });

    return items;
  }

  function buildAnswerMap(text) {
    const map = {};
    let m;
    const rangeRe = /(\d{1,3})\s*[-—~至]\s*(\d{1,3})\s*[：:.]?\s*([A-F]{2,})\b/g;
    while ((m = rangeRe.exec(text)) !== null) {
      const start = Number(m[1]);
      const letters = m[3];
      for (let i = 0; i < letters.length; i++) {
        const num = start + i;
        if (num <= Number(m[2]) && map[num] === undefined) map[num] = letters[i];
      }
    }
    const singleRe = /(?:^|\n)\s*(\d{1,3})\s*[.、:：]\s*([A-F])\s*(?=\n|$|[,，;；])/g;
    while ((m = singleRe.exec(text)) !== null) {
      const num = Number(m[1]);
      if (map[num] === undefined) map[num] = m[2];
    }
    return map;
  }

  function parseBlock(block) {
    let text = block.lines.join('\n').trim();
    text = text.replace(/^\s*(?:第\s*)?\d{1,3}\s*[.、．)）:：]?\s*/, '');

    let answerLetter = null;
    const ansMatch = text.match(/(?:【答案】|参考答案|正确答案|答案)\s*[：:.]?\s*([A-F]+)/);
    if (ansMatch) {
      answerLetter = ansMatch[1].charAt(0);
      text = text.replace(ansMatch[0], '\n');
    }

    let explain = '';
    const expMatch = text.match(/(?:【解析】|答案解析|试题解析|解析)\s*[：:.]?\s*([\s\S]*)$/);
    if (expMatch) {
      explain = expMatch[1].trim();
      text = text.slice(0, expMatch.index);
    }

    const markerRe = /(?:^|\n|\s)([A-F])\s*[.、．)）:：]\s*/g;
    let mm;
    const marks = [];
    while ((mm = markerRe.exec(text)) !== null) {
      marks.push({ letter: mm[1], start: mm.index + mm[0].indexOf(mm[1]), end: mm.index + mm[0].length });
    }

    const accepted = [];
    let expected = 0;
    marks.forEach(mark => {
      if (mark.letter.charCodeAt(0) - 65 === expected) {
        accepted.push(mark);
        expected += 1;
      }
    });

    if (accepted.length < 2) {
      return {
        uid: nextUid(),
        num: block.num,
        stem: text.trim(),
        options: [],
        answer: null,
        explain: explain,
        module: classify(text),
        autoModule: true,
        autoGuess: null,
        include: false,
        source: ''
      };
    }

    const stem = text.slice(0, accepted[0].start).trim().replace(/[：:]\s*$/, '');
    const options = accepted.map((mark, i) => {
      const end = i + 1 < accepted.length ? accepted[i + 1].start : text.length;
      return text.slice(mark.end, end).replace(/\s+/g, ' ').trim();
    }).filter(Boolean);

    const guess = classify(stem + ' ' + options.join(' '));
    let answer = null;
    if (answerLetter) {
      const idx = LETTERS.indexOf(answerLetter);
      if (idx >= 0 && idx < options.length) answer = idx;
    }

    return {
      uid: nextUid(),
      num: block.num,
      stem: stem,
      options: options,
      answer: answer,
      explain: explain,
      module: guess,
      autoModule: true,
      autoGuess: guess,
      include: options.length >= 2 && answer !== null,
      source: ''
    };
  }

  function classify(text) {
    const t = String(text || '');
    const rules = [
      { id: 'ziliao', words: ['同比', '环比', '增长率', '增长', '比重', '占比', '百分点', '亿元', '表格', '数据', '平均'] },
      { id: 'shuliang', words: ['工程', '速度', '利润', '浓度', '概率', '排列', '多少种', '年龄', '小时', '天数', '数列', '计算', '相遇'] },
      { id: 'panduan', words: ['定义', '最能削弱', '加强', '推出', '类比', '关系最为相似', '前提', '假设', '命题', '逻辑'] },
      { id: 'yanyu', words: ['填入', '依次填入', '成语', '文段', '主旨', '意在说明', '语序', '排序', '横线', '主要说明', '接下来'] },
      { id: 'changshi', words: ['下列', '说法', '正确', '错误', '宪法', '历史', '科技', '法律', '地理', '属于'] }
    ];
    let best = null;
    let bestScore = 0;
    rules.forEach(rule => {
      let score = 0;
      rule.words.forEach(w => {
        const matches = t.split(w).length - 1;
        score += matches;
      });
      if (score > bestScore) { bestScore = score; best = rule.id; }
    });
    return best || 'changshi';
  }

  /* ==================== 导入预览 ==================== */

  function renderPreview() {
    const ready = parsed.filter(p => p.include && p.options.length >= 2 && p.answer !== null).length;
    const noAnswer = parsed.filter(p => p.options.length >= 2 && p.answer === null).length;
    const noOptions = parsed.filter(p => p.options.length < 2).length;

    const moduleOptions = MODULES.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

    const items = parsed.map(item => {
      const status = item.options.length < 2
        ? '<span class="chip bad">缺选项</span>'
        : item.answer === null
          ? '<span class="chip warn">缺答案</span>'
          : '<span class="chip ok">可导入</span>';
      const answerOptions = ['<option value="">未识别</option>'].concat(
        item.options.map((_, i) => `<option value="${i}" ${item.answer === i ? 'selected' : ''}>${LETTERS[i]}</option>`)
      ).join('');
      const moduleOpts = MODULES.map(m => `<option value="${m.id}" ${item.module === m.id ? 'selected' : ''}>${esc(m.short)}</option>`).join('');

      return `
        <div class="imp-item ${item.include ? '' : 'off'}" data-uid="${item.uid}">
          <div class="imp-top">
            <input type="checkbox" data-include ${item.include ? 'checked' : ''} aria-label="导入此题">
            <div class="imp-stem">
              <b>${item.num ? item.num + '．' : ''}${esc(item.stem).slice(0, 110)}${item.stem.length > 110 ? '…' : ''}</b>
              <div class="opts-preview">${item.options.map((o, i) => `${LETTERS[i]}. ${esc(o).slice(0, 24)}`).join('　') || '（未识别到选项）'}</div>
              ${item.explain ? `<div class="opts-preview">解析：${esc(item.explain).slice(0, 60)}${item.explain.length > 60 ? '…' : ''}</div>` : ''}
            </div>
            ${status}
          </div>
          <div class="imp-meta">
            <label>模块 <select class="select input-sm" data-module>${moduleOpts}</select></label>
            <label>答案 <select class="select input-sm" data-answer>${answerOptions}</select></label>
            ${item.source ? `<span class="small muted">来源：${esc(item.source)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="rule-double"></div>
      <div class="spread">
        <h2 style="font-size:19px">解析结果</h2>
        <label class="small muted">默认模块
          <select class="select input-sm" id="default-module">
            <option value="auto" ${defaultModule === 'auto' ? 'selected' : ''}>自动识别</option>
            ${moduleOptions.replace(new RegExp(`value="${defaultModule}"`), `value="${defaultModule}" selected`)}
          </select>
        </label>
      </div>
      <div class="import-stats">
        <span><b>${parsed.length}</b>识别题目</span>
        <span><b>${ready}</b>可导入</span>
        <span><b>${noAnswer}</b>缺答案</span>
        <span><b>${noOptions}</b>缺选项</span>
      </div>
      <div class="flex-col">${items}</div>
      <div class="row-end mt-16">
        <button class="btn btn-ghost" type="button" id="clear-parsed">清空解析结果</button>
        <button class="btn btn-primary" type="button" id="do-import" ${ready ? '' : 'disabled'}>导入选中的 ${ready} 道题</button>
      </div>`;
  }

  function bindPreview(view) {
    const dm = $('#default-module', view);
    if (dm) dm.addEventListener('change', () => {
      defaultModule = dm.value;
      parsed.forEach(item => {
        if (item.autoModule) {
          item.module = defaultModule === 'auto' ? (item.autoGuess || 'changshi') : defaultModule;
        }
      });
      render(view);
    });

    $$('[data-include]', view).forEach(cb => cb.addEventListener('change', () => {
      const item = parsed.find(p => p.uid === cb.closest('[data-uid]').dataset.uid);
      if (!item) return;
      item.include = cb.checked;
      render(view);
    }));

    $$('[data-module]', view).forEach(sel => sel.addEventListener('change', () => {
      const item = parsed.find(p => p.uid === sel.closest('[data-uid]').dataset.uid);
      if (!item) return;
      item.module = sel.value;
      item.autoModule = false;
      render(view);
    }));

    $$('[data-answer]', view).forEach(sel => sel.addEventListener('change', () => {
      const item = parsed.find(p => p.uid === sel.closest('[data-uid]').dataset.uid);
      if (!item) return;
      item.answer = sel.value === '' ? null : Number(sel.value);
      item.include = item.options.length >= 2 && item.answer !== null;
      render(view);
    }));

    const clear = $('#clear-parsed', view);
    if (clear) clear.addEventListener('click', () => {
      parsed = [];
      files = [];
      render(view);
    });

    const imp = $('#do-import', view);
    if (imp) imp.addEventListener('click', () => {
      const ready = parsed.filter(p => p.include && p.options.length >= 2 && p.answer !== null);
      if (!ready.length) { toast('没有可导入的题目'); return; }
      const payload = ready.map((p, i) => ({
        id: 'u' + Date.now() + '_' + i,
        module: p.module,
        stem: p.stem || '（未识别题干）',
        options: p.options.slice(0, 6),
        answer: p.answer,
        explain: p.explain || '（导入题目，暂无解析）',
        tag: '导入'
      }));
      Store.addQuestions(payload);
      const skipped = parsed.length - ready.length;
      parsed = [];
      files = [];
      render(view);
      toast(`已导入 ${payload.length} 题${skipped ? `，跳过 ${skipped} 题` : ''}，可到“行测刷题”中练习`);
    });
  }

  /* ==================== AI 出题 ==================== */

  function renderAITab() {
    const ai = Store.get().settings.ai || {};
    const aiReady = AI.hasKey(ai);
    const countOptions = [3, 5, 10].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} 题</option>`).join('');
    const moduleOptions = ['<option value="auto">自动分配</option>'].concat(
      MODULES.map(m => `<option value="${m.id}">${esc(m.name)}</option>`)
    ).join('');

    return `
      <div class="note-banner ${aiReady ? '' : 'warn'}">
        <b>${aiReady ? 'AI 已就绪' : '尚未配置大模型'}</b>
        ${aiReady
          ? `当前接口：${esc((ai.baseUrl || '').replace(/^https?:\/\//, ''))} · 模型 ${esc(ai.model || '')}。API Key 只保存在本机浏览器。`
          : '请在<a class="link" href="#/settings">设置</a>中填写你自己的 API Key（支持 DeepSeek 等 OpenAI 兼容接口）；Key 只保存在本机浏览器。'}
      </div>

      <div class="card mt-16">
        <div class="field">
          <label for="ai-material">学习材料</label>
          <textarea class="textarea" id="ai-material" rows="8" placeholder="粘贴教材、讲义、时政材料等文本；也可以从文件填充。材料越长，出题越有依据。">${esc(aiMaterial)}</textarea>
          <p class="desc">最多读取前 12000 字。建议使用可读性好的文字材料，PDF 请先在“文件解析”上传并复制整理后的文字。</p>
        </div>
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <label class="small muted">题量
              <select class="select input-sm" id="ai-count">${countOptions}</select>
            </label>
            <label class="small muted">模块
              <select class="select input-sm" id="ai-module">${moduleOptions}</select>
            </label>
            <label class="btn btn-ghost btn-sm" for="ai-file">从文件填充材料<input type="file" id="ai-file" accept=".pdf,.docx,.txt,.md" hidden></label>
          </div>
          <div class="row">
            <button class="btn btn-outline btn-sm" type="button" id="copy-prompt">复制提示词</button>
            <button class="btn btn-primary" type="button" id="ai-generate" ${aiBusy || !aiReady ? 'disabled' : ''}>${aiBusy ? '生成中…（最长 90 秒）' : '生成题目'}</button>
          </div>
        </div>
      </div>

      ${aiError ? `<div class="note-banner warn mt-16"><b>调用失败</b>　${esc(aiError)}</div>` : ''}

      <details class="disclosure mt-16" ${aiError ? 'open' : ''}>
        <summary>浏览器直连失败？用“提示词 + 粘贴 JSON”方式（通用兜底）</summary>
        <p class="small muted" style="margin:8px 0">点击“复制提示词”，粘贴到任意大模型对话中；把回答里的 JSON 数组粘贴到下方，即可解析导入。此方式不受跨域限制。</p>
        <textarea class="textarea" id="ai-json" rows="6" placeholder='粘贴形如 [{"module":"常识判断","stem":"……","options":["……"],"answer":0,"explain":"……"}] 的 JSON'>${esc(aiJsonText)}</textarea>
        <div class="row-end mt-8"><button class="btn btn-outline btn-sm" type="button" id="parse-ai-json">解析 JSON 并预览</button></div>
      </details>

      <div class="note-banner mt-16">
        <b>提醒</b>　AI 生成的题目可能存在事实错误或答案偏差，导入前请务必逐题校对。生成内容仅保存在本机。
      </div>

      ${parsed.length ? renderPreview() : ''}`;
  }

  function bindAITab(view) {
    const ta = $('#ai-material', view);
    if (ta) ta.addEventListener('input', () => { aiMaterial = ta.value; });

    const jsonTa = $('#ai-json', view);
    if (jsonTa) jsonTa.addEventListener('input', () => { aiJsonText = jsonTa.value; });

    const fileInput = $('#ai-file', view);
    if (fileInput) fileInput.addEventListener('change', async () => {
      if (!fileInput.files.length) return;
      const file = fileInput.files[0];
      toast('正在读取文件…');
      try {
        const text = await extractText(file);
        aiMaterial = (aiMaterial ? aiMaterial + '\n\n' : '') + text;
        if (ta) ta.value = aiMaterial;
        toast('已填入材料，共 ' + countChars(text) + ' 字');
      } catch (err) {
        toast(err.message);
      }
      fileInput.value = '';
    });

    const copyBtn = $('#copy-prompt', view);
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      const prompt = buildAIPrompt();
      if (!prompt) return;
      aiPromptCache = prompt;
      try {
        await copyText(prompt);
        toast('提示词已复制，可粘贴到任意大模型对话中');
      } catch (err) {
        toast('复制失败，请手动选择文本复制');
      }
    });

    const genBtn = $('#ai-generate', view);
    if (genBtn) genBtn.addEventListener('click', generateWithAI);

    const parseBtn = $('#parse-ai-json', view);
    if (parseBtn) parseBtn.addEventListener('click', () => {
      const text = (jsonTa && jsonTa.value) || aiJsonText;
      if (!text.trim()) { toast('请先粘贴 JSON'); return; }
      try {
        const items = parseAIJson(text);
        if (!items.length) throw new Error('没有解析出题目');
        items.forEach(it => { it.source = 'AI 生成'; });
        parsed = parsed.concat(items);
        tab = 'file';
        render(view);
        toast(`解析出 ${items.length} 道题，请校对后导入`);
      } catch (err) {
        toast('JSON 解析失败：' + err.message);
      }
    });

    bindPreview(view);
  }

  function buildAIPrompt() {
    const material = aiMaterial.trim();
    if (material.length < 30) { toast('材料太短，至少需要 30 字'); return ''; }
    const countSel = $('#ai-count');
    const moduleSel = $('#ai-module');
    const count = countSel ? countSel.value : '5';
    const moduleId = moduleSel ? moduleSel.value : 'auto';
    const moduleName = moduleId === 'auto' ? '' : Bank.moduleName(moduleId);

    const trimmed = material.slice(0, 12000);
    return [
      '你是一名公务员考试行测命题专家。请根据下面的材料，命制 ' + count + ' 道单项选择题。',
      '要求：',
      '1. 题目紧扣材料，考查理解、分析或计算能力，不要出材料之外的记忆题；',
      '2. 每题 4 个选项，只有一个正确答案，干扰项要有迷惑性但不能有歧义；',
      '3. 输出严格为 JSON 数组，不要输出任何解释文字、不要使用 markdown 代码块；',
      '4. 字段格式如下：',
      '[{"module":"常识判断","stem":"题干","options":["A选项内容","B选项内容","C选项内容","D选项内容"],"answer":0,"explain":"解析"}]',
      '5. module 只能取：常识判断、言语理解与表达、数量关系、判断推理、资料分析；answer 为正确选项下标（0-3）。',
      moduleName ? '6. 所有题目的 module 字段统一填写“' + moduleName + '”。' : '',
      '材料如下：',
      '"""',
      trimmed,
      '"""'
    ].filter(Boolean).join('\n');
  }

  async function generateWithAI() {
    const ai = Store.get().settings.ai || {};
    if (!AI.hasKey(ai)) { toast(AI.MISSING_KEY); return; }
    const prompt = buildAIPrompt();
    if (!prompt) return;
    aiPromptCache = prompt;
    aiError = '';
    aiBusy = true;
    render($('#view'));

    try {
      const content = await callChatAPI(ai, prompt);
      const items = parseAIJson(content);
      if (!items.length) throw new Error('AI 返回内容中没有识别到题目');
      items.forEach(it => { it.source = 'AI 生成'; });
      parsed = parsed.concat(items);
      tab = 'file';
      aiBusy = false;
      render($('#view'));
      toast(`AI 生成了 ${items.length} 道题，请校对后导入`);
    } catch (err) {
      aiBusy = false;
      aiError = err.message || String(err);
      render($('#view'));
    }
  }

  async function callChatAPI(ai, prompt) {
    return AI.chat(ai, prompt, {
      system: '你是一名严谨的公务员考试命题专家，只输出 JSON。'
    });
  }

  function parseAIJson(content) {
    let text = String(content || '').trim();
    text = text.replace(/```(?:json)?/gi, '');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('未找到 JSON 数组');
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) throw new Error('JSON 不是数组');

    const items = [];
    arr.forEach((o, i) => {
      if (!o || typeof o !== 'object') return;
      const stem = String(o.stem || o.question || '').trim();
      if (!stem) return;
      let options = [];
      if (Array.isArray(o.options)) options = o.options.map(x => String(x).trim()).filter(Boolean);
      else if (o.options && typeof o.options === 'object') {
        options = ['A', 'B', 'C', 'D'].map(k => o.options[k]).filter(x => x != null).map(x => String(x).trim());
      }
      if (options.length < 2) return;

      let answer = o.answer;
      if (typeof answer === 'string') {
        const a = answer.trim().toUpperCase();
        if (/^[A-F]$/.test(a)) answer = a.charCodeAt(0) - 65;
        else answer = parseInt(a, 10);
      }
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) answer = null;

      const moduleName = String(o.module || '');
      const found = MODULES.find(m => m.name === moduleName || m.short === moduleName || m.id === moduleName);
      const guess = classify(stem + ' ' + options.join(' '));

      items.push({
        uid: nextUid(),
        num: i + 1,
        stem,
        options,
        answer,
        explain: String(o.explain || o.analysis || '').trim(),
        module: found ? found.id : guess,
        autoModule: !found,
        autoGuess: guess,
        include: answer !== null,
        source: 'AI 生成'
      });
    });
    return items;
  }

  /* ==================== 我的题库 ==================== */

  function renderManageTab() {
    const custom = Store.get().customQuestions;
    const rows = custom.length ? custom.map((q, i) => `
      <div class="imp-item">
        <div class="imp-top">
          <div class="imp-stem">
            <b>${i + 1}. ${esc(stripHtml(q.stem)).slice(0, 100)}${stripHtml(q.stem).length > 100 ? '…' : ''}</b>
            <div class="opts-preview">${esc(Bank.moduleName(q.module))} · 答案 ${['A', 'B', 'C', 'D', 'E', 'F'][q.answer] || '—'}</div>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-del="${esc(q.id)}">删除</button>
        </div>
      </div>`).join('') : `
      <div class="empty">
        <b>还没有导入自定义题目</b>
        内置示例题已包含五个模块共 ${QUESTION_BANK.questions.length} 题，导入的题目会显示在这里。
      </div>`;

    return `
      <div class="spread mb-16">
        <div class="row">
          <span class="chip primary">导入题目 ${custom.length} 道</span>
          <span class="chip">内置示例 ${QUESTION_BANK.questions.length} 道</span>
        </div>
        <div class="row">
          <button class="btn btn-outline btn-sm" type="button" id="export-custom" ${custom.length ? '' : 'disabled'}>导出题库 JSON</button>
          <button class="btn btn-ghost btn-sm" type="button" id="clear-custom" ${custom.length ? '' : 'disabled'}>清空全部导入题目</button>
        </div>
      </div>
      <div class="card mb-16">
        <h2 style="font-size:16px;margin-bottom:8px">从链接更新题库</h2>
        <p class="small muted" style="margin-bottom:10px">填入一个返回 JSON 题库的网址（如 GitHub Raw、Gist、自己的服务器）。支持数组或 {"questions":[...]}，字段：module、stem、options、answer（下标或 A/B/C/D）、explain。新题会按题干去重后合并到“我的题库”，可反复更新。</p>
        <div class="row">
          <input class="input" id="remote-url" type="text" placeholder="https://raw.githubusercontent.com/.../questions.json" style="flex:1;min-width:220px">
          <button class="btn btn-outline" type="button" id="remote-fetch">获取并导入</button>
        </div>
        <p class="small muted" id="remote-status" style="margin-top:8px">目标地址需要允许跨域访问（GitHub Raw、Gist、自己的静态服务器均可）。</p>
      </div>
      <div class="flex-col">${rows}</div>
      <div class="note-banner mt-24">
        <b>说明</b>　删除导入题目会同时移除它的错题记录；内置示例题不能删除。导入的题目会参与刷题和模拟考试，模拟卷题量与时长会随题库自动调整。
      </div>`;
  }

  function bindManageTab(view) {
    $$('[data-del]', view).forEach(btn => btn.addEventListener('click', async () => {      const q = Bank.byId(btn.dataset.del);
      const ok = await confirmDialog({
        title: '删除题目',
        text: `确定删除这道导入题目吗？${q ? '「' + stripHtml(q.stem).slice(0, 40) + '…」' : ''}相关错题记录也会一并删除。`,
        okText: '删除'
      });
      if (!ok) return;
      Store.removeQuestion(btn.dataset.del);
      toast('已删除');
      render(view);
    }));

    const exportBtn = $('#export-custom', view);
    if (exportBtn) exportBtn.addEventListener('click', () => {
      const custom = Store.get().customQuestions;
      downloadFile(`朱批书房-导入题库-${todayStr()}.json`, JSON.stringify({ app: 'zhubi-study-questions', questions: custom }, null, 2));
    });

    const clearBtn = $('#clear-custom', view);
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      const n = Store.get().customQuestions.length;
      const ok = await confirmDialog({
        title: '清空导入题目',
        text: `将删除全部 ${n} 道导入题目及其错题记录，内置示例题不受影响。此操作无法撤销，建议先导出备份。`,
        okText: '全部删除'
      });
      if (!ok) return;
      Store.get().customQuestions.slice().forEach(q => Store.removeQuestion(q.id));
      toast('已清空导入题目');
      render(view);
    });

    const fetchBtn = $('#remote-fetch', view);
    if (fetchBtn) fetchBtn.addEventListener('click', async () => {
      const urlInput = $('#remote-url', view);
      const status = $('#remote-status', view);
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) { toast('请先填写题库链接'); return; }
      if (!/^https?:\/\//i.test(url)) { toast('链接需要以 http:// 或 https:// 开头'); return; }

      fetchBtn.disabled = true;
      if (status) status.textContent = '正在获取…';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data && Array.isArray(data.questions) ? data.questions : null);
        if (!rawList) throw new Error('JSON 中没有找到题目数组');

        const existing = new Set(Bank.all().map(q => stemKey(q.stem)));
        const seen = new Set();
        const list = [];
        rawList.forEach((o, i) => {
          const q = normalizeRemoteQuestion(o, i);
          if (!q) return;
          const key = stemKey(q.stem);
          if (!key || existing.has(key) || seen.has(key)) return;
          seen.add(key);
          list.push(q);
        });

        if (!list.length) {
          if (status) status.textContent = '没有可导入的新题目（可能已存在或格式不符）。';
          toast('没有发现新题目');
          return;
        }

        Store.addQuestions(list);
        toast('已从链接导入 ' + list.length + ' 题');
        render(view);
      } catch (err) {
        const msg = err.name === 'AbortError' ? '请求超时' : err.message;
        if (status) status.textContent = '导入失败：' + msg + '（请检查链接是否允许跨域）';
        toast('导入失败');
      } finally {
        clearTimeout(timer);
        fetchBtn.disabled = false;
      }
    });
  }

  function stemKey(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\s，。、；：""''（）()【】\[\]<>《》·,.;:!?！？\-—_]/g, '')
      .slice(0, 200);
  }

  function normalizeRemoteQuestion(o, index) {
    if (!o || typeof o !== 'object') return null;
    const stem = String(o.stem || o.question || '').trim();
    if (!stem) return null;

    let options = [];
    if (Array.isArray(o.options)) {
      options = o.options.map(x => String(x).trim()).filter(Boolean);
    } else if (o.options && typeof o.options === 'object') {
      options = ['A', 'B', 'C', 'D'].map(k => o.options[k]).filter(x => x != null).map(x => String(x).trim());
    }
    if (options.length < 2) return null;

    let answer = o.answer;
    if (typeof answer === 'string') {
      const a = answer.trim().toUpperCase();
      answer = /^[A-F]$/.test(a) ? a.charCodeAt(0) - 65 : parseInt(a, 10);
    }
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;

    const moduleRaw = String(o.module || '');
    const found = MODULES.find(m => m.name === moduleRaw || m.short === moduleRaw || m.id === moduleRaw);
    const guess = classify(stem + ' ' + options.join(' '));

    return {
      id: 'r' + Date.now() + '_' + index,
      module: found ? found.id : guess,
      stem: stem.slice(0, 2000),
      options: options.slice(0, 6),
      answer: answer,
      explain: String(o.explain || o.analysis || '（导入题目，暂无解析）').slice(0, 2000),
      tag: '链接导入'
    };
  }

  return { render };
})();
