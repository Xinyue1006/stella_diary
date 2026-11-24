// Sites dispatch supplies the authenticated visitor header. User records and
// immutable photo objects live in a private R2 namespace for that visitor.
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};
const photoLimit = 6 * 1024 * 1024;
const snapshotLimit = 16 * 1024 * 1024;
const identifier = /^[A-Za-z0-9_-]{1,120}$/;
const mascots = ['dinosaur', 'ladybug', 'butterfly', 'cow', 'bee', 'bunny'];

class DiaryRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...privateHeaders, ...headers } });
}

async function digestHex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function boundedBody(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new DiaryRequestError(413, '文件超出同步大小限制');
  if (!request.body) throw new DiaryRequestError(400, '缺少内容');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new DiaryRequestError(413, '文件超出同步大小限制');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new DiaryRequestError(400, '缺少内容');
  if (chunks.length === 1) return chunks[0];
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function valid(condition) {
  if (!condition) throw new DiaryRequestError(422, '同步资料格式无效');
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validId(value) {
  return typeof value === 'string' && identifier.test(value);
}

function validateSnapshot(diary) {
  valid(diary?.schemaVersion === 1 && mascots.includes(diary.mascot));
  valid(Array.isArray(diary.entries) && diary.entries.length <= 20000);
  valid(Array.isArray(diary.countdowns) && diary.countdowns.length <= 2000);
  const photoIds = new Set();
  function validateContent(value) {
    valid(typeof value?.text === 'string' && value.text.length <= 50000 && validTimestamp(value.occurredAt));
    valid(Array.isArray(value.photos) && value.photos.length <= 12);
    const entryPhotos = new Set();
    for (const photo of value.photos) {
      valid(validId(photo?.id) && typeof photo.uri === 'string' && photo.uri.length > 0 && photo.uri.length <= 4096 && !entryPhotos.has(photo.id));
      entryPhotos.add(photo.id);
      photoIds.add(photo.id);
    }
  }
  const entries = new Set();
  for (const entry of diary.entries) {
    validateContent(entry);
    valid(validId(entry.id) && !entries.has(entry.id) && validTimestamp(entry.createdAt) && validTimestamp(entry.updatedAt));
    valid(entry.text.trim() || entry.photos.length);
    entries.add(entry.id);
  }
  if (diary.draft !== null) validateContent(diary.draft);
  const countdowns = new Set();
  for (const item of diary.countdowns) {
    valid(validId(item?.id) && !countdowns.has(item.id) && typeof item.title === 'string' && item.title.trim() && item.title.length <= 80);
    valid(item.kind === undefined || item.kind === 'anniversary' || item.kind === 'countdown');
    valid(typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    valid(item.date >= '1900-01-01' && item.date <= '2200-12-31' && validTimestamp(item.date + 'T00:00:00.000Z'));
    countdowns.add(item.id);
  }
  return photoIds;
}

async function confirmPhotos(bucket, prefix, photoIds) {
  if (!photoIds.size) return;
  const missing = () => new DiaryRequestError(422, '请先同步日记里的所有照片');
  // Check a handful of references directly. For photo-heavy diaries, scan a
  // paginated owner-only key listing instead of doing a subrequest per photo.
  if (photoIds.size <= 6) {
    const records = await Promise.all([...photoIds].map(id => bucket.head(prefix + id)));
    if (records.some(record => !record)) throw missing();
    return;
  }
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of page.objects) photoIds.delete(object.key.slice(prefix.length));
    if (!photoIds.size) return;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  throw missing();
}

// The R2 file already contains validated JSON. Stream its contents inside the
// response envelope so a large diary needs no second parse or serialization.
function snapshotResponse(current, owner) {
  const encoder = new TextEncoder();
  const reader = current.body.getReader();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"owner":' + JSON.stringify(owner) + ',"version":' + JSON.stringify(current.etag) + ',"diary":'));
    },
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) {
        controller.enqueue(encoder.encode('}'));
        controller.close();
      } else {
        controller.enqueue(chunk.value);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { headers: { ...privateHeaders, 'Content-Type': 'application/json', ETag: current.httpEtag } });
}

async function snapshot(request, bucket, prefix, owner) {
  const key = prefix + 'diary.json';
  if (request.method === 'GET') {
    const knownTag = request.headers.get('If-None-Match');
    const conditional = request.headers.get('X-Diary-Owner') === owner && /^"[a-f0-9]{32}"$/.test(knownTag ?? '');
    const current = await bucket.get(key, conditional ? { onlyIf: new Headers({ 'If-None-Match': knownTag }) } : undefined);
    if (!current) return json({ owner, version: null, diary: null });
    if (!current.body) return new Response(null, { status: 304, headers: { ...privateHeaders, ETag: current.httpEtag } });
    return snapshotResponse(current, owner);
  }
  if (request.method !== 'PUT') return json({ error: '不支持此操作' }, 405, { Allow: 'GET, PUT' });
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new DiaryRequestError(415, '日记需要使用 JSON 格式');
  }
  const bytes = await boundedBody(request, snapshotLimit);
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new DiaryRequestError(400, '日记 JSON 格式无效'); }
  valid(payload && (payload.version === null || (typeof payload.version === 'string' && /^[a-f0-9]{32}$/.test(payload.version))));
  const photoIds = validateSnapshot(payload.diary);
  // Older installed shells drop the kind when they send a full snapshot.
  // Preserve it for existing IDs, while allowing deletes and edits from those devices.
  if (payload.version && request.headers.get('X-Diary-Day-Kinds') !== '1' && payload.diary.countdowns.length) {
    const previous = await bucket.get(key, { onlyIf: { etagMatches: payload.version } });
    if (!previous?.body) throw new DiaryRequestError(409, '请重新同步最新的日记');
    const anniversaries = new Set((await previous.json()).countdowns.filter(day => day.kind === 'anniversary').map(day => day.id));
    for (const day of payload.diary.countdowns) {
      if (anniversaries.has(day.id)) day.kind = 'anniversary';
    }
  }
  await confirmPhotos(bucket, prefix + 'photos/', photoIds);
  const onlyIf = payload.version === null
    ? new Headers({ 'If-None-Match': '*' })
    : new Headers({ 'If-Match': '"' + payload.version + '"' });
  const stored = await bucket.put(key, JSON.stringify(payload.diary), {
    onlyIf, httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
  });
  if (!stored) throw new DiaryRequestError(409, '另一台设备刚刚更新了日记，请重新合并');
  return json({ version: stored.etag });
}

async function photoObject(request, bucket, key) {
  if (request.method === 'PUT') {
    const bytes = await boundedBody(request, photoLimit);
    const hash = await digestHex(bytes);
    const inputType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() || '';
    const type = /^image\/[a-z0-9.+-]+$/.test(inputType) && inputType !== 'image/svg+xml' ? inputType : 'application/octet-stream';
    const result = await bucket.put(key, bytes, {
      onlyIf: new Headers({ 'If-None-Match': '*' }),
      customMetadata: { sha256: hash },
      httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
    });
    if (!result && (await bucket.head(key))?.customMetadata?.sha256 !== hash) {
      throw new DiaryRequestError(409, '照片编号已被其他照片使用');
    }
    return new Response(null, { status: 204, headers: privateHeaders });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: '不支持此操作' }, 405, { Allow: 'GET, HEAD, PUT' });
  const object = request.method === 'HEAD' ? await bucket.head(key) : await bucket.get(key);
  if (!object) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(object.body ?? null, { headers: {
    ...privateHeaders, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Content-Length': String(object.size), 'Content-Security-Policy': "default-src 'none'; sandbox",
    ETag: object.httpEtag, 'X-Photo-SHA256': object.customMetadata?.sha256 ?? '',
  } });
}

export async function handleApi(request, env) {
  try {
    const identity = request.headers.get('oai-authenticated-user-id');
    if (!identity?.trim()) throw new DiaryRequestError(401, '请先登录你的 ChatGPT 账号');
    const url = new URL(request.url);
    if (request.method === 'PUT') {
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
        throw new DiaryRequestError(403, '请在日记网页内进行同步');
      }
    }
    const owner = await digestHex(new TextEncoder().encode(identity));
    const expected = request.headers.get('X-Diary-Owner');
    if ((expected !== null || request.method === 'PUT') && expected !== owner) {
      throw new DiaryRequestError(403, '当前登录的账号已改变，请重新打开日记');
    }
    const prefix = 'v1/users/' + owner + '/';
    if (url.pathname === '/api/sync') return await snapshot(request, env.BUCKET, prefix, owner);
    const photo = /^\/api\/photos\/([A-Za-z0-9_-]{1,120})$/.exec(url.pathname);
    if (photo) return await photoObject(request, env.BUCKET, prefix + 'photos/' + photo[1]);
    return json({ error: '没有找到此位置' }, 404);
  } catch (error) {
    if (error instanceof DiaryRequestError) return json({ error: error.message }, error.status);
    return json({ error: '云端暂时无法连接，请稍后再试' }, 503);
  }
}
