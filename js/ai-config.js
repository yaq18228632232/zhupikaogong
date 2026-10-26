/* 朱批书房 · 大模型接口默认配置
 *
 * 这里只放"公开可见"的东西：接口地址、模型清单、以及共享 Key 是否可用。
 * 真正的 Key 不写在这里（以前写在这里，打开网页源码就能看到并盗用额度）。
 *
 * 现在有两种 Key 来源：
 *  1) 每位访客在「设置 → AI 出题接口」里填自己的 Key，只存在他自己的浏览器里；
 *  2) 站长可在 js/ai-key.js 里填一个共享 Key（该文件被 .gitignore 排除、不公开分发），
 *     或后续接云端代理后由服务端注入。
 *
 * 无论哪种，Key 一旦发到浏览器就不再是秘密。要让 Key 真正不外泄，
 * 必须走服务端代理（见 README "AI Key 的安全边界"）。
 */
'use strict';

const AI_DEFAULT = {
  name: '上海交大模型服务',
  baseUrl: 'https://models.sjtu.edu.cn/api/v1',
  /* 注意：这里永久留空。默认 Key 一律不放前端代码里。 */
  apiKey: '',
  model: 'deepseek-chat',
  /* 设置页下拉可选；一个模型多个调用名时，第一个用于「找默认值」 */
  models: [
    { id: 'deepseek-chat', label: 'DeepSeek V4 Flash（deepseek-chat）', note: '速度快，适合批改、出题' },
    { id: 'deepseek-reasoner', label: 'DeepSeek V4 Flash 推理版（deepseek-reasoner）', note: '带思维链，慢一些、更稳' },
    { id: 'qwen', label: 'Qwen3.8-27B（qwen）', note: '' },
    { id: 'qwen3.8-27b', label: 'Qwen3.8-27B（qwen3.8-27b）', note: '与 qwen 为同一模型' }
  ]
};

/* 把一组 AI 配置补全为完整结构（兼容旧数据）
 * 只补地址与模型；apiKey 永远以调用方传入的为准，不在这里回填任何默认 Key。 */
function aiConfigWithDefaults(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return {
    baseUrl: typeof s.baseUrl === 'string' && s.baseUrl ? s.baseUrl : AI_DEFAULT.baseUrl,
    apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
    model: typeof s.model === 'string' && s.model ? s.model : AI_DEFAULT.model
  };
}

/* 当前可用的 API Key：优先用本机设置的，其次才是站长共享 Key（如已配置） */
function aiEffectiveKey(apiKey) {
  if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim();
  if (typeof AI_SHARED_KEY === 'string' && AI_SHARED_KEY.trim()) return AI_SHARED_KEY.trim();
  return '';
}

/* 是否已具备可用 Key */
function aiHasKey(apiKey) {
  return !!aiEffectiveKey(apiKey);
}

/* 统一去掉接口地址末尾的斜杠，便于比较 */
function aiNormalizeBase(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

/* 模型名是否可用
 *
 * 只对「交大默认接口」做白名单校验：这个账号在交大服务上只能调用 public-models，
 * 填了清单外的名字（例如 deepseek-v4-pro）必然 403，与其等到批改时失败，
 * 不如在保存设置时就拦下来。
 *
 * 用户若换成自建 / 第三方接口，则不校验——那些服务的可用模型我们无从得知，
 * 强行拦截只会挡住正常使用。 */
function aiCheckModel(baseUrl, model) {
  const name = String(model || '').trim();
  if (!name) return { ok: false, reason: '模型名不能为空。' };
  if (aiNormalizeBase(baseUrl) !== aiNormalizeBase(AI_DEFAULT.baseUrl)) return { ok: true };
  if (AI_DEFAULT.models.some(m => m.id === name)) return { ok: true };
  return {
    ok: false,
    reason: `模型「${name}」不在${AI_DEFAULT.name}的可用清单里，直接调用会被拒绝（403）。` +
      `请在下方下拉框中选择：${AI_DEFAULT.models.map(m => m.id).join('、')}。` +
      `如果你用的是别的接口服务，请同时把「接口地址」改成对应地址，就不会再做这个检查。`
  };
}
