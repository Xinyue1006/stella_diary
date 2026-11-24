import { useRef, useState } from 'react';
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_TODO_TEXT } from '../domain';
import type { Todo } from '../types';
import { BackPage } from './BackPage';
import { ActionButton, Icon, IconButton } from './components';
import { useDiaryContext } from './diaryContext';
import { colors } from './theme';

export function TodoList({ onClose }: { onClose: () => void }) {
  const { data, saveTodo, deleteTodo } = useDiaryContext();
  const [editor, setEditor] = useState<{ item?: Todo; text: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const closing = useRef(false);
  async function run(operation: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try { await operation(); }
    catch (error) { Alert.alert('清单还没保存', error instanceof Error ? error.message : '请稍后再试。'); }
    finally { active.current = false; setBusy(false); }
  }
  function back() {
    if (active.current || closing.current) return;
    Keyboard.dismiss();
    if (!editor) { onClose(); return; }
    if (editor.text === (editor.item?.text ?? '')) { setEditor(null); return; }
    closing.current = true;
    const reset = () => { closing.current = false; };
    Alert.alert('这件事还没保存', '要继续写吗？', [
      { text: '继续写', style: 'cancel', onPress: reset },
      { text: '放弃并返回', style: 'destructive', onPress: () => { reset(); setEditor(null); } },
    ], { cancelable: true, onDismiss: reset });
  }
  function remove(item: Todo) {
    Alert.alert('把这件事从清单移除？', item.text, [
      { text: '保留', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => { void run(() => deleteTodo(item.id)); } },
    ]);
  }
  function row(item: Todo) {
    return <View key={item.id} style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done, disabled: busy }} accessibilityLabel={item.text}
        style={styles.check} disabled={busy} onPress={() => { void run(() => saveTodo({ done: !item.done }, item.id)); }}>
        <Icon name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} />
        <Text style={[styles.text, item.done && styles.done]}>{item.text}</Text>
      </Pressable>
      <IconButton label={`修改：${item.text}`} disabled={busy} name="pencil-outline" onPress={() => setEditor({ item, text: item.text })} />
      <IconButton label={`移除：${item.text}`} disabled={busy} name="trash-outline" onPress={() => remove(item)} />
    </View>;
  }
  function save() {
    if (!editor?.text.trim()) return;
    void run(async () => { await saveTodo({ text: editor.text }, editor.item?.id); Keyboard.dismiss(); setEditor(null); });
  }
  const done = data.todos.filter(item => item.done);
  return <Modal visible animationType="slide" onRequestClose={back}>
    <BackPage title={editor ? editor.item ? '修改这件事' : '记下一件事' : '随手清单'} onBack={back} disabled={busy}
      action={editor ? <ActionButton title="收好" disabled={!editor.text.trim()} busy={busy} onPress={save} />
        : <ActionButton title="记下一件事" icon="add" onPress={() => setEditor({ text: '' })} disabled={busy} />}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {editor ? <TextInput autoFocus accessibilityLabel="想做的事" placeholder="有什么想留着以后做？" value={editor.text} multiline maxLength={MAX_TODO_TEXT}
          editable={!busy} onChangeText={text => setEditor({ ...editor, text })} style={styles.input} />
          : <><Text style={styles.detail}>想到什么就先放这里，哪天想做都可以。</Text>
            {data.todos.filter(item => !item.done).map(row)}
            {done.length > 0 && <ActionButton title={showDone ? '收起做过的事' : '看看做过的事'} secondary onPress={() => setShowDone(!showDone)} />}
            {showDone && done.map(row)}</>}
      </ScrollView>
    </BackPage>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  detail: { fontSize: 15, lineHeight: 23, color: colors.muted },
  row: { flexDirection: 'row', gap: 2, alignItems: 'center', borderRadius: 14, paddingHorizontal: 6, backgroundColor: colors.surface },
  check: { flex: 1, minHeight: 52, flexDirection: 'row', gap: 9, alignItems: 'center', padding: 6 },
  text: { flex: 1, fontSize: 16, lineHeight: 23, color: colors.ink },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  input: { minHeight: 105, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, fontSize: 17, color: colors.ink, textAlignVertical: 'top' },
});
