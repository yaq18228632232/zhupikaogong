/* 朱批书房 · 大模型接口（OpenAI 兼容） */
'use strict';

const AI = (() => {
  /* 缺 Key 时的统一提示：告诉用户可以自带 Key 到哪填 */
  const MISSING_KEY = '还没有可用的 API Key。请到「设置 → AI 出题接口」填写你自己的 Key（只保存在本机浏览器）；如果不想申请，也可以继续用「复制提示词 + 粘贴结果」的方式手动完成。';

  /* 接口默认配置见 js/ai-config.js */
  function defaults() {
    return typeof aiConfigWithDefaults === 'function'
      ? aiConfigWithDefaults(null)
      : { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' };
  }

  function normalizeBase(baseUrl) {
    let base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) base = defaults().baseUrl;
    if (/^https?:\/\/api\.deepseek\.com$/i.test(base)) base += '/v1';
    return base;
  }

  /* 有些调用方会自己传一个 { baseUrl, key, model } 形状的对象，统一抹平 */
  function resolveKey(ai) {
    const raw = ai.apiKey || ai.key || '';
    return typeof aiEffectiveKey === 'function' ? aiEffectiveKey(raw) : String(raw || '').trim();
  }

  /* 模型无权访问（403 team_model_access_denied）
   * 带 code 标记，方便上层识别后自动回退到默认模型。 */
  function modelDeniedError(model, tail) {
    const err = new Error(
      `接口返回 403：当前账号无权调用模型「${model}」。最常见的原因是模型名填错，` +
      `请到「设置 → AI 出题接口」的模型下拉框改选一个（如 ${AI_DEFAULT.model}）。${tail || ''}`
    );
    err.code = 'MODEL_DENIED';
    return err;
  }

  /* 把接口的错误码翻译成人能照着做的话
   * 尤其 403：交大服务对无权访问的模型返回 team_model_access_denied，
   * 光看「接口返回 403」很难意识到是模型名填错了。 */
  function explainHttpError(status, body, model) {
    const raw = String(body || '').trim();
    let code = '';
    let msg = '';
    try {
      const parsed = JSON.parse(raw);
      const err = parsed.error || parsed;
      code = String(err.code || err.type || '').trim();
      msg = String(err.message || err.msg || '').trim();
    } catch (e) { /* 非 JSON，用原文即可 */ }

    const tail = raw ? `（接口原文：${raw.slice(0, 200)}）` : '';

    if (status === 403 && /model/i.test(code + ' ' + msg)) {
      return modelDeniedError(model, tail);
    }
    if (status === 401) {
      return new Error(`接口返回 401：API Key 无效或已过期，请检查「设置 → AI 出题接口」里填写的 Key。${tail}`);
    }
    if (status === 429) {
      return new Error(`接口返回 429：调用过于频繁或额度已用尽，请稍后再试，或换用自己的 Key。${tail}`);
    }
    if (status >= 500) {
      return new Error(`接口返回 ${status}：模型服务暂时不可用，请稍后重试。${tail}`);
    }
    return new Error(`接口返回 ${status}：${(msg || raw).slice(0, 160)}`);
  }

  async function chat(aiConfig, prompt, opts = {}) {
    const ai = Object.assign(defaults(), aiConfig || {});
    const key = resolveKey(ai);
    if (!key) throw new Error(MISSING_KEY);
    const base = normalizeBase(ai.baseUrl);
    const controller = new AbortController();
    const timeout = opts.timeout || 90000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: ai.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: opts.system || '你是一名严谨的公务员考试辅导专家，只输出要求的格式。' },
            { role: 'user', content: prompt }
          ],
          temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4,
          stream: false
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(explainHttpError(res.status, body, ai.model));
      }

      const data = await res.json();
      const choice = data.choices && data.choices[0];
      let content = choice && choice.message ? choice.message.content : '';
      if (Array.isArray(content)) content = content.map(p => p.text || '').join('');
      if (!content) throw new Error('接口返回内容为空');
      return content;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('请求超时（' + Math.round(timeout / 1000) + ' 秒），请稍后重试');
      if (err instanceof TypeError) {
        throw new Error('网络请求失败：可能是浏览器跨域（CORS）限制，或地址填写有误。可使用“复制提示词 + 粘贴结果”的方式。');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* 从模型输出中提取 JSON（容忍 ```json 包裹与前后说明文字） */
  function parseJSON(content) {
    const text = String(content || '').trim().replace(/```(?:json)?/gi, '');
    const objStart = text.indexOf('{');
    const arrStart = text.indexOf('[');
    let start = -1;
    let end = -1;
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      start = objStart;
      end = text.lastIndexOf('}');
    } else if (arrStart !== -1) {
      start = arrStart;
      end = text.lastIndexOf(']');
    }
    if (start === -1 || end === -1 || end <= start) throw new Error('未找到 JSON 内容');
    return JSON.parse(text.slice(start, end + 1));
  }

  return { chat, parseJSON, MISSING_KEY, hasKey(aiConfig) {
    const ai = Object.assign(defaults(), aiConfig || {});
    return typeof aiHasKey === 'function' ? aiHasKey(ai.apiKey) : !!resolveKey(ai);
  } };
})();
