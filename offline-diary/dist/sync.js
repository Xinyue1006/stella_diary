import { emptyDiary, mergeDiary, same } from './merge.js';
import {
  allPhotos, applySyncedDiary, loadDiary, localDiary, readPhotoBlob,
  readSyncState, rememberUpload, storeDownloadedPhoto
} from './storage.js';

class SignInRequired extends Error {}
class RetrySync extends Error {}
const notModified = Symbol('not modified');

async function api(path, options = {}, bodyType = 'json') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(path, {
      credentials: 'same-origin', mode: 'same-origin', cache: 'no-store',
      redirect: 'manual', signal: controller.signal, ...options
    });
    if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 ||
        response.headers.get('content-type')?.includes('text/html')) {
      throw new SignInRequired('请重新登录原来的 ChatGPT 账号，再同步这本日记。');
    }
    if (response.status === 409) throw new RetrySync();
    if (response.status === 304) return notModified;
    if (!response.ok) {
      const message = (await response.json().catch(() => null))?.error;
      throw new Error(typeof message === 'string' ? message : '云端暂时无法连接。请稍后重试。');
    }
    if (bodyType === 'none') return;
    if (bodyType === 'blob') return await response.blob();
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function cloudState(base) {
  const headers = { Accept: 'application/json' };
  if (base) {
    headers['X-Diary-Owner'] = base.owner;
    if (base.version) headers['If-None-Match'] = `"${base.version}"`;
  }
  const data = await api('/api/sync', { headers });
  if (data === notModified && base?.version) return base;
  if (typeof data.owner !== 'string' || !data.owner || (data.version !== null && typeof data.version !== 'string') ||
      (data.diary === null) !== (data.version === null)) throw new Error('云端资料格式无效，本机日记已保留。');
  if (base && data.owner !== base.owner) throw new SignInRequired('请切换回之前同步这本日记的 ChatGPT 账号。');
  return { owner: data.owner, version: data.version, diary: data.diary && localDiary(data.diary) };
}

async function transferPhotos(target, remote, snapshot, owner) {
  const headers = { 'X-Diary-Owner': owner };
  const onServer = new Set(allPhotos(remote).map(photo => photo.id));
  const onDevice = new Set(allPhotos(snapshot.local).map(photo => photo.id));
  for (const { id } of allPhotos(target)) {
    if (onServer.has(id) && onDevice.has(id)) continue;
    const blob = await readPhotoBlob(id);
    const url = `/api/photos/${encodeURIComponent(id)}`;
    if (!onServer.has(id)) {
      if (!(blob instanceof Blob)) throw new Error('有一张本机照片无法读取。原有记录已保留。');
      await api(url, { method: 'PUT', headers, body: blob }, 'none');
    } else if (!(blob instanceof Blob)) {
      await storeDownloadedPhoto(id, await api(url, { headers }, 'blob'));
    }
  }
}

// Earlier manual restores assigned new photo IDs even for the same backup.
// Reunite matching references only after checking the actual image bytes.
async function reconcileRestoredPhotos(local, remote, owner) {
  const digests = new Map();
  async function digest(id, onServer) {
    if (digests.has(id)) return digests.get(id);
    let blob = await readPhotoBlob(id);
    if (!blob && onServer) {
      blob = await api(`/api/photos/${encodeURIComponent(id)}`, { headers: { 'X-Diary-Owner': owner } }, 'blob');
      await storeDownloadedPhoto(id, blob);
    }
    if (!blob) throw new Error('有一张本机照片无法读取。请先确认备份。');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())).join(',');
    digests.set(id, hash);
    return hash;
  }
  async function reconcile(left, right) {
    if (!left || !right || left.photos.length !== right.photos.length) return left;
    const photos = [];
    for (let i = 0; i < left.photos.length; i++) {
      const a = left.photos[i];
      const b = right.photos[i];
      const equivalent = a.id !== b.id && await digest(a.id, false) === await digest(b.id, true);
      photos.push(equivalent ? b : a);
    }
    // A device may have reordered or independently replaced photos.
    return new Set(photos.map(photo => photo.id)).size === photos.length ? { ...left, photos } : left;
  }
  const theirs = new Map(remote.entries.map(entry => [entry.id, entry]));
  const entries = [];
  for (const entry of local.entries) entries.push(await reconcile(entry, theirs.get(entry.id)));
  return { ...local, entries, draft: await reconcile(local.draft, remote.draft) };
}

async function syncOnce(onWork) {
  let snapshot = await readSyncState();
  const cloud = await cloudState(snapshot.base);
  if (!snapshot.base) {
    snapshot = await readSyncState(cloud.owner);
    if (snapshot.base.version !== null || snapshot.intent) throw new RetrySync();
  }
  const { local, base, intent } = snapshot;
  if (base.owner !== cloud.owner) throw new SignInRequired('请登录之前使用的 ChatGPT 账号。');
  const remote = cloud.diary || emptyDiary();

  // A response can be lost after a successful upload. Finish its local commit
  // using the saved pre-upload state, including edits made since that upload.
  if (intent && cloud.diary && same(intent.target, remote)) {
    onWork();
    return applySyncedDiary({ ...snapshot, local: intent.before }, remote, cloud.version);
  }
  if (!intent && cloud.version === base.version && same(local, base.diary)) {
    return { diary: local, pending: false, unchanged: true };
  }
  onWork();
  const input = !base.version && cloud.diary ? await reconcileRestoredPhotos(local, remote, cloud.owner) : local;
  const merged = cloud.diary ? localDiary(mergeDiary(base.diary, input, remote)) : local;
  await transferPhotos(merged, remote, snapshot, cloud.owner);
  let version = cloud.version;
  if (!same(merged, remote)) {
    if (!await rememberUpload(snapshot, merged)) throw new RetrySync();
    const result = await api('/api/sync', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Diary-Owner': cloud.owner },
      body: JSON.stringify({ version, diary: merged })
    });
    if (typeof result.version !== 'string' || !result.version) throw new Error('未能确认同步结果，请稍后重试。');
    version = result.version;
  }
  return applySyncedDiary(snapshot, merged, version);
}

export function startSync({ onStatus, onData }) {
  let running = false;
  let requested = false;
  let timer;
  let lastSyncedAt = null;
  let stopped = false;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('sunflower-diary-updates') : null;
  const emit = (state, message) => onStatus({ state, message, lastSyncedAt });
  const offline = () => emit('offline', '离线中。已保存在本机，联网后会自动同步。');

  async function run() {
    if (running || stopped) return;
    if (!navigator.onLine) { offline(); return; }
    running = true;
    try {
      let completed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        requested = false;
        try {
          const result = await syncOnce(() => emit('syncing', '正在同步日记和照片…'));
          if (!result) continue;
          if (!result.unchanged) {
            await onData(result.diary);
            channel?.postMessage('updated');
          }
          if (result.pending || requested) continue;
          lastSyncedAt = new Date().toISOString();
          emit('synced', '已同步');
          completed = true;
          break;
        } catch (error) {
          if (!(error instanceof RetrySync)) throw error;
        }
      }
      if (!completed) {
        emit('pending', '有新改动，稍后继续同步。');
        queue(1500);
      }
    } catch (error) {
      if (!navigator.onLine) offline();
      else if (error instanceof SignInRequired) emit('signin', error.message);
      else emit('error', error instanceof TypeError || error.name === 'AbortError'
        ? '连接中断。日记已保存在本机，会自动重试。' : error.message);
    } finally {
      running = false;
      if (requested && !stopped) queue(600);
    }
  }

  function queue(delay = 0) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      requested = true;
      void run();
    }, delay);
  }
  function localWrite() {
    requested = true;
    if (navigator.onLine) emit('pending', '已保存在本机，等待同步。');
    else offline();
    channel?.postMessage('local');
    queue(600);
  }
  function visible() { if (!document.hidden) queue(); }
  if (channel) channel.onmessage = async event => {
    try { await onData(await loadDiary()); } catch { /* sync will report storage errors */ }
    if (event.data === 'local') queue(600);
  };
  const immediate = () => queue();
  globalThis.addEventListener('diary-local-write', localWrite);
  globalThis.addEventListener('online', immediate);
  globalThis.addEventListener('offline', offline);
  globalThis.addEventListener('focus', visible);
  document.addEventListener('visibilitychange', visible);
  const poll = setInterval(visible, 20000);
  emit('pending', '正在检查云端日记…');
  queue();
  immediate.stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(poll);
    channel?.close();
    globalThis.removeEventListener('diary-local-write', localWrite);
    globalThis.removeEventListener('online', immediate);
    globalThis.removeEventListener('offline', offline);
    globalThis.removeEventListener('focus', visible);
    document.removeEventListener('visibilitychange', visible);
  };
  return immediate;
}
