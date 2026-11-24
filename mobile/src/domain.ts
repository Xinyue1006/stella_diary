import type { AnxietyLog, Countdown, DiaryBackup, DiaryData, Entry, EntryDraft, MascotId, Photo, Todo } from './types';

export const MASCOTS: readonly MascotId[] = ['dinosaur', 'ladybug', 'butterfly', 'cow', 'bee', 'bunny'];
// A self-contained backup is deliberately bounded so it can be restored on a phone.
export const MAX_BACKUP_BYTES = 40 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_TOTAL_PHOTO_BYTES = 24 * 1024 * 1024;
export const MAX_ENTRY_PHOTOS = 12;
export const MAX_TEXT_LENGTH = 50000;
export const MAX_ACTION_COUNT = 32;
export const MAX_ACTION_LENGTH = 120;
export const INTENSITY_LABELS = { 1: '有一点', 2: '有点难受', 3: '很难受' } as const;
export const COMPARISON_LABELS = { less: '比想象中轻一些', same: '和想象中差不多', more: '比想象中难一些', unsure: '还说不清' } as const;
export const MAX_TODO_TEXT = 500;

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

export function emptyDiary(): DiaryData {
  return { schemaVersion: 1, entries: [], anxietyLogs: [], countdowns: [], todos: [], mascot: 'dinosaur', draft: null };
}

export function makeId(prefix = 'item'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function localDateKey(date: Date | string = new Date()): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (!Number.isFinite(value.getTime())) throw new Error('日期无效');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function tomorrowKey(now = new Date()): string {
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
}

export function nextFollowUp(logs: readonly AnxietyLog[], today: string): AnxietyLog | undefined {
  return logs.filter(log => log.remindOn && log.remindOn <= today)
    .sort((a, b) => a.remindOn!.localeCompare(b.remindOn!) || a.occurredAt.localeCompare(b.occurredAt))[0];
}

/** Calendar-day difference, unaffected by the time of day or daylight-saving changes. */
export function countdownDays(dateKey: string, now = new Date()): number {
  if (!isDateKey(dateKey)) throw new Error('倒数日日期无效');
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export function entriesForDay(entries: readonly Entry[], day: string): Entry[] {
  return entries.filter(entry => localDateKey(entry.occurredAt) === day)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.createdAt.localeCompare(b.createdAt));
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, max: number, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.length)) throw new Error(`${label}格式无效`);
  return value;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw new Error('记录编号无效');
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('记录时间无效');
  }
  return value;
}

function list(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label}数量无效`);
  return value;
}

function photo(value: unknown): Photo {
  const item = record(value, '照片');
  return { id: identifier(item.id), uri: boundedString(item.uri, 4096, '照片位置') };
}

function draft(value: unknown): EntryDraft {
  const item = record(value, '草稿');
  const photos = list(item.photos, MAX_ENTRY_PHOTOS, '照片').map(photo);
  if (new Set(photos.map(item => item.id)).size !== photos.length) throw new Error('同一条记录有重复照片');
  if (item.kind !== undefined && item.kind !== 'good') throw new Error('日记类型无效');
  return { ...(item.kind === 'good' ? { kind: 'good' as const } : {}),
    text: boundedString(item.text, MAX_TEXT_LENGTH, '日记文字', true), occurredAt: timestamp(item.occurredAt), photos };
}

export function validateDraft(value: unknown): EntryDraft {
  return draft(value);
}

function actionList(value: unknown): string[] {
  const names = list(value, MAX_ACTION_COUNT, '应对方法').map(item => boundedString(item, MAX_ACTION_LENGTH, '方法名称'));
  if (names.some(name => !name.trim()) || new Set(names).size !== names.length) throw new Error('方法名称为空或重复');
  return names;
}

function anxietyLog(value: unknown): AnxietyLog {
  const row = record(value, '焦虑记录');
  const { intensity } = row;
  if (intensity !== 1 && intensity !== 2 && intensity !== 3) throw new Error('焦虑程度无效');
  const actions = actionList(row.actions);
  const helpfulActions = actionList(row.helpfulActions);
  if (helpfulActions.some(name => !actions.includes(name))) throw new Error('有效的方法需要先记入尝试过的方法');
  if (row.remindOn !== undefined && !isDateKey(row.remindOn)) throw new Error('回访日期无效');
  const comparison = row.comparison;
  if (comparison !== undefined && comparison !== 'less' && comparison !== 'same' && comparison !== 'more' && comparison !== 'unsure') throw new Error('回顾选项无效');
  return { id: identifier(row.id), occurredAt: timestamp(row.occurredAt), updatedAt: timestamp(row.updatedAt), intensity,
    ...(row.remindOn ? { remindOn: row.remindOn } : {}), ...(comparison ? { comparison } : {}),
    worry: boundedString(row.worry, MAX_TEXT_LENGTH, '担心的事', true),
    outcome: boundedString(row.outcome, MAX_TEXT_LENGTH, '后来发生的事', true), actions, helpfulActions };
}

export function recentHelpfulActions(logs: readonly AnxietyLog[], excludeId?: string): string[] {
  const recent = logs.filter(log => log.id !== excludeId && log.helpfulActions.length)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...new Set(recent.flatMap(log => log.helpfulActions))].slice(0, 3);
}

export function anxietyLogsForReview(logs: readonly AnxietyLog[], day: string, query = ''): AnxietyLog[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return logs.filter(log => localDateKey(log.occurredAt) === day).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return logs.filter(log => ['焦虑', INTENSITY_LABELS[log.intensity], log.worry, log.outcome, log.comparison ? COMPARISON_LABELS[log.comparison] : '', ...log.actions]
    .some(text => text.toLocaleLowerCase().includes(term))).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function validateDiaryData(value: unknown): DiaryData {
  const data = record(value, '日记');
  if (data.schemaVersion !== 1) throw new Error('无法识别这个版本的日记资料');
  if (!MASCOTS.includes(data.mascot as MascotId)) throw new Error('小猪款式无效');
  const entries = list(data.entries, 20000, '日记').map(value => {
    const item = record(value, '日记');
    const content = draft(item);
    if (!content.text.trim() && !content.photos.length) throw new Error('日记内容为空');
    return { ...content, id: identifier(item.id), createdAt: timestamp(item.createdAt), updatedAt: timestamp(item.updatedAt) };
  });
  const countdowns: Countdown[] = list(data.countdowns, 2000, '倒数日').map(value => {
    const item = record(value, '倒数日');
    const title = boundedString(item.title, 80, '倒数日名称');
    if (!title.trim() || !isDateKey(item.date)) throw new Error('倒数日名称或日期无效');
    if (item.kind !== undefined && item.kind !== 'anniversary') throw new Error('日子类型无效');
    const date = { id: identifier(item.id), title, date: item.date };
    return item.kind === 'anniversary' ? { ...date, kind: 'anniversary' } : date;
  });
  const anxietyLogs = list(data.anxietyLogs === undefined ? [] : data.anxietyLogs, 20000, '焦虑记录').map(anxietyLog);
  const todos: Todo[] = list(data.todos === undefined ? [] : data.todos, 20000, '随手清单').map(value => {
    const row = record(value, '清单项');
    const text = boundedString(row.text, MAX_TODO_TEXT, '清单内容');
    if (!text.trim() || typeof row.done !== 'boolean') throw new Error('清单项无效');
    return { id: identifier(row.id), text, done: row.done, createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt) };
  });
  if ([entries, countdowns, anxietyLogs, todos].some(rows => new Set(rows.map(item => item.id)).size !== rows.length)) {
    throw new Error('资料含有重复记录编号');
  }
  return { schemaVersion: 1, entries, anxietyLogs, countdowns, todos, mascot: data.mascot as MascotId, draft: data.draft === null ? null : draft(data.draft) };
}

export function allPhotos(data: DiaryData): Photo[] {
  const photos = [...data.entries.flatMap(entry => entry.photos), ...(data.draft?.photos ?? [])];
  return Array.from(new Map(photos.map(photo => [photo.id, photo])).values());
}

export function mapDiaryPhotos(data: DiaryData, map: (photo: Photo) => Photo): DiaryData {
  return { ...data, entries: data.entries.map(entry => ({ ...entry, photos: entry.photos.map(map) })), draft: data.draft ? { ...data.draft, photos: data.draft.photos.map(map) } : null };
}

export function parseBackup(raw: string): DiaryBackup {
  if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) throw new Error('备份超过 40 MB，无法在这一版恢复');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('这不是有效的日记备份文件'); }
  const backup = record(parsed, '备份');
  if (backup.format !== 'sunflower-diary' || backup.version !== 1) throw new Error('这不是可识别的太阳花日记备份');
  const diary = validateDiaryData(backup.diary);
  let totalBytes = 0;
  const photos = list(backup.photos, 5000, '备份照片').map(value => {
    const item = record(value, '备份照片');
    const id = identifier(item.id);
    const base64 = boundedString(item.base64, Math.ceil(MAX_PHOTO_BYTES / 3) * 4, '备份照片');
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('备份照片数据损坏');
    totalBytes += base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    return { id, base64 };
  });
  if (totalBytes > MAX_TOTAL_PHOTO_BYTES) throw new Error('备份照片合计超过 24 MB，无法在这一版恢复');
  const photoIds = new Set(photos.map(item => item.id));
  const references = new Set(allPhotos(diary).map(item => item.id));
  if (photoIds.size !== photos.length || photoIds.size !== references.size || [...references].some(id => !photoIds.has(id))) {
    throw new Error('备份中的照片不完整或重复');
  }
  return { format: 'sunflower-diary', version: 1, exportedAt: timestamp(backup.exportedAt), diary, photos };
}
