/* 朱批书房 · AI 问答助手
 * 独立模块：自己实现多轮对话与流式输出，不改动 js/ai.js
 * （ai.js 的 chat() 是单轮 + 非流式，聊天场景体验太差，故在此另写一套）
 *
 * 与题库的双向结合：
 *   A（题目 → AI）：刷题页 / 错题本点「问 AI 讲解」，自动打包题干上下文来提问
 *   B（AI → 题目）：每轮回答结束后，按内容匹配题库里的相关题目，点击即可跳转去练
 *
 * 依赖全局变量：AI_SHARED_KEY / AI_DEFAULT / aiEffectiveKey / Store / Bank / $ / $$ / esc / toast */
'use strict';

const AiChat = (() => {
  const LS_KEY = 'zhubi_ai_chat_v1';

  /* 护栏：额度虽免费，但响应慢、本地也有容量上限，仍需设闸 */
  const MAX_ROUNDS = 12;     // 送进模型的上下文只保留最近 12 轮（24 条消息）
  const MAX_INPUT = 2000;    // 单次输入字数上限
  const MAX_SESSIONS = 20;   // 会话数量上限
  const MAX_MSGS = 100;      // 单个会话消息条数上限

  const FIRST_TOKEN_TIMEOUT = 60000;  // 等待首个字的耐心
  const IDLE_TIMEOUT = 45000;         // 流式过程中两段数据之间的最大静默

  /* 角色预设：给模型一个稳定的人设，答案风格才不会飘 */
  const ROLES = [
    {
      id: 'general',
      name: '公考通才',
      system: '你是一名资深公务员考试辅导专家，熟悉国考与各地省考的考情、题型与评分标准。' +
      '回答要准确、实用、条理清晰，优先给出可直接照做的方法。'
    },
    {
      id: 'xince',
      name: '行测答疑',
      system: '你是行测名师，擅长言语理解、数量关系、判断推理、资料分析和常识判断。' +
      '讲解题目时必须先说清思路与考点，再给答案，并点出常见陷阱和提速技巧。'
    },
    {
      id: 'shenlun',
      name: '申论指导',
      system: '你是申论阅卷与教学专家。指导写作时，要讲清立意、结构、要点覆盖与语言表达，' +
      '必要时给出可直接参考的框架或示范段落，并指出得分点与失分风险。'
    },
    {
      id: 'shizheng',
      name: '时政解读',
      system: '你是时政与政策解读专家。解读热点时要交代背景、核心表述与政策导向，' +
      '并说明它在行测常识或申论中可能的考查角度。'
    },
    {
      id: 'interview',
      name: '面试模拟',
      system: '你是公务员面试考官。先按结构化面试的常见题型与考生交流，' +
      '回答后要点评其逻辑、立场、表达与政策素养，并给出改进版本。'
    }
  ];

  const SUGGESTIONS = [
    '行测资料分析老是做不完，有什么提速方法？',
    '申论大作文怎么立意才不跑题？',
    '帮我解释一下「基层治理」这个热点怎么考',
    '数量关系基础差，应该放弃还是突击？'
  ];

  let sessions = [];
  let activeId = '';
  let streaming = false;
  let abortCtl = null;
  let errorMsg = '';
  let sideOpen = false;
  let pendingAsk = '';      // 从题目页带过来的待提问 id
  let recommends = [];      // 本轮回答推荐的相关题目

  /* ---------- 持久化（独立 key，不进 Store / 不云同步） ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.sessions)) {
        sessions = data.sessions.filter(s => s && Array.isArray(s.messages));
        /* 生成途中刷新会留下空的占位回答，读档时清掉 */
        sessions.forEach(s => {
          s.messages = s.messages.filter(m => !(m.pending && !String(m.content || '').trim()));
        });
        activeId = data.activeId || (sessions[0] && sessions[0].id) || '';
      }
    } catch (err) {
      console.warn('读取对话记录失败', err);
    }
  }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ sessions: sessions, activeId: activeId }));
    } catch (err) {
      /* 配额写满时，先砍掉最旧的会话再试一次 */
      if (sessions.length > 1) {
        sessions = sessions.slice(-1);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ sessions: sessions, activeId: sessions[0].id }));
          activeId = sessions[0].id;
          toast('本地空间不足，已清理旧对话');
      } catch (e2) { /* 放弃 */ }
      }
    }
  }

  /* ---------- 会话操作 ---------- */

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function activeSession() {
    return sessions.find(s => s.id === activeId) || null;
  }

  function createSession(role) {
    const now = Date.now();
    const s = {
      id: newId(),
      title: '新对话',
      role: role || 'general',
      messages: [],
      recs: [],
      createdAt: now,
      updatedAt: now
    };
    sessions.unshift(s);
    if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
    activeId = s.id;
    save();
    return s;
  }

  function ensureSession() {
    let s = activeSession();
    if (!s) s = createSession('general');
    return s;
  }

  function removeSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    if (activeId === id) activeId = sessions[0] ? sessions[0].id : '';
    save();
  }

  function roleById(id) {
    return ROLES.find(r => r.id === id) || ROLES[0];
  }

  /* ---------- 接口配置（复用既有的共享额度逻辑） ---------- */

  function currentAI() {
    const st = Store.get();
    return (st.settings && st.settings.ai) || {};
  }

  function resolveKey(ai) {
    if (typeof aiEffectiveKey === 'function') {
      const v = aiEffectiveKey(ai.apiKey || ai.key || '');
      if (v) return String(v).trim();
    }
    return String(ai.apiKey || ai.key || '').trim();
  }

  function normalizeBase(url) {
    let u = String(url || '').trim().replace(/\/+$/, '');
    if (!u) u = (typeof AI_DEFAULT !== 'undefined' ? AI_DEFAULT.baseUrl : '');
    if (!u) return '';
    if (!/\/v\d+$/.test(u)) u += '/v1';
    return u;
  }

  /* 把最近若干轮对话拼成请求体；第一条必须是 system。
   * 关键：必须剔除正在生成的那条占位回答（pending），否则模型会以为自己已经
   * 答过一轮空内容，接着续写，输出就变成了乱码。 */
  function buildMessages(session) {
    const sys = roleById(session.role).system;
    const done = session.messages.filter(m => !m.pending);
    const tail = done.slice(-MAX_ROUNDS * 2);
    return [{ role: 'system', content: sys + '请用简体中文回答。不确定的信息要说明，不要编造。' }]
      .concat(tail.map(m => ({ role: m.role, content: m.content })));
  }

  /* ---------- 流式请求 ---------- */

  /* 逐段读取 SSE；每收到一段就回调，调用方直接增量渲染。
   * 两段超时逻辑：等首字节耐心长一些，流开始后只看有无静默。 */
  async function streamChat(ai, messages, onDelta) {
    const key = resolveKey(ai);
    if (!key) throw new Error('还没有可用的 API Key。请到「设置 → AI 出题接口」填写自己的 Key。');
    const base = normalizeBase(ai.baseUrl);
    if (!base) throw new Error('接口地址为空，请先到设置里填写。');

    abortCtl = new AbortController();
    let timer = null;

    function arm(ms, reason) {
      clearTimeout(timer);
      timer = setTimeout(() => abortCtl.abort(new Error(reason)), ms);
    }
    function disarm() { clearTimeout(timer); timer = null; }

    let res;
    try {
      arm(FIRST_TOKEN_TIMEOUT, 'TIMEOUT_FIRST');
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: ai.model || (typeof AI_DEFAULT !== 'undefined' ? AI_DEFAULT.model : 'deepseek-chat'),
          messages: messages,
          temperature: 0.6,
          stream: true
        }),
        signal: abortCtl.signal
      });
    } catch (err) {
      disarm();
      if (err && err.message === 'TIMEOUT_FIRST') throw new Error('模型响应超时（1 分钟没吐出第一个字），请稍后重试。');
      if (err && err.name === 'AbortError') throw new Error('已停止生成。');
      throw new Error('网络请求失败：可能是跨域（CORS）限制或地址有误。');
    }

    if (!res.ok) {
      disarm();
      throw new Error(explainChatError(res.status, await res.text(), ai.model));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';

    try {
      arm(IDLE_TIMEOUT, 'TIMEOUT_IDLE');
      while (true) {
        const rd = await reader.read();
        if (rd.done) break;
        buf += decoder.decode(rd.value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t || t.indexOf('data:') !== 0) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const ch = j.choices && j.choices[0];
            const delta = ch && ch.delta;
            if (delta && typeof delta.content === 'string' && delta.content) {
              onDelta(delta.content);
              arm(IDLE_TIMEOUT, 'TIMEOUT_IDLE');   // 有数据就重新计时
          }
        } catch (e) { /* 忽略半包与非 JSON 行 */ }
        }
      }
    } catch (err) {
      disarm();
      if (err && err.message === 'TIMEOUT_IDLE') throw new Error('生成过程中连接超时，请重试或缩短问题。');
      if (err && err.name === 'AbortError') throw new Error('已停止生成。');
      throw err;
    }
    disarm();
  }

  /* 把上游错误码翻译成能照着做的话（与 ai.js 的风格保持一致） */
  function explainChatError(status, raw, model) {
    let code = '';
    let msg = '';
    try {
      const j = JSON.parse(raw);
      const e = j.error || j;
      code = String(e.code || '');
      msg = String(e.message || e.msg || '');
    } catch (err) {
      msg = String(raw || '');
    }
    const tail = msg ? '（' + msg.slice(0, 120) + '）' : '';
    if (status === 401) return new Error('接口返回 401：Key 无效或已过期，请到设置里更换。' + tail);
    if (status === 403) {
      if (/model/i.test(code + ' ' + msg)) {
        return new Error('接口返回 403：当前账号无权调用模型「' + model + '」，多半是模型名填错了，请到设置里改选一个。' + tail);
    }
      return new Error('接口返回 403：账号无权访问该服务。' + tail);
    }
    if (status === 429) return new Error('接口返回 429：调用太频繁或额度用尽，请稍后再试。' + tail);
    if (status >= 500) return new Error('接口返回 ' + status + '：模型服务暂时不可用，请稍后重试。' + tail);
    return new Error('接口返回 ' + status + '：' + (msg || raw || '').slice(0, 160));
  }

  /* ---------- 轻量 Markdown 渲染（先转义再替换，避免注入） ---------- */

  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }

  function mdToHtml(text) {
    const src = String(text || '');
    if (!src.trim()) return '';
    const fences = [];
    /* 先把围栏代码块抠出来占位，避免其中的 - # 被当成列表/标题 */
    const stripped = src.replace(/```[\w-]*\n?([\s\S]*?)```/g, (m, code) => {
      fences.push('<pre class="md-pre"><code>' + esc(code.replace(/\n$/, '')) + '</code></pre>');
    return '\u0001' + (fences.length - 1) + '\u0001';
    });
    let out = '';
    let para = [];
    let list = '';

    function flushPara() {
      if (para.length) { out += '<p>' + inline(para.join('\n')) + '</p>'; para = []; }
    }
    function closeList() {
      if (list) { out += '</' + list + '>'; list = ''; }
    }
    function flushAll() { flushPara(); closeList(); }

    for (const raw of stripped.split('\n')) {
      const fence = /^\u0001(\d+)\u0001$/.exec(raw.trim());
      if (fence) { flushAll(); out += fences[Number(fence[1])]; continue; }
      if (/^\s*[-*+]\s+/.test(raw)) {
        flushPara();
        if (list !== 'ul') { closeList(); out += '<ul class="md-list">'; list = 'ul'; }
        out += '<li>' + inline(raw.replace(/^\s*[-*+]\s+/, '')) + '</li>';
        continue;
      }
      if (/^\s*\d+[.、)]\s+/.test(raw)) {
        flushPara();
        if (list !== 'ol') { closeList(); out += '<ol class="md-list">'; list = 'ol'; }
        out += '<li>' + inline(raw.replace(/^\s*\d+[.、)]\s+/, '')) + '</li>';
        continue;
      }
      if (/^\s*#{1,3}\s+/.test(raw)) {
        flushAll();
        out += '<p class="md-h">' + inline(raw.replace(/^\s*#{1,3}\s+/, '')) + '</p>';
        continue;
      }
      if (!raw.trim()) { flushAll(); continue; }
      closeList();
      para.push(raw);
    }
    flushAll();
    return out;
  }

  /* ---------- 题库关联 ---------- */

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  /* A：把一道题打包成一段完整的提问上下文 */
  function buildQuestionPrompt(q, focus) {
    const m = Bank.moduleInfo(q.module);
    const opts = (q.options || []).map((opt, i) => LETTERS[i] + '. ' + stripHtml(String(opt))).join('\n');
    const lines = [
      '【模块】' + m.name,
      '【题目】' + stripHtml(String(q.stem || '')),
      q.material ? '【材料】' + stripHtml(String(q.material)) : '',
      '【选项】\n' + opts,
      '【正确答案】' + (LETTERS[q.answer] || ''),
      q.explain ? '【现有解析】' + stripHtml(String(q.explain)) : ''
    ].filter(Boolean);
    const tail = focus === 'why'
      ? '请重点帮我分析：为什么正确答案是这个，我容易在哪个选项上栽跟头？'
      : '请讲解这道题：先点明考查的考点，再一步步给出推导过程，最后说明容易错在哪。如果上面的现有解析不够充分，请补充。';
    return lines.join('\n') + '\n\n' + tail;
  }

  /* B：关键词切分。中文按 2–3gram，英文数字按整词 */
  const STOP = new Set([
    '的', '了', '是', '在', '我', '有', '和', '就', '不', '也', '很', '都', '要', '会', '能',
    '这', '那', '什么', '怎么', '如何', '为什么', '请', '帮', '给', '一下', '可以', '需要',
    '关于', '请问', '一个', '这个', '那个', '帮我', '谢谢', '应该', '怎么办', '哪些', '多少'
  ]);

  function tokenize(text) {
    const out = [];
    String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, ' ').split(/\s+/).forEach(w => {
      if (!w) return;
      if (/^[a-zA-Z0-9]+$/.test(w)) { if (w.length >= 2) out.push(w.toLowerCase()); return; }
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= w.length; i++) {
          const g = w.slice(i, i + n);
          if (!STOP.has(g)) out.push(g);
        }
      }
    });
    return [...new Set(out)];
  }

  /* B：从问题里猜模块，命中就给对应模块的题加权 */
  const MODULE_KEYS = [
    ['changshi', ['常识', '政治', '法律', '历史', '科技', '地理', '时政']],
    ['yanyu', ['言语', '选词', '填空', '片段', '语句', '成语', '词语', '阅读']],
    ['shuliang', ['数量', '工程', '行程', '利润', '概率', '推理', '排列']],
    ['panduan', ['判断', '定义', '类比', '逻辑', '图形']],
    ['ziliao', ['资料', '增长', '比重', '表格', '图表', '增速']]
  ];

  function guessModule(text) {
    const t = String(text || '');
    let best = null;
    let bestHit = 0;
    MODULE_KEYS.forEach(([id, keys]) => {
      const hit = keys.reduce((n, k) => n + (t.indexOf(k) >= 0 ? 1 : 0), 0);
      if (hit > bestHit) { bestHit = hit; best = id; }
    });
    return best;
  }

  /* B：在题库里找与问题最相关的几道题。
   * 打分 = 命中的词长之和（长词更有区分度）+ 模块命中加权；同分时短题干优先。 */
  function pickRelated(text, limit) {
    const grams = tokenize(text).sort((a, b) => b.length - a.length).slice(0, 40);
    if (!grams.length) return [];
    const mod = guessModule(text);
    const pool = (typeof Bank !== 'undefined' && Bank.all) ? Bank.all() : [];

    const scored = [];
    pool.forEach(q => {
      const hay = (String(q.stem || '') + ' ' + String(q.tag || '')).toLowerCase();
      let s = 0;
      for (const g of grams) {
        if (hay.indexOf(g) >= 0) s += g.length;
      }
      if (!s) return;
      if (mod && q.module === mod) s += 4;
      scored.push({ q: q, s: s, len: hay.length });
    });

    scored.sort((a, b) => (b.s - a.s) || (a.len - b.len));
    const seen = new Set();
    const out = [];
    for (const item of scored) {
      if (out.length >= limit) break;
      const key = stripHtml(String(item.q.stem || '')).slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item.q);
    }
    return out;
  }

  /* B：跳到刷题页并打开指定题目 */
  function gotoQuestion(qid) {
    if (typeof Practice === 'undefined' || !Practice.openQuestion) {
      toast('刷题模块还没准备好，请刷新页面重试');
      return;
    }
    if (!Practice.openQuestion(qid)) return;
    if (location.hash !== '#/practice') location.hash = '#/practice';
    else if (typeof route === 'function') route();
  }

  /* ---------- 发送 ---------- */

  async function send(text) {
    const content = String(text || '').trim();
    if (!content || streaming) return;
    if (content.length > MAX_INPUT) {
      toast('单次输入请控制在 ' + MAX_INPUT + ' 字以内');
      return;
    }

    errorMsg = '';
    recommends = [];
    const s = ensureSession();
    s.messages.push({ role: 'user', content: content, t: Date.now() });
    /* 占位一条空回答，流式过程中往里灌 */
    s.messages.push({ role: 'assistant', content: '', t: Date.now(), pending: true });
    if (s.title === '新对话' || !s.title) s.title = content.slice(0, 20);
    s.updatedAt = Date.now();
    streaming = true;
    save();
    render(lastView);
    scrollToBottom();

    try {
      const ai = currentAI();
      const msgs = buildMessages(s);
      let acc = '';
      await streamChat(ai, msgs, delta => {
        acc += delta;
        paintActive(acc);
      });
      const last = s.messages[s.messages.length - 1];
      last.content = acc || '（模型没有返回内容，请换个问法试试）';
      delete last.pending;
      /* 超出上限就丢掉最早的若干条，控制本地体积 */
      if (s.messages.length > MAX_MSGS) s.messages = s.messages.slice(-MAX_MSGS);
      /* B：回答完成后推荐相关题目，并随会话一起存下来 */
      recommends = pickRelated(content, 3).map(q => ({
      id: q.id, module: q.module, stem: q.stem, tag: q.tag || ''
      }));
      s.recs = recommends;
    } catch (err) {
      const s2 = activeSession();
      if (s2) {
        const last = s2.messages[s2.messages.length - 1];
        if (last && last.role === 'assistant' && last.pending) {
          /* 生成失败就把这条空回答撤掉，避免留下气泡垃圾 */
        s2.messages.pop();
      }
      }
      errorMsg = err && err.message ? err.message : String(err);
    } finally {
      streaming = false;
      abortCtl = null;
      save();
      if (document.body.contains(lastView)) render(lastView);
    }
  }

  function stop() {
    if (abortCtl) abortCtl.abort(new Error('已停止生成。'));
  }

  function regenerate() {
    const s = activeSession();
    if (!s || streaming || s.messages.length < 2) return;
    const lastUser = s.messages[s.messages.length - 2];
    if (!lastUser || lastUser.role !== 'user') return;
    s.messages.pop();
    s.messages.pop();
    save();
    render(lastView);
    send(lastUser.content);
  }

  function clearActive() {
    const s = activeSession();
    if (!s) return;
    s.messages = [];
    s.recs = [];
    s.title = '新对话';
    errorMsg = '';
    recommends = [];
    save();
    render(lastView);
  }

  /* ---------- DOM 增量刷新 ---------- */

  let lastView = null;

  function bubbleEl() {
    if (!lastView) return null;
    const list = lastView.querySelector('#chat-msgs');
    if (!list) return null;
    return list.querySelector('.chat-msg.assistant.pending .md-body');
  }

  function paintActive(acc) {
    const el = bubbleEl();
    if (!el) return;
    el.innerHTML = mdToHtml(acc) + '<span class="caret"></span>';
    scrollToBottom();
  }

  function scrollToBottom() {
    const list = lastView && lastView.querySelector('#chat-msgs');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function stemPreview(q, n) {
    const s = stripHtml(String(q.stem || ''));
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ---------- 渲染 ---------- */

  function render(view) {
    lastView = view;
    const s = ensureSession();
    const ai = currentAI();
    const hasKey = !!resolveKey(ai);
    const recs = recommends && recommends.length ? recommends : (s.recs || []);

    view.innerHTML = `
      <section class="brief">
        <h1>AI 问答助手</h1>
        <p>行测、申论、时政、面试的问题都可以直接问。回答由模型实时生成，通常 10–30 秒出结果；
        每轮回答后会自动推荐题库里的相关题目。</p>
      </section>

      ${hasKey ? '' : `
        <div class="note-banner warn" style="margin-bottom:16px">
          当前<b>还没有可用的 API Key</b>，提问会失败。请到「设置 → AI 出题接口」填写自己的 Key；
          若站点已提供共享额度，通常无需填写，可直接提问试试。
        </div>`}

      ${errorMsg ? `
        <div class="note-banner warn" style="margin-bottom:16px">
          上一次请求没成功：<b>${esc(errorMsg)}</b>
        </div>` : ''}

      <div class="seg" style="margin-bottom:14px">
        ${ROLES.map(r => `<button type="button" data-role="${r.id}" class="${r.id === s.role ? 'active' : ''}">${esc(r.name)}</button>`).join('')}
      </div>

      <div class="chat-layout ${sideOpen ? 'side-open' : ''}">
        <aside class="chat-side">
          <div class="chat-side-head">
            <button type="button" class="btn btn-primary btn-sm" id="chat-new">＋ 新对话</button>
            <button type="button" class="btn btn-ghost btn-sm chat-side-close" id="chat-side-close">收起</button>
          </div>
          <div class="chat-side-list">
            ${sessions.length ? sessions.map(item => `
              <div class="chat-session ${item.id === activeId ? 'active' : ''}">
                <button type="button" class="chat-session-main" data-session="${item.id}">
                  <b>${esc(item.title || '新对话')}</b>
                  <span>${item.messages.length} 条 · ${esc(roleById(item.role).name)}</span>
                </button>
                <button type="button" class="chat-session-del" data-del="${item.id}" title="删除">×</button>
              </div>`).join('') : '<p class="small muted" style="padding:10px 2px">还没有对话，点上面的按钮开始。</p>'}
          </div>
        </aside>

        <div class="chat-main">
          <div class="chat-msgs" id="chat-msgs">
            ${s.messages.length ? s.messages.map(m => `
              <div class="chat-msg ${m.role} ${m.pending ? 'pending' : ''}">
                <div class="chat-avatar">${m.role === 'user' ? '我' : 'AI'}</div>
                <div class="md-body">${mdToHtml(m.content)}${m.pending ? '<span class="caret"></span>' : ''}</div>
              </div>`).join('') : `
              <div class="chat-empty">
                <p class="small muted">换个方式问也行，下面是几个常见的开场：</p>
                <div class="chat-suggests">
                  ${SUGGESTIONS.map(q => `<button type="button" class="chat-suggest" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}
                </div>
              </div>`}
          </div>

          ${!streaming && recs.length ? `
            <div class="chat-recs">
              <div class="chat-recs-head">题库里的相关题目 · 点一下去练</div>
              ${recs.map(q => `
                <button type="button" class="chat-rec" data-goto="${esc(q.id)}">
                  <span class="chip primary">${esc(Bank.moduleInfo(q.module).short)}</span>
                  <b>${esc(stemPreview(q, 76))}</b>
                  <span class="ext" aria-hidden="true">↗</span>
                </button>`).join('')}
            </div>` : ''}

          <div class="chat-input-bar">
            <button type="button" class="btn btn-ghost btn-sm chat-side-toggle" id="chat-side-toggle">对话</button>
            <textarea class="input chat-input" id="chat-input" rows="2"
              placeholder="输入你的问题，Ctrl / ⌘ + Enter 发送" maxlength="${MAX_INPUT}"></textarea>
            ${streaming
        ? '<button type="button" class="btn btn-danger" id="chat-stop">停止</button>'
        : '<button type="button" class="btn btn-primary" id="chat-send">发送</button>'}
          </div>
          <p class="small muted" style="margin-top:8px">
            上下文保留最近 ${MAX_ROUNDS} 轮 · 单次输入上限 ${MAX_INPUT} 字 ·
            对话只保存在这台设备的浏览器里${s.messages.length ? ' · <button type="button" class="link" id="chat-clear">清空本对话</button>' : ''}
          </p>
        </div>
      </div>
    `;

    bind(view);
  }

  function bind(view) {
    const input = $('#chat-input', view);
    if (!input) return;

    const doSend = () => {
      const v = input.value;
      if (!v.trim() || streaming) return;
      input.value = '';
      send(v);
    };

    const sendBtn = $('#chat-send', view);
    if (sendBtn) sendBtn.addEventListener('click', doSend);

    input.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); }
    });

    /* 自动长高，长问题不至于挤成一条缝 */
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });

    const stopBtn = $('#chat-stop', view);
    if (stopBtn) stopBtn.addEventListener('click', () => stop());

    const clearBtn = $('#chat-clear', view);
    if (clearBtn) clearBtn.addEventListener('click', () => clearActive());

    $$('[data-role]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        const s = activeSession();
        if (!s) return;
        /* 空会话直接换角色；已有对话则新建一条，避免上下文串味 */
        if (s.messages.length === 0) {
          s.role = btn.dataset.role;
          save();
          render(view);
        } else {
          createSession(btn.dataset.role);
          sideOpen = false;
          render(view);
        }
      });
    });

    $$('[data-session]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        const pick = sessions.find(s => s.id === btn.dataset.session);
        if (!pick) return;
        activeId = pick.id;
        errorMsg = '';
        /* 切回来的会话沿用自己上次的问题推荐，避免张冠李戴 */
        recommends = pick.recs || [];
        sideOpen = false;
        save();
        render(view);
        scrollToBottom();
      });
    });

    $$('[data-del]', view).forEach(btn => {
      btn.addEventListener('click', () => {
        removeSession(btn.dataset.del);
        errorMsg = '';
        render(view);
      });
    });

    const newBtn = $('#chat-new', view);
    if (newBtn) newBtn.addEventListener('click', () => {
      createSession(activeSession() ? activeSession().role : 'general');
      errorMsg = '';
      recommends = [];
      sideOpen = false;
      render(view);
    });

    const sideClose = $('#chat-side-close', view);
    if (sideClose) sideClose.addEventListener('click', () => { sideOpen = false; render(view); });

    const sideToggle = $('#chat-side-toggle', view);
    if (sideToggle) sideToggle.addEventListener('click', () => { sideOpen = !sideOpen; render(view); });

    $$('[data-ask]', view).forEach(btn => {
      btn.addEventListener('click', () => { input.value = btn.dataset.ask; doSend(); });
    });

    $$('[data-goto]', view).forEach(btn => {
      btn.addEventListener('click', () => gotoQuestion(btn.dataset.goto));
    });

    /* A：从刷题页 / 错题本带过来的提问，进页面后自动发出 */
    if (pendingAsk) {
      const text = askTextFor(pendingAsk);
      pendingAsk = '';
      if (text) {
        input.value = text;
        setTimeout(doSend, 60);
      }
    }
  }

  /* A：按题目 id 生成提问文本 */
  function askTextFor(qid) {
    const q = (typeof Bank !== 'undefined' && Bank.byId) ? Bank.byId(qid) : null;
    if (!q) return '';
    return buildQuestionPrompt(q, 'explain');
  }

  load();

  return {
    render,
    /* A：供刷题页 / 错题本调用，带着题目去提问 */
    askQuestion(qid) {
      const q = (typeof Bank !== 'undefined' && Bank.byId) ? Bank.byId(qid) : null;
      if (!q) { toast('找不到这道题'); return false; }
      pendingAsk = qid;
      createSession('xince');
      recommends = [];
      if (location.hash !== '#/aichat') location.hash = '#/aichat';
      else if (typeof route === 'function') route();
      return true;
    }
  };
})();
