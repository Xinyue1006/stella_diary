/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { countdownDays, emptyDiary, entriesForDay, isDateKey, localDateKey, MAX_BACKUP_BYTES, parseBackup, utf8ByteLength, validateDiaryData } from '../src/domain';
import type { DiaryBackup, Entry } from '../src/types';

function entry(id: string, occurredAt: string): Entry {
  return { id, occurredAt, text: '记得的一件事', photos: [], createdAt: '2026-11-24T10:00:00.000Z', updatedAt: '2026-11-24T10:00:00.000Z' };
}

function backup(): DiaryBackup {
  return { format: 'sunflower-diary', version: 1, exportedAt: '2026-11-24T10:00:00.000Z', diary: emptyDiary(), photos: [] };
}

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
