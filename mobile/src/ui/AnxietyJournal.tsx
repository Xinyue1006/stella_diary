import { useRef, useState } from 'react';
import { Alert, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COMPARISON_LABELS, INTENSITY_LABELS, MAX_ACTION_COUNT, MAX_ACTION_LENGTH, MAX_TEXT_LENGTH, nextFollowUp, recentHelpfulActions, tomorrowKey } from '../domain';
import type { AnxietyLog } from '../types';
import { BackPage } from './BackPage';
import { ActionButton, IconButton } from './components';
import { displayTime } from './dates';
import { useDiaryContext } from './diaryContext';
import { getMascot } from './mascots';
import { colors } from './theme';

const suggestions = ['出去走走', '喝点水', '和朋友聊聊', '听一首歌'];

function Choice({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: checked }} onPress={onPress}
    style={[styles.choice, checked && styles.checked]}>
    <Text style={[styles.choiceText, checked && styles.checkedText]}>{label}</Text>
  </Pressable>;
}

export function FollowUpCard({ today }: { today: string }) {
  const { data, openAnxiety, rescheduleAnxiety } = useDiaryContext();
  const log = nextFollowUp(data.anxietyLogs, today);
  if (!log) return null;
  function defer(id: string, when?: string) {
    void rescheduleAnxiety(id, when).catch(() => Alert.alert('回访还没更新', '请稍后再试。'));
  }
  return <View style={styles.card}>
    <Text style={styles.title}>{getMascot(data.mascot).name}想问：后来怎么样了？</Text>
    <Text style={styles.detail}>{new Date(log.occurredAt).toLocaleDateString('zh-CN')} · 当时的担心</Text>
    <Text numberOfLines={3} style={styles.body}>{log.worry || INTENSITY_LABELS[log.intensity]}</Text>
    <ActionButton secondary title="写两句" onPress={() => openAnxiety(log)} />
    <View style={styles.choices}><Choice label="改天再说" checked={false} onPress={() => defer(log.id, tomorrowKey())} />
      <Choice label="这条不再问" checked={false} onPress={() => defer(log.id)} /></View>
  </View>;
}

export function AnxietyCard({ log, showDate = false }: { log: AnxietyLog; showDate?: boolean }) {
  const { openAnxiety, deleteAnxiety } = useDiaryContext();
  function remove() {
    Alert.alert('删除这条焦虑记录？', '这条记录和写下的后续都会被移除。', [
      { text: '保留', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { void deleteAnxiety(log.id).catch(() => Alert.alert('没能删除', '请稍后再试。')); } },
    ]);
  }
  return <View style={styles.card}>
    <View style={styles.row}><Text style={styles.title}>焦虑 · {INTENSITY_LABELS[log.intensity]}</Text>
      <IconButton name="trash-outline" label="删除这条焦虑记录" onPress={remove} /></View>
    <Text style={styles.detail}>{showDate && new Date(log.occurredAt).toLocaleDateString('zh-CN')}{showDate && ' · '}{displayTime(log.occurredAt)}</Text>
    {!!log.worry && <Text numberOfLines={4} style={styles.body}>{log.worry}</Text>}
    {!!log.outcome && <Text numberOfLines={3} style={styles.body}>后来：{log.outcome}</Text>}
    {log.comparison && <Text style={styles.detail}>回头看，{COMPARISON_LABELS[log.comparison]}</Text>}
    {!!log.actions.length && <Text numberOfLines={2} style={styles.detail}>试过：{log.actions.join('、')}</Text>}
    {!!log.helpfulActions.length && <Text numberOfLines={2} style={styles.detail}>有帮助：{log.helpfulActions.join('、')}</Text>}
    <ActionButton title={log.outcome ? '查看或修改记录' : '后来怎么样了？'} secondary onPress={() => openAnxiety(log)} />
  </View>;
}

export function AnxietyEditor({ log, onClose }: { log?: AnxietyLog; onClose: () => void }) {
  const { data, saveAnxiety } = useDiaryContext();
  const mascot = getMascot(data.mascot);
  const [occurredAt] = useState(() => log?.occurredAt ?? new Date().toISOString());
  const [intensity, setIntensity] = useState(log?.intensity);
  const [worry, setWorry] = useState(log?.worry ?? '');
  const [outcome, setOutcome] = useState(log?.outcome ?? '');
  const [remindOn, setRemindOn] = useState(log?.remindOn);
  const [comparison, setComparison] = useState(log?.comparison);
  const [actions, setActions] = useState<string[]>(log?.actions ?? []);
  const [helpful, setHelpful] = useState<string[]>(log?.helpfulActions ?? []);
  const [custom, setCustom] = useState('');
  const [showDetails, setShowDetails] = useState(!!log);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const confirming = useRef(false);
  const recalled = recentHelpfulActions(data.anxietyLogs, log?.id);
  const choices = [...new Set([...recalled, ...suggestions, ...(log?.actions ?? []), ...actions])];

  function back() {
    if (saving.current || confirming.current) return;
    const dirty = intensity !== log?.intensity || worry !== (log?.worry ?? '') || outcome !== (log?.outcome ?? '') ||
      remindOn !== log?.remindOn || comparison !== log?.comparison || !!custom.trim() || JSON.stringify(actions) !== JSON.stringify(log?.actions ?? []) ||
      JSON.stringify(helpful) !== JSON.stringify(log?.helpfulActions ?? []);
    Keyboard.dismiss();
    if (!dirty) { onClose(); return; }
    confirming.current = true;
    const reset = () => { confirming.current = false; };
    Alert.alert('离开这条记录？', '刚才的修改还没有保存。', [
      { text: '继续填写', style: 'cancel', onPress: reset },
      { text: '放弃并返回', style: 'destructive', onPress: () => { reset(); onClose(); } },
    ], { cancelable: true, onDismiss: reset });
  }
  function withAction(name: string): string[] | null {
    if (!name || actions.includes(name)) return actions;
    if (actions.length >= MAX_ACTION_COUNT) {
      Alert.alert('方法已记满', '每条记录最多可以选 32 个方法。');
      return null;
    }
    return [...actions, name];
  }
  function toggleAction(name: string) {
    if (actions.includes(name)) {
      setActions(actions.filter(item => item !== name));
      setHelpful(helpful.filter(item => item !== name));
    } else {
      const next = withAction(name);
      if (next) setActions(next);
    }
  }
  function addCustom() {
    const next = withAction(custom.trim());
    if (next) { setActions(next); setCustom(''); }
  }
  async function save() {
    if (!intensity || saving.current || confirming.current) return;
    const next = withAction(custom.trim());
    if (!next) return;
    saving.current = true;
    setBusy(true);
    try {
      const answered = log && (outcome.trim() && outcome !== log.outcome || comparison && comparison !== log.comparison);
      await saveAnxiety({ occurredAt, intensity, worry, outcome, actions: next, helpfulActions: helpful, comparison,
        remindOn: answered && remindOn === log?.remindOn ? undefined : remindOn }, log?.id);
      onClose();
    } catch (error) {
      Alert.alert('没能保存', error instanceof Error ? error.message : '请再试一次。');
    } finally { saving.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" onRequestClose={back}>
    <BackPage title={log ? '我的焦虑记录' : '我现在有点焦虑'} onBack={back} disabled={busy}
      action={<ActionButton title="保存记录" onPress={() => { void save(); }} busy={busy} disabled={!intensity} />}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.mascot, { backgroundColor: mascot.color }]}>
          <Image source={mascot.image} style={styles.pig} resizeMode="contain" />
          <View style={styles.copy}><Text style={styles.title}>{mascot.name}陪你</Text>
            <Text style={styles.body}>{recalled.length ? '你之前记下，这些方法帮过你：' + recalled.join('、') + '。' : '先选一下现在的感受。想说的话，可以慢慢写。'}</Text></View>
        </View>
        <Text style={styles.title}>当时有多难受？</Text>
        <View style={styles.choices}>{([1, 2, 3] as const).map(level => <Choice key={level} label={INTENSITY_LABELS[level]} checked={intensity === level} onPress={() => setIntensity(level)} />)}</View>
        <Text style={styles.title}>{log ? '当时担心会发生什么？' : '担心什么？（选填）'}</Text>
        <TextInput multiline accessibilityLabel="担心什么" value={worry} onChangeText={setWorry} maxLength={MAX_TEXT_LENGTH} placeholder="我担心会……" style={styles.input} />
        <Choice label={remindOn ? `小猪会在 ${remindOn} 打开日记时问我` : '明天问问我'} checked={!!remindOn}
          onPress={() => setRemindOn(remindOn ? undefined : tomorrowKey())} />
        {!showDetails && <ActionButton secondary title="记下试过的方法或后续" onPress={() => setShowDetails(true)} />}
        {showDetails && <>
          <Text style={styles.title}>后来怎么样了？</Text>
          <TextInput multiline accessibilityLabel="后来怎么样了" value={outcome} onChangeText={setOutcome} maxLength={MAX_TEXT_LENGTH} placeholder="也可以过几天回来补写" style={styles.input} />
          <Text style={styles.title}>和当时想象的相比呢？（选填）</Text>
          <View style={styles.choices}>{(Object.keys(COMPARISON_LABELS) as (keyof typeof COMPARISON_LABELS)[]).map(value =>
            <Choice key={value} label={COMPARISON_LABELS[value]} checked={comparison === value} onPress={() => setComparison(comparison === value ? undefined : value)} />)}</View>
          <Text style={styles.title}>我试过的方法</Text>
          <View style={styles.choices}>{choices.map(name => <Choice key={name} label={name} checked={actions.includes(name)} onPress={() => toggleAction(name)} />)}</View>
          <View style={styles.custom}><TextInput accessibilityLabel="自己的方法" placeholder="写下自己的方法" value={custom} onChangeText={setCustom}
            onSubmitEditing={addCustom} maxLength={MAX_ACTION_LENGTH} style={[styles.input, styles.customInput]} />
            <IconButton name="add" label="添加自己的方法" onPress={addCustom} disabled={!custom.trim()} /></View>
          {!!actions.length && <>
            <Text style={styles.title}>哪些方法对我有帮助？</Text>
            <View style={styles.choices}>{actions.map(name => <Choice key={name} label={name} checked={helpful.includes(name)}
              onPress={() => setHelpful(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])} />)}</View>
          </>}
        </>}
      </ScrollView>
    </BackPage>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mascot: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pig: { width: 72, height: 80 },
  copy: { flex: 1, gap: 5 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { maxWidth: '100%', minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  checked: { backgroundColor: colors.greenLight, borderColor: colors.green },
  choiceText: { color: colors.ink, fontSize: 15 },
  checkedText: { color: colors.green, fontWeight: '700' },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 15, minHeight: 84, padding: 12, color: colors.ink, fontSize: 16, textAlignVertical: 'top' },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customInput: { flex: 1, minHeight: 46, textAlignVertical: 'center' },
});
