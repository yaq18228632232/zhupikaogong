/* 朱批书房 · 云账号（邮箱验证码注册 / 登录 + 进度云同步）
 *
 * 后端能力由 WorkBuddy 云服务提供（可选登录，未登录时一切都还是本地模式）。
 * 这里只持有 publishableKey —— 它只标识"哪个应用"，本身不带任何权限，
 * 服务端还会做 Origin 精确校验；真正的密钥全部在服务端。
 *
 * 例外：file:// 直接打开本地文件时不存在合法 Origin，云接口会拒绝，
 * 此时自动退回"仅本地"，不报错也不降级数据。
 */
'use strict';

const CLOUD_PUBLIC_CONFIG = {
  endpoint: 'https://zhubi-study.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_J5IUpTJGKzemYRInz2CQL6_MD22r3xdQ2n0QlfIlsNoYXvXX33w9nLh'
};

const Account = (() => {
  const PROFILE_TABLE = 'study_profiles';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';

  let cloud = null;
  let sdkPromise = null;
  let readyPromise = null;
  let user = null;          /* { id, email } */
  let lastError = '';
  let syncing = false;
  let lastSyncAt = 0;
  let pendingChallenge = null;  /* { email, verificationId, isExistingUser } */
  let listeners = [];

  const filesystem = location.protocol === 'file:';

  function notify() {
    listeners.forEach(fn => { try { fn(snapshot()); } catch (e) { console.warn(e); } });
  }

  function snapshot() {
    return {
      available: !filesystem,
      filesystem: filesystem,
      ready: !!cloud,
      user: user,
      lastError: lastError,
      lastSyncAt: lastSyncAt
    };
  }

  /* ---------- SDK 懒加载 ---------- */
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      if (window.WorkBuddyCloud) { resolve(window.WorkBuddyCloud); return; }
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = () => window.WorkBuddyCloud
        ? resolve(window.WorkBuddyCloud)
        : reject(new Error('SDK 加载异常'));
      s.onerror = () => reject(new Error('无法加载云端 SDK，请检查网络后重试'));
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (filesystem) { lastError = '本地文件方式打开，云账号不可用'; notify(); return null; }
      try {
        const sdk = await loadSdk();
        const factory = sdk.createWorkBuddyCloud || (sdk.default && sdk.default.createWorkBuddyCloud);
        if (typeof factory !== 'function') throw new Error('云端 SDK 版本异常');
        cloud = factory({
          endpoint: CLOUD_PUBLIC_CONFIG.endpoint,
          oauthRelayBaseUrl: CLOUD_PUBLIC_CONFIG.oauthRelayBaseUrl,
          publishableKey: CLOUD_PUBLIC_CONFIG.publishableKey
        });
        /* 恢复已有登录态 */
        try {
          const { data } = await cloud.auth.getSession();
          if (data && data.user) user = normalizeUser(data.user);
        } catch (err) { /* 未登录是正常情况 */ }
        if (cloud.auth.onAuthStateChange) {
          cloud.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
              user = null;
              notify();
            } else if (session && session.user) {
              user = normalizeUser(session.user);
              notify();
            }
          });
        }
        notify();
        return cloud;
      } catch (err) {
        lastError = err.message || '云服务初始化失败';
        console.warn('云服务初始化失败', err);
        notify();
        return null;
      }
    })();
    return readyPromise;
  }

  function normalizeUser(u) {
    return {
      id: u.id || u.uid || '',
      email: u.email || '',
      name: u.name || ''
    };
  }

  function maskEmail(email) {
    if (!email || email.indexOf('@') < 0) return email || '';
    const [name, host] = email.split('@');
    const head = name.slice(0, Math.min(2, name.length));
    return head + '***@' + host;
  }

  async function ensure() {
    const c = await init();
    if (!c) throw new Error(lastError || '云服务暂不可用');
    return c;
  }

  /* ---------- 邮箱验证码 ---------- */

  async function sendCode(email) {
    const addr = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) throw new Error('请填写正确的邮箱地址');
    const c = await ensure();
    const sent = await c.auth.sendOtp({ email: addr });
    if (sent.error) throw new Error(sent.error.message || '验证码发送失败');
    pendingChallenge = {
      email: addr,
      verificationId: sent.data.verificationId,
      isExistingUser: sent.data.isExistingUser
    };
    return { isExistingUser: sent.data.isExistingUser };
  }

  async function verifyCode(code) {
    if (!pendingChallenge) throw new Error('请先获取验证码');
    const token = String(code || '').trim();
    if (!/^\d{4,8}$/.test(token)) throw new Error('请输入收到的数字验证码');
    const c = await ensure();
    const done = await c.auth.verifyOtp({
      email: pendingChallenge.email,
      verificationId: pendingChallenge.verificationId,
      isExistingUser: pendingChallenge.isExistingUser,
      token: token
    });
    if (done.error) throw new Error(done.error.message || '验证码校验失败');
    const isNew = !pendingChallenge.isExistingUser;
    pendingChallenge = null;
    user = normalizeUser((done.data && done.data.user) || {});
    notify();
    return { isNew: isNew };
  }

  async function signOut() {
    if (!cloud) { user = null; notify(); return; }
    try { await cloud.auth.signOut(); } catch (e) { console.warn(e); }
    user = null;
    notify();
  }

  /* ---------- 进度云同步 ---------- */

  function chunkKeys(all) {
    return Object.keys(all).filter(k => ['answers', 'mistakes', 'grades', 'drafts', 'customQuestions', 'exams', 'activeDays', 'meta'].indexOf(k) >= 0);
  }

  function pickPayload(full) {
    const out = {};
    chunkKeys(full).forEach(k => { if (full[k] !== undefined) out[k] = full[k]; });
    return out;
  }

  async function pull() {
    const c = await ensure();
    const { data, error } = await c.database.from(PROFILE_TABLE).select('data, updated_at').maybeSingle();
    if (error) throw new Error(error.message || '读取云端进度失败');
    return data && data.data ? data : null;
  }

  async function push(payload) {
    const c = await ensure();
    const { data: session } = await c.auth.getSession();
    if (!session) throw new Error('登录已过期，请重新登录');
    const { data, error } = await c.database
      .from(PROFILE_TABLE)
      .upsert({ data: payload, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
      .select('updated_at');
    if (error) throw new Error(error.message || '写入云端进度失败');
    lastSyncAt = Date.now();
    notify();
    return Array.isArray(data) ? data[0] : null;
  }

  async function removeRemote() {
    const c = await ensure();
    const { error } = await c.database.from(PROFILE_TABLE).delete().eq('owner_id', user.id);
    if (error) throw new Error(error.message || '删除云端进度失败');
  }

  function onSync(fn) { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; }

  return {
    init,
    snapshot,
    onSync,
    notify,
    sendCode,
    verifyCode,
    signOut,
    pull,
    push,
    removeRemote,
    pickPayload,
    maskEmail,
    isSignedIn() { return !!user; },
    getUser() { return user; },
    get lastError() { return lastError; },
    get syncing() { return syncing; },
    set syncing(v) { syncing = v; notify(); }
  };
})();
