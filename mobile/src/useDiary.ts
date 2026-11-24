import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { allPhotos, emptyDiary, isDateKey, makeId, mapDiaryPhotos, MAX_BACKUP_BYTES, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES, parseBackup, utf8ByteLength, validateDiaryData, validateDraft } from './domain';
import type { DiaryBackup, DiaryData, EntryDraft, MascotId, Photo } from './types';

const STORAGE_KEY = 'sunflower-diary.v1';
const PREVIOUS_KEY = 'sunflower-diary.previous.v1';
const UNREADABLE_KEY = 'sunflower-diary.unreadable.v1';
let operationQueue: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

function photoDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error('当前环境无法使用手机本机存储');
  return `${FileSystem.documentDirectory}sunflower-photos/`;
}

function photoUri(id: string): string {
  return `${photoDirectory()}${id}.image`;
}

function resolveLocalPhotos(data: DiaryData): DiaryData {
  // iOS may change the sandbox root after restoring a device. IDs remain stable.
  return mapDiaryPhotos(data, photo => ({ id: photo.id, uri: photoUri(photo.id) }));
}

async function ensurePhotoDirectory(): Promise<void> {
  await FileSystem.makeDirectoryAsync(photoDirectory(), { intermediates: true });
}

/** Copy picker files out of its temporary cache before attaching them to a draft. */
export async function persistPhoto(uri: string): Promise<Photo> {
  if (!uri.startsWith('file://') && !uri.startsWith('content://')) throw new Error('只能添加手机上的照片');
  await ensurePhotoDirectory();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error('这张照片无法读取，请重新选择');
  if (info.size > MAX_PHOTO_BYTES) throw new Error('这张照片超过 6 MB，请选择较小的照片');
  const photo = { id: makeId('photo'), uri: '' };
  photo.uri = photoUri(photo.id);
  await FileSystem.copyAsync({ from: uri, to: photo.uri });
  return photo;
}

export function useDiary() {
  const [data, setData] = useState<DiaryData>(emptyDiary);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const dataRef = useRef(data);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);

  const publish = useCallback((next: DiaryData) => {
    dataRef.current = next;
    if (mountedRef.current) setData(next);
  }, []);

  const retryLoad = useCallback(() => serial(async () => {
    loadedRef.current = false;
    if (mountedRef.current) { setReady(false); setError(null); setRecoveryAvailable(false); }
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const next = stored === null ? emptyDiary() : resolveLocalPhotos(validateDiaryData(JSON.parse(stored)));
      await ensurePhotoDirectory();
      publish(next);
      loadedRef.current = true;
      if (mountedRef.current) setReady(true);
    } catch {
      try {
        const previous = await AsyncStorage.getItem(PREVIOUS_KEY);
        if (previous !== null) {
          validateDiaryData(JSON.parse(previous));
          if (mountedRef.current) setRecoveryAvailable(true);
        }
      } catch {
        // An unreadable recovery copy must never cause an empty diary to be saved.
      }
      if (mountedRef.current) setError('本机资料暂时无法读取，原档已保留。请重试，不要卸载 App。');
    }
  }), [publish]);

  const restorePrevious = useCallback(() => serial(async () => {
    const previous = await AsyncStorage.getItem(PREVIOUS_KEY);
    if (previous === null) throw new Error('没有找到可恢复的上一版本机资料');
    const restored = resolveLocalPhotos(validateDiaryData(JSON.parse(previous)));
    const original = await AsyncStorage.getItem(STORAGE_KEY);
    if (original !== null) await AsyncStorage.setItem(UNREADABLE_KEY, original);
    await ensurePhotoDirectory();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
    publish(restored);
    loadedRef.current = true;
    if (mountedRef.current) { setReady(true); setError(null); setRecoveryAvailable(false); }
  }), [publish]);

  useEffect(() => {
    mountedRef.current = true;
    void retryLoad();
    return () => { mountedRef.current = false; };
  }, [retryLoad]);

  const assertLoaded = useCallback(() => {
    if (!loadedRef.current) throw new Error('资料尚未成功读取，暂时无法写入。请先重试读取。');
  }, []);

  const commit = useCallback(async (next: DiaryData) => {
    assertLoaded();
    const checked = validateDiaryData(next);
    // Preserve the preceding snapshot as a local recovery copy. A failed write
    // never updates React state or clears the user's unsaved editor contents.
    await AsyncStorage.setItem(PREVIOUS_KEY, JSON.stringify(dataRef.current));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    publish(checked);
  }, [assertLoaded, publish]);

  const saveEntry = useCallback((input: EntryDraft, id?: string) => serial(async () => {
    assertLoaded();
    const content = validateDraft(input);
    if (!content.text.trim() && !content.photos.length) throw new Error('写一句话或加一张照片，就可以保存了');
    const now = new Date().toISOString();
    const existing = id ? dataRef.current.entries.find(item => item.id === id) : undefined;
    if (id && !existing) throw new Error('这条记录已不存在，请重新打开');
    const entry = { ...content, id: existing?.id ?? makeId('entry'), createdAt: existing?.createdAt ?? now, updatedAt: now };
    const entries = existing ? dataRef.current.entries.map(item => item.id === id ? entry : item) : [...dataRef.current.entries, entry];
    await commit({ ...dataRef.current, entries, draft: id ? dataRef.current.draft : null });
  }), [assertLoaded, commit]);

  const deleteEntry = useCallback((id: string) => serial(async () => {
    await commit({ ...dataRef.current, entries: dataRef.current.entries.filter(item => item.id !== id) });
  }), [commit]);

  const saveCountdown = useCallback((input: { title: string; date: string }, id?: string) => serial(async () => {
    assertLoaded();
    const title = input.title.trim();
    if (!title || title.length > 80 || !isDateKey(input.date)) throw new Error('请填写 80 字内的名称和有效日期');
    if (id && !dataRef.current.countdowns.some(item => item.id === id)) throw new Error('这个倒数日已不存在');
    const countdown = { id: id ?? makeId('countdown'), title, date: input.date };
    const countdowns = id ? dataRef.current.countdowns.map(item => item.id === id ? countdown : item) : [...dataRef.current.countdowns, countdown];
    await commit({ ...dataRef.current, countdowns });
  }), [assertLoaded, commit]);

  const deleteCountdown = useCallback((id: string) => serial(async () => {
    await commit({ ...dataRef.current, countdowns: dataRef.current.countdowns.filter(item => item.id !== id) });
  }), [commit]);

  const selectMascot = useCallback((mascot: MascotId) => serial(async () => {
    await commit({ ...dataRef.current, mascot });
  }), [commit]);

  const saveDraft = useCallback((draft: EntryDraft | null) => serial(async () => {
    await commit({ ...dataRef.current, draft: draft === null ? null : validateDraft(draft) });
  }), [commit]);

  const exportBackup = useCallback(async () => {
    const snapshot = await serial(async () => { assertLoaded(); return JSON.parse(JSON.stringify(dataRef.current)) as DiaryData; });
    if (!(await Sharing.isAvailableAsync())) throw new Error('这台设备暂时无法打开“存储到文件”');
    let total = 0;
    const photos: DiaryBackup['photos'] = [];
    for (const photo of allPhotos(snapshot)) {
      const info = await FileSystem.getInfoAsync(photo.uri);
      if (!info.exists || info.isDirectory) throw new Error('有一张已保存的照片无法读取，暂时未生成备份');
      total += info.size;
      if (info.size > MAX_PHOTO_BYTES || total > MAX_TOTAL_PHOTO_BYTES) throw new Error('这一版完整备份支持每张照片 6 MB、照片合计 24 MB');
      photos.push({ id: photo.id, base64: await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 }) });
    }
    const backup: DiaryBackup = { format: 'sunflower-diary', version: 1, exportedAt: new Date().toISOString(), diary: mapDiaryPhotos(snapshot, photo => ({ id: photo.id, uri: `photo://${photo.id}` })), photos };
    const raw = JSON.stringify(backup);
    if (utf8ByteLength(raw) > MAX_BACKUP_BYTES) throw new Error('备份超过这一版的 40 MB 限制');
    if (!FileSystem.cacheDirectory) throw new Error('当前环境无法生成备份文件');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uri = `${FileSystem.cacheDirectory}sunflower-diary-${stamp}.json`;
    await FileSystem.writeAsStringAsync(uri, raw, { encoding: FileSystem.EncodingType.UTF8 });
    try {
      await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: '保存太阳花日记备份' });
    } finally {
      // A canceled share is not an error, and never means a backup was saved.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  }, [assertLoaded]);

  const importBackup = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (!info.exists || info.isDirectory || info.size > MAX_BACKUP_BYTES) throw new Error('请选择 40 MB 以内的太阳花日记备份');
    const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
    const backup = parseBackup(raw);
    await serial(async () => {
      assertLoaded();
      await ensurePhotoDirectory();
      const replacements = new Map<string, Photo>();
      const created: string[] = [];
      let committed = false;
      try {
        // Fresh filenames keep an interrupted import from overwriting existing photos.
        for (const photo of backup.photos) {
          const id = makeId('photo');
          const uri = photoUri(id);
          created.push(uri);
          await FileSystem.writeAsStringAsync(uri, photo.base64, { encoding: FileSystem.EncodingType.Base64 });
          replacements.set(photo.id, { id, uri });
        }
        const restored = mapDiaryPhotos(backup.diary, photo => replacements.get(photo.id)!);
        await commit(restored);
        committed = true;
      } finally {
        if (!committed) await Promise.all(created.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
      }
    });
  }, [assertLoaded, commit]);

  return { data, ready, error, recoveryAvailable, restorePrevious, saveEntry, deleteEntry, saveCountdown, deleteCountdown, selectMascot, saveDraft, exportBackup, importBackup, retryLoad };
}
