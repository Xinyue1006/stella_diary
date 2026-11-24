/* IndexedDB remains the source for offline reads and writes. */
import { emptyDiary, mergeDiary, preserveDraft, same } from './merge.js';
export const MAX_BACKUP_BYTES = 40 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_TOTAL_PHOTO_BYTES = 24 * 1024 * 1024;
export const MAX_ENTRY_PHOTOS = 12;
export const MAX_TEXT_LENGTH = 50000;

const DB_NAME = 'sunflower-pig-diary';
const DB_VERSION = 1;
const MASCOTS = ['dinosaur', 'ladybug', 'butterfly', 'cow', 'bee', 'bunny'];
let databasePromise;
const objectUrls = new Map();

function committed(diary) {
  globalThis.dispatchEvent(new Event('diary-local-write'));
  return diary;
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('手机本机空间不足，未完成保存。原有日记仍然保留，请先导出备份或腾出一些空间。');
  if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return new Error('当前打开方式无法使用本机存储。请在 Safari 的正常浏览模式打开日记后重试。');
  return error instanceof Error ? error : new Error('暂时无法读取或保存本机日记，请重试。');
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前环境不支持本机日记存储，请使用 Safari 正常浏览模式。')); return; }
    let request;
    let blocked = false;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => { blocked = true; reject(new Error('另一个日记页面正在使用本机资料，请关闭其他日记页面后重试。')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value;
}

function text(value, max, label, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.length)) throw new Error(`${label}格式无效`);
  return value;
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error('记录编号无效');
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('记录时间无效');
  return value;
}

function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('倒数日日期无效');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('倒数日日期无效');
  return value;
}

function list(value, max, label) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}数量无效`);
  return value;
}

function validatePhoto(value) {
  const photo = record(value, '照片');
  return { id: identifier(photo.id), uri: text(photo.uri, 4096, '照片位置') };
}

function validateDraft(value) {
  const draft = record(value, '草稿');
  const photos = list(draft.photos, MAX_ENTRY_PHOTOS, '照片').map(validatePhoto);
  if (new Set(photos.map(photo => photo.id)).size !== photos.length) throw new Error('同一条记录有重复照片');
  return { text: text(draft.text, MAX_TEXT_LENGTH, '日记文字', true), occurredAt: timestamp(draft.occurredAt), photos };
}

function dayKind(kind) {
  if (kind === undefined || kind === 'countdown') return {};
  if (kind === 'anniversary') return { kind };
  throw new Error('无法识别这个日子的类型');
}

function validateActions(value) {
  const actions = list(value, 32, '应对方式').map(action => text(action, 120, '应对方式'));
  if (actions.some(action => action !== action.trim()) || new Set(actions).size !== actions.length) throw new Error('应对方式含有空格或重复项目');
  return actions;
}

function validateAnxietyLog(value) {
  const log = record(value, '焦虑记录');
  if (![1, 2, 3].includes(log.intensity)) throw new Error('请选择焦虑程度');
  const actions = validateActions(log.actions);
  const helpfulActions = validateActions(log.helpfulActions);
  if (helpfulActions.some(action => !actions.includes(action))) throw new Error('请先选中用过的应对方式');
  return {
    id: identifier(log.id), occurredAt: timestamp(log.occurredAt), updatedAt: timestamp(log.updatedAt),
    intensity: log.intensity, worry: text(log.worry, MAX_TEXT_LENGTH, '担心的事', true),
    outcome: text(log.outcome, MAX_TEXT_LENGTH, '后来发生的事', true), actions, helpfulActions
  };
}

function validateDiary(value) {
  const diary = record(value, '日记');
  if (diary.schemaVersion !== 1) throw new Error('无法识别这个版本的日记资料，原档已保留。');
  if (!MASCOTS.includes(diary.mascot)) throw new Error('小猪款式无效');
  const entries = list(diary.entries, 20000, '日记').map(value => {
    const entry = record(value, '日记');
    const content = validateDraft(entry);
    if (!content.text.trim() && !content.photos.length) throw new Error('日记内容为空');
    return { ...content, id: identifier(entry.id), createdAt: timestamp(entry.createdAt), updatedAt: timestamp(entry.updatedAt) };
  });
  const countdowns = list(diary.countdowns, 2000, '倒数日').map(value => {
    const countdown = record(value, '倒数日');
    const title = text(countdown.title, 80, '倒数日名称');
    if (!title.trim()) throw new Error('倒数日名称不能为空');
    return { id: identifier(countdown.id), title, date: dateKey(countdown.date), ...dayKind(countdown.kind) };
  });
  const anxietyLogs = list(diary.anxietyLogs === undefined ? [] : diary.anxietyLogs, 20000, '焦虑记录').map(validateAnxietyLog);
  if ([entries, countdowns, anxietyLogs].some(rows => new Set(rows.map(row => row.id)).size !== rows.length)) throw new Error('资料含有重复记录编号');
  return { schemaVersion: 1, entries, countdowns, anxietyLogs, mascot: diary.mascot, draft: diary.draft === null ? null : validateDraft(diary.draft) };
}

function mapPhotos(diary, map) {
  return { ...diary, entries: diary.entries.map(entry => ({ ...entry, photos: entry.photos.map(map) })), draft: diary.draft ? { ...diary.draft, photos: diary.draft.photos.map(map) } : null };
}

export function localDiary(diary) {
  return mapPhotos(validateDiary(diary), photo => ({ id: photo.id, uri: `idb-photo://${photo.id}` }));
}

export function allPhotos(diary) {
  return Array.from(new Map([...diary.entries.flatMap(entry => entry.photos), ...(diary.draft?.photos ?? [])].map(photo => [photo.id, photo])).values());
}

function transact(db, stores, mode, operation) {
  return new Promise((resolve, reject) => {
    let transaction;
    try { transaction = db.transaction(stores, mode); } catch (error) { reject(storageError(error)); return; }
    let result;
    let failure;
    const fail = error => {
      failure = error;
      try { transaction.abort(); } catch { reject(storageError(error)); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(storageError(failure ?? transaction.error));
    transaction.onerror = () => { failure ??= transaction.error; };
    try { operation(transaction, value => { result = value; }, fail); } catch (error) { fail(error); }
  });
}

function onSuccess(request, action, fail) {
  request.onsuccess = () => { try { action(request.result); } catch (error) { fail(error); } };
}

function storedDiary(value, base) {
  if (value === undefined) return emptyDiary();
  // A still-open old shell can rewrite local state without this collection.
  // Its omission carries no deletion intent, so retain known synced records.
  if (value.anxietyLogs === undefined && base?.diary.anxietyLogs) {
    return localDiary({ ...value, anxietyLogs: base.diary.anxietyLogs });
  }
  return localDiary(value);
}

function readStoredDiary(state, action, fail) {
  onSuccess(state.get('diary'), value => {
    if (value && value.anxietyLogs === undefined) {
      onSuccess(state.get(checkpointKey), base => action(storedDiary(value, base)), fail);
    } else {
      action(storedDiary(value));
    }
  }, fail);
}

/** Read/modify/write happens within ONE transaction, including across open tabs. */
async function mutate(transform) {
  const db = await openDatabase();
  return transact(db, ['state', 'photos'], 'readwrite', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    const photos = transaction.objectStore('photos');
    readStoredDiary(state, current => {
      const next = localDiary(transform(current));
      // Requests are queued synchronously while the transaction is active.
      for (const photo of allPhotos(next)) {
        onSuccess(photos.get(photo.id), stored => {
          if (!stored?.blob || !(stored.blob instanceof Blob)) throw new Error('有一张照片尚未保存完成，请重新选择后再保存。');
        }, fail);
      }
      state.put(current, 'previous');
      state.put(next, 'diary');
      done(next);
    }, fail);
  }).then(committed);
}

export async function loadDiary() {
  const db = await openDatabase();
  return transact(db, ['state'], 'readonly', (transaction, done, fail) => {
    readStoredDiary(transaction.objectStore('state'), done, fail);
  });
}

const checkpointKey = 'cloud-checkpoint';
const intentKey = 'cloud-upload';

function readStateKeys(state, keys, action, fail) {
  const requests = keys.map(key => state.get(key));
  onSuccess(requests[requests.length - 1], () => action(...requests.map(request => request.result)), fail);
}

function newCheckpoint(owner) {
  return { owner, version: null, diary: emptyDiary(), stamp: makeId('checkpoint') };
}

// A restored backup is a new input to the first merge. Missing records in that
// backup are not deletions from the cloud. Keep the original account binding.
function resetSyncBase(state, fail) {
  onSuccess(state.get(checkpointKey), base => {
    if (base) state.put(newCheckpoint(base.owner), checkpointKey);
    state.delete(intentKey);
  }, fail);
}

export async function readSyncState(owner) {
  const db = await openDatabase();
  return transact(db, ['state'], owner ? 'readwrite' : 'readonly', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    readStateKeys(state, ['diary', checkpointKey, intentKey], (value, base, intent) => {
      const local = storedDiary(value, base);
      if (owner && base && owner !== base.owner) throw new Error('请登录之前同步这本日记的 ChatGPT 账号。本机资料已保留。');
      if (owner && !base) {
        base = newCheckpoint(owner);
        state.put(base, checkpointKey);
      }
      // Older clients may know the current ETag while omitting logs stored at
      // that very version. Fetch its full body once before trusting a 304.
      if (base && base.diary.anxietyLogs === undefined) {
        base = { ...base, diary: localDiary(base.diary), needsFullSnapshot: true };
      }
      if (intent && intent.target.anxietyLogs === undefined) {
        intent = { before: storedDiary(intent.before, base), target: localDiary(intent.target), predatesAnxietyLogs: true };
      }
      done({ local, base, intent });
    }, fail);
  });
}

export async function rememberUpload(snapshot, target) {
  const db = await openDatabase();
  return transact(db, ['state'], 'readwrite', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    onSuccess(state.get(checkpointKey), base => {
      if (base?.stamp !== snapshot.base.stamp) { done(false); return; }
      state.put({ before: snapshot.local, target }, intentKey);
      done(true);
    }, fail);
  });
}

// Commit cloud metadata and its downloaded content together. Rebase changes
// typed while network requests were in flight onto the acknowledged snapshot.
export async function applySyncedDiary(snapshot, target, version) {
  const db = await openDatabase();
  return transact(db, ['state'], 'readwrite', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    readStateKeys(state, ['diary', checkpointKey], (value, base) => {
      if (base?.stamp !== snapshot.base.stamp) { done(null); return; }
      const current = storedDiary(value, base);
      const next = same(current, snapshot.local) ? target : localDiary(mergeDiary(snapshot.local, current, target));
      if (!same(current, next) || (value && value.anxietyLogs === undefined)) {
        state.put(current, 'previous');
        state.put(next, 'diary');
      }
      state.put({ owner: base.owner, version, diary: target, stamp: makeId('checkpoint') }, checkpointKey);
      state.delete(intentKey);
      done({ diary: next, pending: !same(next, target) });
    }, fail);
  });
}

export async function readPhotoBlob(id) {
  const db = await openDatabase();
  return transact(db, ['photos'], 'readonly', (transaction, done, fail) => {
    onSuccess(transaction.objectStore('photos').get(identifier(id)), value => done(value?.blob), fail);
  });
}

export async function storeDownloadedPhoto(id, blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_PHOTO_BYTES || blob.type === 'text/html') {
    throw new Error('有一张云端照片未下载完整。请重新同步。');
  }
  const db = await openDatabase();
  return transact(db, ['photos'], 'readwrite', (transaction, done, fail) => {
    const store = transaction.objectStore('photos');
    onSuccess(store.getKey(identifier(id)), key => {
      if (key === undefined) store.add({ id, blob });
      done();
    }, fail);
  });
}

export async function saveDraft(draft, expectedDraft) {
  const checked = draft === null ? null : validateDraft(draft);
  return mutate(diary => {
    const stale = expectedDraft !== undefined && !same(diary.draft, expectedDraft);
    if (stale && checked === null) return diary;
    const next = stale && !same(diary.draft, checked) ? preserveDraft(diary, diary.draft) : diary;
    return { ...next, draft: checked };
  });
}

export async function saveEntry(draft, id, expectedEntry, expectedDraft) {
  const checked = validateDraft(draft);
  if (!checked.text.trim() && !checked.photos.length) throw new Error('写一句话或加一张照片，就可以保存了');
  if (id !== undefined) identifier(id);
  return mutate(diary => {
    let existing = id === undefined ? undefined : diary.entries.find(entry => entry.id === id);
    if (id !== undefined && !existing && !expectedEntry) throw new Error('这条记录已不存在，请重新打开');
    if (expectedEntry && !same(existing, expectedEntry)) existing = undefined;
    const now = new Date().toISOString();
    const entry = { ...checked, id: existing?.id ?? makeId('entry'), createdAt: existing?.createdAt ?? now, updatedAt: now };
    const clearDraft = id === undefined && (expectedDraft === undefined || same(diary.draft, expectedDraft));
    return { ...diary, entries: existing ? diary.entries.map(item => item.id === id ? entry : item) : [...diary.entries, entry], draft: clearDraft ? null : diary.draft };
  });
}

export async function removeEntry(id, expectedEntry) {
  identifier(id);
  return mutate(diary => {
    if (expectedEntry && !same(diary.entries.find(entry => entry.id === id), expectedEntry)) throw new Error('这条记录有新的改动，请重新查看后再删除。');
    return { ...diary, entries: diary.entries.filter(entry => entry.id !== id) };
  });
}

export async function saveCountdown(input, id, expectedItem) {
  const title = text(input?.title, 80, '倒数日名称').trim();
  if (!title) throw new Error('请填写这个日子的名称');
  const date = dateKey(input.date);
  if (id !== undefined) identifier(id);
  return mutate(diary => {
    const existing = id === undefined ? undefined : diary.countdowns.find(item => item.id === id);
    if (id !== undefined && !existing && !expectedItem) throw new Error('这个日子已不存在');
    const replace = existing && (!expectedItem || same(existing, expectedItem));
    const countdown = { id: replace ? id : makeId('countdown'), title, date, ...dayKind(input.kind ?? existing?.kind) };
    return { ...diary, countdowns: replace ? diary.countdowns.map(item => item.id === id ? countdown : item) : [...diary.countdowns, countdown] };
  });
}

export async function removeCountdown(id, expectedItem) {
  identifier(id);
  return mutate(diary => {
    if (expectedItem && !same(diary.countdowns.find(item => item.id === id), expectedItem)) throw new Error('这个日子有新的改动，请重新查看后再删除。');
    return { ...diary, countdowns: diary.countdowns.filter(item => item.id !== id) };
  });
}

export async function saveAnxietyLog(input, id, expectedLog) {
  record(input, '焦虑记录');
  if (id !== undefined) identifier(id);
  return mutate(diary => {
    const current = id === undefined ? undefined : diary.anxietyLogs.find(log => log.id === id);
    if (id !== undefined && !current && !expectedLog) throw new Error('这条焦虑记录已不存在');
    const replace = current && (!expectedLog || same(current, expectedLog));
    const now = new Date().toISOString();
    const log = validateAnxietyLog({
      occurredAt: now, worry: '', outcome: '', actions: [], helpfulActions: [],
      ...(expectedLog ?? current), ...input, id: replace ? id : makeId('anxiety'), updatedAt: now
    });
    const anxietyLogs = replace ? diary.anxietyLogs.map(item => item.id === id ? log : item) : [...diary.anxietyLogs, log];
    return { ...diary, anxietyLogs };
  });
}

export async function removeAnxietyLog(id, expectedLog) {
  identifier(id);
  return mutate(diary => {
    if (expectedLog && !same(diary.anxietyLogs.find(item => item.id === id), expectedLog)) throw new Error('这条焦虑记录有新的改动，请重新查看后再删除。');
    return { ...diary, anxietyLogs: diary.anxietyLogs.filter(item => item.id !== id) };
  });
}

export async function selectMascot(id) {
  if (!MASCOTS.includes(id)) throw new Error('没有找到这只小猪');
  return mutate(diary => ({ ...diary, mascot: id }));
}

function imageMime(bytes, fallback = '') {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const header = String.fromCharCode(...bytes.subarray(0, 32));
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif';
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp';
  if (header.slice(4, 8) === 'ftyp') {
    if (/avif|avis/.test(header.slice(8))) return 'image/avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(header.slice(8))) return 'image/heic';
  }
  return fallback.startsWith('image/') && fallback !== 'image/svg+xml' ? fallback : 'application/octet-stream';
}

export async function addPhoto(file) {
  if (!(file instanceof Blob) || !file.size || file.size > MAX_PHOTO_BYTES) throw new Error('请选择 6 MB 以内的照片');
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const mime = imageMime(header, file.type);
  if (!mime.startsWith('image/')) throw new Error('请选择 JPG、PNG、HEIC 或其他照片文件');
  const id = makeId('photo');
  const blob = new Blob([file], { type: mime });
  const db = await openDatabase();
  await transact(db, ['photos'], 'readwrite', (transaction, done) => {
    transaction.objectStore('photos').add({ id, blob });
    done();
  });
  return { id, uri: `idb-photo://${id}` };
}

export async function photoUrl(photo) {
  const id = identifier(photo?.id);
  if (objectUrls.has(id)) return objectUrls.get(id);
  const db = await openDatabase();
  const stored = await transact(db, ['photos'], 'readonly', (transaction, done, fail) => {
    onSuccess(transaction.objectStore('photos').get(id), value => done(value), fail);
  });
  if (!(stored?.blob instanceof Blob)) throw new Error('这张照片暂时无法读取');
  if (objectUrls.has(id)) return objectUrls.get(id);
  const url = URL.createObjectURL(stored.blob);
  objectUrls.set(id, url);
  return url;
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(parts.join(''));
}

function fromBase64(value) {
  let binary;
  try { binary = atob(value); } catch { throw new Error('备份照片数据损坏'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: imageMime(bytes) });
}

function parseBackup(raw) {
  if (new Blob([raw]).size > MAX_BACKUP_BYTES) throw new Error('请选择 40 MB 以内的完整日记备份');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('这不是有效的日记备份文件'); }
  const backup = record(value, '备份');
  if (backup.format !== 'sunflower-diary' || backup.version !== 1) throw new Error('这不是可识别的太阳花日记备份');
  timestamp(backup.exportedAt);
  const diary = validateDiary(backup.diary);
  let total = 0;
  const photos = list(backup.photos, 5000, '备份照片').map(value => {
    const photo = record(value, '备份照片');
    const id = identifier(photo.id);
    const base64 = text(photo.base64, Math.ceil(MAX_PHOTO_BYTES / 3) * 4, '备份照片');
    if (base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('备份照片数据损坏');
    const bytes = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (bytes > MAX_PHOTO_BYTES) throw new Error('备份中有一张照片超过 6 MB');
    total += bytes;
    return { id, base64 };
  });
  if (total > MAX_TOTAL_PHOTO_BYTES) throw new Error('备份中的照片合计超过 24 MB');
  const supplied = new Set(photos.map(photo => photo.id));
  const needed = new Set(allPhotos(diary).map(photo => photo.id));
  if (supplied.size !== photos.length || supplied.size !== needed.size || [...needed].some(id => !supplied.has(id))) throw new Error('备份中的照片不完整或重复');
  return { diary, photos };
}

export async function importBackup(file) {
  if (!(file instanceof Blob) || file.size > MAX_BACKUP_BYTES) throw new Error('请选择 40 MB 以内的太阳花日记备份');
  // Decode and validate everything BEFORE opening a readwrite transaction.
  const backup = parseBackup(await file.text());
  const replacement = new Map();
  const blobs = backup.photos.map(photo => {
    const id = makeId('photo');
    replacement.set(photo.id, { id, uri: `idb-photo://${id}` });
    return { id, blob: fromBase64(photo.base64) };
  });
  const restored = localDiary(mapPhotos(backup.diary, photo => replacement.get(photo.id)));
  const db = await openDatabase();
  return transact(db, ['state', 'photos'], 'readwrite', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    onSuccess(state.get('diary'), current => {
      // Keep the original snapshot, even if unreadable, for local recovery.
      if (current !== undefined) state.put(current, 'previous');
      const photos = transaction.objectStore('photos');
      for (const photo of blobs) photos.add(photo);
      state.put(restored, 'diary');
      resetSyncBase(state, fail);
      done(restored);
    }, fail);
  }).then(committed);
}

export async function exportBackup() {
  const db = await openDatabase();
  const snapshot = await transact(db, ['state', 'photos'], 'readonly', (transaction, done, fail) => {
    readStoredDiary(transaction.objectStore('state'), diary => {
      const references = allPhotos(diary);
      const photos = [];
      let total = 0;
      if (!references.length) done({ diary, photos });
      for (const photo of references) {
        onSuccess(transaction.objectStore('photos').get(photo.id), stored => {
          if (!(stored?.blob instanceof Blob)) throw new Error('有一张照片无法读取，暂时未生成备份');
          total += stored.blob.size;
          if (stored.blob.size > MAX_PHOTO_BYTES || total > MAX_TOTAL_PHOTO_BYTES) throw new Error('完整备份支持每张照片 6 MB、照片合计 24 MB');
          photos.push(stored);
          if (photos.length === references.length) done({ diary, photos });
        }, fail);
      }
    }, fail);
  });
  const photos = [];
  for (const photo of snapshot.photos) photos.push({ id: photo.id, base64: await toBase64(photo.blob) });
  const backup = { format: 'sunflower-diary', version: 1, exportedAt: new Date().toISOString(), diary: mapPhotos(snapshot.diary, photo => ({ id: photo.id, uri: `photo://${photo.id}` })), photos };
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  if (blob.size > MAX_BACKUP_BYTES) throw new Error('完整备份超过 40 MB，未生成文件');
  return blob;
}

/** Explicit recovery helper; no load failure ever silently replaces the diary. */
export async function restorePrevious() {
  const db = await openDatabase();
  return transact(db, ['state', 'photos'], 'readwrite', (transaction, done, fail) => {
    const state = transaction.objectStore('state');
    onSuccess(state.get('previous'), value => {
      if (value === undefined) throw new Error('没有找到上一版本机资料，请选择你导出的备份文件恢复。');
      const restored = localDiary(value);
      for (const photo of allPhotos(restored)) {
        onSuccess(transaction.objectStore('photos').get(photo.id), stored => {
          if (!(stored?.blob instanceof Blob)) throw new Error('上一版资料的照片不完整，请改用完整备份恢复。');
        }, fail);
      }
      onSuccess(state.get('diary'), current => {
        if (current !== undefined) state.put(current, 'unreadable');
        state.put(restored, 'diary');
        resetSyncBase(state, fail);
        done(restored);
      }, fail);
    }, fail);
  }).then(committed);
}
