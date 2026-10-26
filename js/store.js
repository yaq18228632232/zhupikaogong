/* 朱批书房 · 本地数据层（localStorage） */
'use strict';

const STORE_KEY = 'zhubi_study_v1';
const HISTORY_KEY = 'zhubi_history_v1';

const Store = (() => {
  function defaults() {
    return {
      version: 1,
      settings: {
        theme: 'crimson',
        examDate: '',
        newsNotify: false,
        packEnabled: true,
        ai: aiConfigWithDefaults(null)
      },
      answers: [],
      mistakes: {},
      exams: [],
      drafts: {},
      grades: {},
      customQuestions: [],
      activeDays: {},
      meta: { createdAt: Date.now() }
    };
  }

  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    const out = Object.assign({}, base, saved);
    out.settings = Object.assign({}, base.settings, saved.settings || {});
    /* 只覆盖用户真正填过的字段，其余沿用默认接口（如换默认 Key 后自动生效） */
    const savedAI = (saved.settings && saved.settings.ai) || {};
    const ai = Object.assign({}, base.settings.ai);
    ['baseUrl', 'apiKey', 'model'].forEach(k => {
      if (typeof savedAI[k] === 'string' && savedAI[k].trim()) ai[k] = savedAI[k];
    });
    out.settings.ai = ai;
    out.answers = Array.isArray(saved.answers) ? saved.answers : [];
    out.exams = Array.isArray(saved.exams) ? saved.exams : [];
    out.customQuestions = Array.isArray(saved.customQuestions) ? saved.customQuestions : [];
    out.mistakes = saved.mistakes && typeof saved.mistakes === 'object' ? saved.mistakes : {};
    out.drafts = saved.drafts && typeof saved.drafts === 'object' ? saved.drafts : {};
    out.grades = saved.grades && typeof saved.grades === 'object' ? saved.grades : {};
    out.activeDays = saved.activeDays && typeof saved.activeDays === 'object' ? saved.activeDays : {};
    return out;
  }

  /* 旧版内置 Key 的处理：保留、不删除。
   * 早期版本把共享 Key 存进了访客的 localStorage（那时叫 settings.ai.apiKey）。
   * 现在同一字段表示"访客自己的 Key"，若直接清掉会让老访客失去 AI 能力，
   * 所以这里不做清理，只标记「沿用自旧内置配置」，由设置页给出提示。 */

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaults();
      return merge(defaults(), JSON.parse(raw));
    } catch (err) {
      console.warn('读取本地数据失败', err);
      return defaults();
    }
  }

  let state = load();
  let saveTimer = null;

  /* ---------- 操作记录（独立存储，单独写入，不受主数据防抖/清空影响） ---------- */
  const HIST_LIMIT = 300;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      console.warn('读取操作记录失败', err);
      return [];
    }
  }

  let history = loadHistory();

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (err) {
      /* 记录放不下时，砍掉一半再试一次，尽量不丢失最近的操作 */
      try {
        history = history.slice(0, Math.max(20, Math.floor(history.length / 2)));
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return true;
      } catch (e) {
        console.warn('操作记录保存失败', e);
        return false;
      }
    }
  }

  function log(type, text, extra) {
    history.unshift(Object.assign({ t: Date.now(), type: type, text: String(text || '') }, extra || {}));
    if (history.length > HIST_LIMIT) history = history.slice(0, HIST_LIMIT);
    saveHistory();
  }

  /* ---------- 云端同步（可选，登录后才启用） ----------
     本地始终是即时写入的第一落点，云端在防抖窗口后再推，离线也不会阻塞操作。 */
  let cloudTimer = null;
  let cloudEnabled = false;

  function cloudReady() {
    return cloudEnabled && typeof Account !== 'undefined' && Account.isSignedIn();
  }

  function scheduleCloud() {
    if (!cloudReady()) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { pushCloud(); }, 2500);
  }

  function pushCloud() {
    if (!cloudReady()) return Promise.resolve();
    clearTimeout(cloudTimer);
    const payload = Account.pickPayload(state);
    try {
      Account.syncing = true;
      return Account.push(payload)
        .catch(err => { console.warn('云端同步失败', err); })
        .then(() => { Account.syncing = false; });
    } catch (err) {
      Account.syncing = false;
      return Promise.resolve();
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn('保存失败', err);
        toast('保存失败：浏览器存储空间可能已满，请在设置中导出备份后清理数据');
      }
    }, 80);
    scheduleCloud();
  }

  function touchDay() {
    state.activeDays[todayStr()] = true;
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('保存失败', err);
      return false;
    }
  }

  /* 页面隐藏/关闭前立即落盘，避免防抖窗口内丢失最后一步操作 */
  function flush() { saveNow(); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return {
    get() { return state; },

    setSetting(key, value) {
      state.settings[key] = value;
      persist();
      /* 主题切换由 Theme.set 直接落盘，这里不重复记，避免一次点击两条记录 */
      if (key === 'examDate') log('设置', value ? '设置考试日期：' + value : '清除考试日期');
    },

    setAI(ai) {
      state.settings.ai = aiConfigWithDefaults(Object.assign({}, state.settings.ai, ai));
      persist();
      log('设置', '修改 AI 接口：' + state.settings.ai.model);
    },

    resetAI() {
      state.settings.ai = aiConfigWithDefaults(null);
      saveNow();
      log('设置', '恢复默认 AI 接口：' + state.settings.ai.model);
    },

    recordAnswer({ qid, module, correct, mode }) {
      state.answers.push({ t: Date.now(), q: qid, m: module, ok: !!correct, mode: mode || 'practice' });
      if (state.answers.length > 5000) state.answers = state.answers.slice(-5000);
      touchDay();
      persist();
      if (history.length < 40 || !history[0].batch) {
        log('答题', '答' + (correct ? '对' : '错') + '一题', { batch: true, module: module, ok: !!correct, mode: mode || 'practice', n: 1 });
      } else {
        history[0].n = (history[0].n || 1) + 1;
        history[0].t = Date.now();
        saveHistory();
      }
    },

    addMistake(qid) {
      const cur = state.mistakes[qid];
      state.mistakes[qid] = {
        addedAt: cur ? cur.addedAt : Date.now(),
        lastAt: Date.now(),
        wrongCount: (cur ? cur.wrongCount : 0) + 1
      };
      persist();
      log('错题', '加入错题本：' + qid);
    },

    removeMistake(qid) {
      delete state.mistakes[qid];
      persist();
      log('错题', '移出错题本：' + qid);
    },

    mistakeIds() { return Object.keys(state.mistakes); },

    addExam(record) {
      state.exams.unshift(record);
      if (state.exams.length > 60) state.exams = state.exams.slice(0, 60);
      touchDay();
      persist();
      log('模考', '交卷：得分 ' + (record && record.score != null ? record.score : '—') +
        (record && record.total ? ' / ' + record.total : ''));
    },

    saveDraft(promptId, text) {
      state.drafts[promptId] = { text: text, updatedAt: Date.now() };
      touchDay();
      persist();
      /* 草稿频繁输入，只在「从无到有」或隔了一段时间后记一条，避免刷屏 */
      const chars = String(text || '').trim().length;
      const last = history.find(h => h.type === '申论' && h.ref === promptId);
      if (chars > 0 && (!last || Date.now() - last.t > 10 * 60 * 1000 || (last.chars || 0) + 200 < chars)) {
        log('申论', '保存草稿：' + promptId + '（' + chars + ' 字）', { ref: promptId, chars: chars });
      }
    },

    getDraft(promptId) {
      return state.drafts[promptId] || null;
    },

    saveGrade(promptId, grade) {
      state.grades[promptId] = grade;
      touchDay();
      persist();
      log('申论', '收到批改：' + promptId + (grade && grade.score != null ? '（' + grade.score + ' 分）' : ''), { ref: promptId });
    },

    getGrade(promptId) {
      return state.grades[promptId] || null;
    },

    addQuestions(list) {
      list.forEach((q, i) => {
        state.customQuestions.push(Object.assign({}, q, {
          id: q.id || ('u' + Date.now() + '_' + i),
          tag: q.tag || '导入'
        }));
      });
      persist();
      log('题库', '导入自定义题目 ' + list.length + ' 道');
      return list.length;
    },

    removeQuestion(qid) {
      state.customQuestions = state.customQuestions.filter(q => q.id !== qid);
      delete state.mistakes[qid];
      persist();
      log('题库', '删除自定义题目：' + qid);
    },

    resetAll() {
      const theme = state.settings.theme;
      state = defaults();
      state.settings.theme = theme || 'crimson';
      saveNow();
      log('数据', '清空全部本地数据');
    },

    streak() {
      const days = state.activeDays;
      let count = 0;
      const d = new Date();
      if (!days[todayStr(d)]) d.setDate(d.getDate() - 1);
      while (days[todayStr(d)]) {
        count += 1;
        d.setDate(d.getDate() - 1);
        if (count > 3650) break;
      }
      return count;
    },

    stats() {
      const answers = state.answers;
      const total = answers.length;
      const correct = answers.filter(a => a.ok).length;
      const today = todayStr();
      const todayCount = answers.filter(a => todayStr(new Date(a.t)) === today).length;

      const byModule = {};
      MODULES.forEach(m => { byModule[m.id] = { answered: 0, correct: 0, attempted: new Set(), bankSize: 0 }; });
      answers.forEach(a => {
        const slot = byModule[a.m];
        if (!slot) return;
        slot.answered += 1;
        if (a.ok) slot.correct += 1;
        if (a.q) slot.attempted.add(a.q);
      });
      Bank.all().forEach(q => {
        if (byModule[q.module]) byModule[q.module].bankSize += 1;
      });

      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = todayStr(d);
        last7.push({
          date: key,
          label: (d.getMonth() + 1) + '/' + d.getDate(),
          count: answers.filter(a => todayStr(new Date(a.t)) === key).length
        });
      }

      const bestExam = state.exams.reduce((best, e) => Math.max(best, e.score || 0), 0);

      return {
        total, correct,
        accuracy: pct(correct, total),
        todayCount,
        byModule,
        last7,
        streak: this.streak(),
        examCount: state.exams.length,
        bestExam,
        mistakesCount: Object.keys(state.mistakes).length
      };
    },

    /* ---------- 云端同步 ---------- */
    enableCloud(on) { cloudEnabled = !!on; },
    cloudReady: cloudReady,
    syncNow() { return pushCloud(); },
    /* 用云端快照覆盖本地（登录时若云端更新，或用户手动"以云端为准"） */
    adoptRemote(payload) {
      if (!payload || typeof payload !== 'object') return false;
      const theme = state.settings.theme;
      const ai = state.settings.ai;
      state = merge(defaults(), payload);
      /* 外观与接口是本机偏好，不跟着账号走 */
      state.settings.theme = theme || state.settings.theme;
      state.settings.ai = ai || state.settings.ai;
      saveNow();
      log('数据', '从云端拉取进度');
      return true;
    },
    localStorageEmpty() {
      return !state.answers.length && !state.exams.length && !Object.keys(state.drafts).length &&
        !Object.keys(state.mistakes).length && !state.customQuestions.length;
    },

    /* ---------- 操作记录 ---------- */
    history() { return history.slice(); },

    clearHistory() {
      history = [];
      saveHistory();
    },

    exportObject() {
      return {
        app: 'zhubi-study',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state,
        history: history
      };
    },

    importObject(obj) {
      const raw = obj && obj.data ? obj.data : obj;
      if (!raw || typeof raw !== 'object' || !raw.settings) {
        throw new Error('文件格式不正确：缺少必要字段');
      }
      state = merge(defaults(), raw);
      saveNow();
      if (Array.isArray(obj && obj.history)) {
        history = obj.history.slice(0, HIST_LIMIT);
        saveHistory();
      }
      log('数据', '导入备份');
    }
  };
})();

/* 题库访问辅助：内置题库 + 导入题目 */
const Bank = {
  all() {
    return QUESTION_BANK.questions
      .concat(PACK_QUESTIONS)
      .concat(Store.get().customQuestions || []);
  },
  byId(id) {
    return this.all().find(q => q.id === id) || null;
  },
  byModule(moduleId) {
    return this.all().filter(q => q.module === moduleId);
  },
  moduleInfo(id) {
    return MODULE_MAP[id] || { id: id, name: id, short: id, glyph: '题', desc: '' };
  },
  moduleName(id) {
    const m = MODULE_MAP[id];
    return m ? m.name : '其他';
  }
};
