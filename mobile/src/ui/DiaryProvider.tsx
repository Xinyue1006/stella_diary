import { useRouter } from 'expo-router';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native';
import type { AnxietyLog, Entry } from '../types';
import { useDiary } from '../useDiary';
import { ActionButton } from './components';
import { dayKey } from './dates';
import { DiaryContext } from './diaryContext';
import { EntryEditor } from './EntryEditor';
import { AnxietyEditor } from './AnxietyJournal';
import { colors } from './theme';

export function DiaryProvider({ children }: PropsWithChildren) {
  const diary = useDiary();
  const router = useRouter();
  const [reviewDate, setReviewDate] = useState(dayKey());
  const [reviewQuery, setReviewQuery] = useState('');
  const [editor, setEditor] = useState<{ entry?: Entry; date?: string; key: number } | null>(null);
  const [anxiety, setAnxiety] = useState<{ log?: AnxietyLog } | null>(null);
  const [, refreshDate] = useState(dayKey());

  useEffect(() => {
    const refresh = () => refreshDate(dayKey());
    const timer = setInterval(refresh, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  if (diary.error) {
    return <View style={styles.center}><Text style={styles.title}>暂时没能打开日记</Text><Text style={styles.detail}>{diary.error}</Text><ActionButton title="重新读取" onPress={() => { void diary.retryLoad(); }} />{diary.recoveryAvailable ? <ActionButton secondary title="恢复上一次本机保存" onPress={() => Alert.alert('恢复上一次保存？', '将恢复到上一次成功写入前的资料，最近一次修改可能不在其中；原始文件会保留。', [{ text: '取消', style: 'cancel' }, { text: '恢复', onPress: () => { void diary.restorePrevious().catch((error) => Alert.alert('暂时没能恢复', error instanceof Error ? error.message : '请再试一次。')); } }])} /> : null}</View>;
  }
  if (!diary.ready) {
    return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /><Text style={styles.detail}>正在打开你的小日记…</Text></View>;
  }

  return (
    <DiaryContext.Provider value={{ ...diary, reviewDate, setReviewDate, reviewQuery, setReviewQuery, openWriter: (entry, date) => setEditor({ entry, date, key: Date.now() }), openAnxiety: log => setAnxiety({ log }) }}>
      {children}
      {anxiety && <AnxietyEditor log={anxiety.log} onClose={() => setAnxiety(null)} />}
      {editor ? <EntryEditor key={editor.key} entry={editor.entry} date={editor.date} onClose={() => setEditor(null)} onSaved={(occurredAt) => {
        setEditor(null);
        const recordedDay = dayKey(occurredAt);
        // Review may still be showing another day or a search that no longer
        // matches this entry. Reveal the saved event at its actual date.
        setReviewDate(recordedDay);
        setReviewQuery('');
        if (recordedDay !== dayKey()) {
          router.navigate('/review');
        }
      }} /> : null}
    </DiaryContext.Provider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  detail: { fontSize: 16, lineHeight: 26, color: colors.muted, textAlign: 'center' },
});
