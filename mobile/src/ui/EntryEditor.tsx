import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Entry, EntryDraft } from '../types';
import { persistPhoto } from '../useDiary';
import { ActionButton, Icon } from './components';
import { dayKey, parseDay } from './dates';
import { useDiaryContext } from './diaryContext';
import { BackPage } from './BackPage';
import { colors } from './theme';

function blankDraft(date?: string): EntryDraft {
  const now = new Date();
  if (date && date !== dayKey(now)) {
    const selected = parseDay(date);
    selected.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return { text: '', occurredAt: selected.toISOString(), photos: [] };
  }
  return { text: '', occurredAt: now.toISOString(), photos: [] };
}

export function EntryEditor({ entry, date, onClose, onSaved }: { entry?: Entry; date?: string; onClose: () => void; onSaved: (occurredAt: string) => void }) {
  const { data, saveDraft, saveEntry } = useDiaryContext();
  const [draft, setDraft] = useState<EntryDraft>(() => entry ? { text: entry.text, occurredAt: entry.occurredAt, photos: entry.photos } : data.draft && (data.draft.text.trim() || data.draft.photos.length) ? data.draft : blankDraft(date));
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [status, setStatus] = useState(entry ? '修改后点「保存」' : '草稿会自动保存在手机');
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  const stopped = useRef(false);
  const initial = useRef(draft);
  const action = useRef<'idle' | 'saving' | 'closing' | 'picking'>('idle');
  const confirmingExit = useRef(false);
  const mounted = useRef(true);

  function cancelTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelTimer(); };
  }, []);

  function beginAction(next: 'saving' | 'closing' | 'picking') {
    if (action.current !== 'idle' || confirmingExit.current) return false;
    action.current = next;
    if (next === 'picking') setPicking(true);
    else setBusy(true);
    return true;
  }

  function finishAction() {
    action.current = 'idle';
    if (mounted.current) { setBusy(false); setPicking(false); }
  }

  function changedFromOriginal() {
    const original = initial.current;
    const current = latest.current;
    return original.text !== current.text || original.occurredAt !== current.occurredAt || original.photos.length !== current.photos.length || original.photos.some((photo, index) => photo.id !== current.photos[index]?.id);
  }

  useEffect(() => {
    if (entry || stopped.current) return;
    setStatus('正在保存草稿…');
    const snapshot = draft;
    timer.current = setTimeout(() => {
      void saveDraft(snapshot).then(() => {
        if (mounted.current && latest.current === snapshot && !stopped.current) setStatus('草稿已保存在手机');
      }).catch(() => {
        if (mounted.current && !stopped.current) setStatus('草稿暂未保存，请先留在这里');
      });
    }, 600);
    return cancelTimer;
  }, [draft, entry, saveDraft]);

  useEffect(() => {
    if (entry) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !stopped.current) {
        cancelTimer();
        void saveDraft(latest.current).catch(() => { if (mounted.current && !stopped.current) setStatus('草稿暂未保存，请先留在这里'); });
      }
    });
    return () => subscription.remove();
  }, [entry, saveDraft]);

  function update(partial: Partial<EntryDraft>) {
    if (action.current === 'saving' || action.current === 'closing' || confirmingExit.current) return;
    const next = { ...latest.current, ...partial };
    latest.current = next;
    setDraft(next);
  }

  async function close() {
    if (action.current !== 'idle' || confirmingExit.current) return;
    Keyboard.dismiss();
    setAndroidPicker(null);
    if (entry) {
      if (changedFromOriginal()) {
        confirmingExit.current = true;
        Alert.alert('修改还没保存', '可以保存这次修改后返回，或保留原来的记录。', [
          { text: '继续写', style: 'cancel', onPress: () => { confirmingExit.current = false; } },
          { text: '放弃修改并返回', style: 'destructive', onPress: () => { confirmingExit.current = false; stopped.current = true; action.current = 'closing'; onClose(); } },
          { text: '保存并返回', onPress: () => { confirmingExit.current = false; void save(); } },
        ], { cancelable: true, onDismiss: () => { confirmingExit.current = false; } });
      } else {
        stopped.current = true;
        action.current = 'closing';
        onClose();
      }
      return;
    }
    if (!beginAction('closing')) return;
    cancelTimer();
    stopped.current = true;
    const snapshot = latest.current;
    try {
      await saveDraft(snapshot.text.trim() || snapshot.photos.length ? snapshot : null);
    } catch (error) {
      stopped.current = false;
      Alert.alert('还没保存好', error instanceof Error ? error.message : '请稍后再试，文字还留在这里。');
      finishAction();
      return;
    }
    // Keep the synchronous exit lock until the parent removes this modal.
    onClose();
  }

  async function save() {
    const snapshot = latest.current;
    if (!snapshot.text.trim() && !snapshot.photos.length) {
      if (action.current === 'idle') Alert.alert('还没有可以保存的内容', '写一句话或加一张照片，就可以保存。');
      return;
    }
    if (!beginAction('saving')) return;
    Keyboard.dismiss();
    setAndroidPicker(null);
    cancelTimer();
    stopped.current = true;
    try {
      await saveEntry(snapshot, entry?.id);
    } catch (error) {
      stopped.current = false;
      setStatus('尚未保存，内容还留在这里');
      Alert.alert('这条还没保存好', error instanceof Error ? error.message : '请稍后再试。');
      finishAction();
      return;
    }
    onSaved(snapshot.occurredAt);
  }

  function systemBack() {
    if (Platform.OS === 'android' && Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    void close();
  }

  async function addPhotos() {
    if (action.current !== 'idle' || confirmingExit.current) return;
    if (latest.current.photos.length >= 12) { Alert.alert('这一条已放了 12 张照片', '可以再写一条，继续放照片。'); return; }
    if (!beginAction('picking')) return;
    Keyboard.dismiss();
    setAndroidPicker(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 12 - latest.current.photos.length, quality: 0.8, orderedSelection: true });
      if (!result.canceled) {
        const photos = [];
        for (const asset of result.assets) photos.push(await persistPhoto(asset.uri));
        update({ photos: [...latest.current.photos, ...photos] });
      }
    } catch (error) { Alert.alert('照片暂时没能加入', error instanceof Error ? error.message : '请再试一次。'); }
    finally { finishAction(); }
  }

  const occurredAt = new Date(draft.occurredAt);

  return <Modal visible animationType="slide" presentationStyle="fullScreen" allowSwipeDismissal={false} onRequestClose={systemBack}>
      <BackPage title={entry ? '修改记录' : '写下一点'} onBack={() => { void close(); }} disabled={busy || picking}
        action={<ActionButton title={entry ? '保存修改' : '收好这条记录'} icon="checkmark" busy={busy} disabled={picking || (!draft.text.trim() && !draft.photos.length)} onPress={() => { void save(); }} />}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          <Text style={styles.label}>事情发生在</Text>
          {Platform.OS === 'ios' ? <View style={styles.pickerRow}><DateTimePicker accessibilityLabel="事情发生的日期" mode="date" display="compact" themeVariant="light" locale="zh-CN" value={occurredAt} disabled={busy || picking} onChange={(_, next) => { if (next) update({ occurredAt: next.toISOString() }); }} /><DateTimePicker accessibilityLabel="事情发生的时间" mode="time" display="compact" themeVariant="light" locale="zh-CN" value={occurredAt} disabled={busy || picking} onChange={(_, next) => { if (next) update({ occurredAt: next.toISOString() }); }} /></View> : <View style={styles.pickerRow}><ActionButton secondary disabled={busy || picking} title={dayKey(occurredAt)} onPress={() => setAndroidPicker('date')} /><ActionButton secondary disabled={busy || picking} title={occurredAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })} onPress={() => setAndroidPicker('time')} /></View>}
          {androidPicker ? <DateTimePicker mode={androidPicker} value={occurredAt} onChange={(_, next) => { setAndroidPicker(null); if (next) update({ occurredAt: next.toISOString() }); }} /> : null}
          <Text style={styles.hint}>现在想起以前的事，也可以改成当时的时间。</Text>
          <TextInput accessibilityLabel="日记内容" placeholder="刚刚发生了什么，或是突然想起了什么…" placeholderTextColor="#989B91" value={draft.text} onChangeText={(text) => update({ text })} multiline textAlignVertical="top" style={styles.editor} editable={!busy && !picking} maxLength={50000} />
          {draft.photos.length ? <View style={styles.photoGrid}>{draft.photos.map((photo, index) => <View key={photo.id} style={styles.photoWrap}><Pressable accessibilityRole="button" accessibilityLabel={`查看第 ${index + 1} 张照片`} disabled={busy || picking} onPress={() => { Keyboard.dismiss(); setPreview(photo.uri); }}><Image source={{ uri: photo.uri }} style={styles.photo} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`移除第 ${index + 1} 张照片`} disabled={busy || picking} style={styles.removePhoto} onPress={() => update({ photos: latest.current.photos.filter((item) => item.id !== photo.id) })}><Icon name="close" size={18} color={colors.ink} /></Pressable></View>)}</View> : null}
          <ActionButton secondary title={picking ? '正在加入照片…' : '加几张照片'} busy={picking} disabled={busy} onPress={() => { void addPhotos(); }} icon="image-outline" />
          <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
          {!entry ? <Text style={styles.hint}>返回时会先保存草稿。</Text> : null}
        </ScrollView>
      </BackPage>
      <Modal visible={Boolean(preview)} transparent animationType="fade" presentationStyle="overFullScreen" allowSwipeDismissal={false} onRequestClose={() => setPreview(null)}><BackPage title="照片" backLabel="返回日记" dark onBack={() => setPreview(null)}>{preview ? <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" /> : null}</BackPage></Modal>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 30, gap: 16 },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pickerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 14, lineHeight: 22, color: colors.muted },
  editor: { minHeight: 240, fontSize: 18, lineHeight: 30, color: colors.ink, padding: 0 },
  status: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 21 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoWrap: { width: 92, height: 92 },
  photo: { width: 92, height: 92, borderRadius: 16, backgroundColor: colors.line },
  removePhoto: { position: 'absolute', top: -5, right: -5, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  previewImage: { flex: 1, width: '100%' },
});
