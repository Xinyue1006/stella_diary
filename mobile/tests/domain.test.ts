/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { anxietyLogsForReview, countdownDays, emptyDiary, entriesForDay, isDateKey, localDateKey, MAX_BACKUP_BYTES, parseBackup, recentHelpfulActions, utf8ByteLength, validateDiaryData } from '../src/domain';
import type { AnxietyLog, DiaryBackup, Entry } from '../src/types';

function entry(id: string, occurredAt: string): Entry {
  return { id, occurredAt, text: '记得的一件事', photos: [], createdAt: '2026-11-24T10:00:00.000Z', updatedAt: '2026-11-24T10:00:00.000Z' };
}

function backup(): DiaryBackup {
  return { format: 'sunflower-diary', version: 1, exportedAt: '2026-11-24T10:00:00.000Z', diary: emptyDiary(), photos: [] };
}

const checkIn: AnxietyLog = {
  id: 'check_in', intensity: 2, occurredAt: '2026-11-24T10:00:00.000Z', updatedAt: '2026-11-25T10:00:00.000Z',
  worry: '明天要发言', outcome: '讲完了', actions: ['散步', '聊天'], helpfulActions: ['散步'],
};

test('old backups open without anxiety logs and new backups retain the original event and follow-up', () => {
  const file = backup();
  const { anxietyLogs: _logs, ...legacy } = file.diary;
  assert.deepEqual(parseBackup(JSON.stringify({ ...file, diary: legacy })).diary.anxietyLogs, []);
  file.diary.anxietyLogs = [checkIn];
  assert.deepEqual(parseBackup(JSON.stringify(file)).diary.anxietyLogs, [checkIn]);
  for (const row of [{ ...checkIn, helpfulActions: ['喝水'] }, { ...checkIn, actions: ['散步', '散步'] },
    { ...checkIn, intensity: 0 }, { ...checkIn, outcome: 'x'.repeat(50001) }, { ...checkIn, actions: [' '.repeat(2)] },
    { ...checkIn, actions: ['x'.repeat(121)] }, { ...checkIn, actions: Array.from({ length: 33 }, (_, i) => String(i)) }]) {
    assert.throws(() => validateDiaryData({ ...legacy, anxietyLogs: [row] }));
  }
  assert.throws(() => validateDiaryData({ ...legacy, anxietyLogs: null }));
  assert.throws(() => validateDiaryData({ ...legacy, anxietyLogs: [checkIn, checkIn] }));
});

test('recall excludes the current log and only uses explicitly helpful actions, newest marks first', () => {
  const newer = { ...checkIn, id: 'newer', updatedAt: '2026-11-26T10:00:00.000Z', actions: ['喝水', '散步'], helpfulActions: ['喝水', '散步'] };
  assert.deepEqual(recentHelpfulActions([checkIn, newer]), ['喝水', '散步']);
  assert.deepEqual(recentHelpfulActions([checkIn, newer], newer.id), ['散步']);
  assert.deepEqual(recentHelpfulActions([{ ...checkIn, helpfulActions: [] }]), []);
});

test('review filters by the local event day and searches worries, later updates, methods and intensity', () => {
  const day = localDateKey(checkIn.occurredAt);
  assert.deepEqual(anxietyLogsForReview([checkIn], day), [checkIn]);
  assert.deepEqual(anxietyLogsForReview([checkIn], '2000-01-01'), []);
  for (const term of ['焦虑', '有点难受', '发言', '讲完', '聊天']) {
    assert.deepEqual(anxietyLogsForReview([checkIn], '2000-01-01', term), [checkIn]);
  }
});

test('retroactive entries use the event time, not their creation time, to order a day', () => {
  const morning = new Date(2026, 10, 24, 9).toISOString();
  const evening = new Date(2026, 10, 24, 20).toISOString();
  const yesterday = new Date(2026, 10, 23, 20).toISOString();
  const sorted = entriesForDay([entry('evening', evening), entry('previous', yesterday), entry('morning', morning)], '2026-11-24');
  assert.deepEqual(sorted.map(item => item.id), ['morning', 'evening']);
});

test('calendar keys and countdowns stay local and do not round by elapsed hours', () => {
  const night = new Date(2026, 10, 24, 23, 59);
  assert.equal(localDateKey(night), '2026-11-24');
  assert.equal(countdownDays('2026-11-25', night), 1);
  assert.equal(countdownDays('2026-11-24', night), 0);
  assert.equal(countdownDays('2026-11-23', night), -1);
  assert.equal(countdownDays('2026-03-09', new Date(2026, 2, 8, 23)), 1);
});

test('date validation rejects impossible leap days and unexpected fields', () => {
  assert.equal(isDateKey('2024-02-29'), true);
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2026-04-31'), false);
  assert.equal(isDateKey('2026-13-01'), false);
  assert.throws(() => validateDiaryData({ ...emptyDiary(), mascot: 'unknown' }));
  assert.throws(() => validateDiaryData({ ...emptyDiary(), schemaVersion: 2 }));
  assert.throws(() => validateDiaryData({ ...emptyDiary(), entries: [entry('bad_date', '2026-02-30T09:00:00.000Z')] }), /时间无效/);
});

test('backup limits use actual UTF-8 bytes for Chinese and emoji, not JS character count', () => {
  assert.equal(utf8ByteLength('abc日🌻'), 10);
  assert.equal(utf8ByteLength('中文'), 6);
  const oversized = '日'.repeat(Math.floor(MAX_BACKUP_BYTES / 3) + 1);
  assert.ok(oversized.length < MAX_BACKUP_BYTES);
  assert.throws(() => parseBackup(oversized), /超过 40 MB/);
});

test('a complete backup includes photos from both entries and the unsaved draft', () => {
  const file = backup();
  file.diary.entries = [{ ...entry('one', '2026-11-24T09:00:00.000Z'), photos: [{ id: 'photo_one', uri: 'photo://photo_one' }] }];
  file.diary.draft = { text: '', occurredAt: '2026-11-24T10:00:00.000Z', photos: [{ id: 'photo_two', uri: 'photo://photo_two' }] };
  file.photos = [{ id: 'photo_one', base64: 'aGVsbG8=' }, { id: 'photo_two', base64: 'd29ybGQ=' }];
  assert.equal(parseBackup(JSON.stringify(file)).photos.length, 2);
  file.photos.pop();
  assert.throws(() => parseBackup(JSON.stringify(file)), /照片不完整/);
});

test('version-one backups preserve tagged anniversaries and untagged countdowns', () => {
  const file = backup();
  file.diary.countdowns = [
    { id: 'upcoming', title: 'Trip', date: '2028-06-15' },
    { id: 'first_day', title: 'First day', date: '2024-02-29', kind: 'anniversary' },
  ];
  assert.deepEqual(parseBackup(JSON.stringify(file)).diary.countdowns, file.diary.countdowns);
  assert.throws(() => validateDiaryData({
    ...file.diary, countdowns: [{ ...file.diary.countdowns[1], kind: 'invalid' }],
  }), /日子类型无效/);
});

test('restore refuses duplicate records, path traversal IDs and damaged photo payloads', () => {
  const file = backup();
  file.diary.entries = [entry('same', '2026-11-24T09:00:00.000Z'), entry('same', '2026-11-24T10:00:00.000Z')];
  assert.throws(() => parseBackup(JSON.stringify(file)), /重复记录/);
  file.diary.entries = [{ ...entry('../escape', '2026-11-24T09:00:00.000Z') }];
  assert.throws(() => parseBackup(JSON.stringify(file)), /编号无效/);
  file.diary.entries = [{ ...entry('valid', '2026-11-24T09:00:00.000Z'), photos: [{ id: 'photo', uri: 'photo://photo' }] }];
  file.photos = [{ id: 'photo', base64: '%%%=' }];
  assert.throws(() => parseBackup(JSON.stringify(file)), /照片数据损坏/);
  assert.throws(() => parseBackup('{broken'), /有效的日记备份/);
});
