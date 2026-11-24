import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { anxietyLogsForReview } from '../domain';
import type { AnxietyLog, Countdown, Entry } from '../types';
import { AnxietyCard, FollowUpCard } from './AnxietyJournal';
import { TodoList } from './TodoList';
import { ActionButton, EmptyState, Icon, IconButton, PageHeading, Screen, SectionHeading } from './components';
import { dayKey, daysFromToday, displayDate, displayTime, parseDay } from './dates';
import { useDiaryContext } from './diaryContext';
import { getMascot, mascots } from './mascots';
import { BackPage } from './BackPage';
import { colors } from './theme';

function showError(title: string, error: unknown) {
  Alert.alert(title, error instanceof Error ? error.message : '请稍后再试。');
}

function Timeline({ entries, logs, searching = false }: { entries: Entry[]; logs: AnxietyLog[]; searching?: boolean }) {
  const rows = [...entries, ...logs].sort((a, b) => searching
    ? b.occurredAt.localeCompare(a.occurredAt) : a.occurredAt.localeCompare(b.occurredAt));
  return <>{rows.map(row => 'intensity' in row ? <AnxietyCard key={'anxiety-' + row.id} log={row} showDate={searching} />
    : <EntryCard key={'entry-' + row.id} entry={row} showDate={searching} />)}</>;
}

function CountdownCard({ item, compact = false, onManage }: { item: Countdown; compact?: boolean; onManage?: () => void }) {
  const days = daysFromToday(item.date);
  const anniversary = item.kind === 'anniversary';
  return <View style={[styles.countdownCard, anniversary && styles.anniversaryCard, compact && styles.countdownCompact]}>
    <View style={styles.countdownIcon}><Icon name={anniversary ? 'heart-outline' : 'flower-outline'} size={25} /></View>
    <View style={styles.flex}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.small}>{parseDay(item.date).toLocaleDateString('zh-CN')}</Text></View>
    <View style={styles.countdownNumber}>{anniversary && days < 0 && <Text style={styles.daysLabel}>已经</Text>}<Text style={styles.daysNumber}>{days === 0 ? '今天' : Math.abs(days)}</Text>{days !== 0 ? <Text style={styles.daysLabel}>{days > 0 ? '天后' : anniversary ? '天' : '天前'}</Text> : null}</View>
    {onManage ? <IconButton name="ellipsis-horizontal" label={`管理${item.title}`} onPress={onManage} /> : null}
  </View>;
}

function EntryCard({ entry, showDate = false }: { entry: Entry; showDate?: boolean }) {
  const { deleteEntry, openWriter } = useDiaryContext();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  function actions() {
    Alert.alert('这条记录', '可以修改内容和发生时间。', [
      { text: '修改', onPress: () => openWriter(entry) },
      { text: '删除', style: 'destructive', onPress: () => Alert.alert('删除这条记录？', '删除后，当前手机里的这条记录和关联照片将不再显示。', [{ text: '保留', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void deleteEntry(entry.id).catch((error) => showError('没能删除', error)); } }]) },
      { text: '取消', style: 'cancel' },
    ]);
  }
  return <View style={styles.entryCard}>
    {entry.kind === 'good' && <Text style={styles.eyebrow}>今天有一点好</Text>}
    <View style={styles.entryHeader}><View style={styles.entryTimeGroup}><View style={styles.timeMark} /><Text style={styles.entryTime}>{showDate ? `${new Date(entry.occurredAt).toLocaleDateString('zh-CN')} · ` : ''}{displayTime(entry.occurredAt)}</Text></View><IconButton name="ellipsis-horizontal" label={`管理${displayTime(entry.occurredAt)}的记录`} onPress={actions} /></View>
    {entry.text ? <Text style={styles.entryText} numberOfLines={expanded ? undefined : 7} onTextLayout={(event) => { if (event.nativeEvent.lines.length >= 7) setCanExpand(true); }}>{entry.text}</Text> : null}
    {canExpand ? <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={styles.expandButton}><Text style={styles.link}>{expanded ? '收起文字' : '展开全文'}</Text></Pressable> : null}
    {entry.photos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.entryPhotos}>{entry.photos.map((photo, index) => <Pressable accessibilityRole="button" accessibilityLabel={`查看这条记录的第 ${index + 1} 张照片`} key={photo.id} onPress={() => setPreview(photo.uri)}><Image source={{ uri: photo.uri }} style={styles.entryPhoto} /></Pressable>)}</ScrollView> : null}
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <BackPage title="照片" backLabel="返回日记" dark onBack={() => setPreview(null)}>
        {preview ? <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" /> : null}
      </BackPage>
    </Modal>
  </View>;
}

export function TodayScreen() {
  const { data, openWriter, openAnxiety } = useDiaryContext();
  const [showTodos, setShowTodos] = useState(false);
  const router = useRouter();
  const today = dayKey();
  const entries = data.entries.filter(entry => dayKey(entry.occurredAt) === today);
  const logs = anxietyLogsForReview(data.anxietyLogs, today);
  const total = entries.length + logs.length;
  const mascot = getMascot(data.mascot);
  const nextDay = [...data.countdowns].filter((item) => daysFromToday(item.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return <Screen>
    <PageHeading title="今天" subtitle={displayDate(new Date())} accessory={<View style={styles.flowerBadge}><Icon name="flower" size={25} color="#927116" /></View>} />
    <View style={[styles.hero, { backgroundColor: mascot.color }]}><View style={styles.heroCopy}><Text style={styles.eyebrow}>今天的小伙伴</Text><Text style={styles.heroTitle}>{mascot.name}</Text><Text style={styles.heroDetail}>陪你记下今天的小事。</Text></View><Image source={mascot.image} style={styles.heroPig} resizeMode="contain" accessibilityLabel={`陪伴你的${mascot.name}`} /></View>
    <FollowUpCard today={today} />
    <ActionButton title={data.draft && !data.draft.kind && (data.draft.text.trim() || data.draft.photos.length) ? '继续上次的草稿' : '写一条记录'} icon="pencil-outline" onPress={() => openWriter()} />
    <ActionButton secondary title="我现在有点焦虑" icon="heart-outline" onPress={() => openAnxiety()} />
    <View style={styles.shortcuts}>
      <View style={styles.flex}><ActionButton secondary title={data.draft?.kind === 'good' ? '继续写这件好事' : '今天有一点好'} icon="sunny-outline" onPress={() => openWriter(undefined, undefined, 'good')} /></View>
      <View style={styles.flex}><ActionButton secondary title="随手清单" icon="list-outline" onPress={() => setShowTodos(true)} /></View>
    </View>
    {showTodos && <TodoList onClose={() => setShowTodos(false)} />}
    {nextDay ? <Pressable accessibilityRole="button" accessibilityLabel={`查看期待日：${nextDay.title}`} onPress={() => router.navigate('/countdowns')}><CountdownCard item={nextDay} compact /></Pressable> : null}
    <SectionHeading title="今天的小片段" detail={total ? `${total} 条 · 按发生时间` : undefined} />
    {total ? <Timeline entries={entries} logs={logs} /> : <EmptyState title="今天还留着空白" detail="有想记下来的事，再来写就好。\n以前的事也可以随时补记。" />}
    <Text style={styles.pageFootnote}>你的每一个小片段，都有自己的位置。</Text>
  </Screen>;
}

function Calendar({ selected, onSelect, entries }: { selected: string; onSelect: (date: string) => void; entries: { occurredAt: string }[] }) {
  const [month, setMonth] = useState(() => new Date(parseDay(selected).getFullYear(), parseDay(selected).getMonth(), 1, 12));
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const entry of entries) { const date = dayKey(entry.occurredAt); result[date] = (result[date] ?? 0) + 1; }
    return result;
  }, [entries]);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const padding = (month.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((padding + days) / 7) * 7 }, (_, index) => index - padding + 1);
  function moveMonth(direction: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1, 12)); }
  return <View style={styles.calendar}>
    <View style={styles.calendarHeader}><IconButton name="chevron-back" label="上个月" onPress={() => moveMonth(-1)} /><Text style={styles.calendarTitle}>{month.getFullYear()} 年 {month.getMonth() + 1} 月</Text><IconButton name="chevron-forward" label="下个月" onPress={() => moveMonth(1)} /></View>
    <View style={styles.calendarGrid}>{['一', '二', '三', '四', '五', '六', '日'].map((day) => <View key={day} style={styles.weekCell}><Text style={styles.weekText}>{day}</Text></View>)}{cells.map((day, index) => {
      if (day < 1 || day > days) return <View key={`empty-${index}`} style={styles.dayCell} />;
      const key = dayKey(new Date(month.getFullYear(), month.getMonth(), day, 12));
      const active = selected === key;
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${key}，${counts[key] ?? 0} 条记录`} accessibilityState={{ selected: active }} onPress={() => onSelect(key)} style={styles.dayCell}><View style={[styles.dayInner, active && styles.activeDay, key === dayKey() && !active && styles.currentDay]}><Text style={[styles.dayText, active && styles.activeDayText]}>{day}</Text><View style={[styles.calendarDot, { opacity: counts[key] ? 1 : 0 }, active && styles.selectedDot]} /></View></Pressable>;
    })}</View>
    <Pressable accessibilityRole="button" onPress={() => { onSelect(dayKey()); const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); }} style={styles.todayLink}><Text style={styles.link}>回到今天</Text></Pressable>
  </View>;
}

export function ReviewScreen() {
  const { data, reviewDate, setReviewDate, reviewQuery: query, setReviewQuery: setQuery, openWriter } = useDiaryContext();
  const [searchFocused, setSearchFocused] = useState(false);
  const [recalledId, setRecalledId] = useState<string>();
  const searching = Boolean(query.trim());
  const entries = data.entries.filter(entry => searching ? [entry.text, entry.kind === 'good' ? '今天有一点好 好事' : ''].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : dayKey(entry.occurredAt) === reviewDate);
  const good = data.entries.filter(entry => entry.kind === 'good');
  const recalled = good.find(entry => entry.id === recalledId);
  function recallGood() {
    const pool = good.length > 1 ? good.filter(entry => entry.id !== recalledId) : good;
    setRecalledId(pool[Math.floor(Math.random() * pool.length)]?.id);
  }
  const logs = anxietyLogsForReview(data.anxietyLogs, reviewDate, query);
  const total = entries.length + logs.length;
  const calendarEntries = useMemo(() => [...data.entries, ...data.anxietyLogs], [data.entries, data.anxietyLogs]);
  return <Screen title="回看">
    {!searching && good.length > 0 && <><ActionButton secondary title={recalled ? '再翻一件好事' : '翻一件好事'} icon="sunny-outline" onPress={recallGood} />
      {recalled && <EntryCard key={'recalled-' + recalled.id} entry={recalled} showDate />}</>}
    <View style={styles.searchBox}>
      <Icon name="search-outline" size={21} />
      <TextInput accessibilityLabel="搜索日记关键词" placeholder="找一段话，或一件小事" placeholderTextColor="#92978A" value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={styles.searchInput} returnKeyType="search" />
      {searchFocused || query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="取消搜索，返回日历" onPress={() => { setQuery(''); Keyboard.dismiss(); }} style={styles.cancelSearch}><Text style={styles.link}>取消</Text></Pressable> : null}
    </View>
    {!searching ? <Calendar key={reviewDate.slice(0, 7)} selected={reviewDate} onSelect={setReviewDate} entries={calendarEntries} /> : null}
    <SectionHeading title={searching ? '找到的小片段' : displayDate(parseDay(reviewDate))} detail={`${total} 条`} />
    {total ? <Timeline entries={entries} logs={logs} searching={searching} /> : <EmptyState title={searching ? '暂时没有找到' : '这一天还没有记录'} detail={searching ? '换一个关键词试试。' : '后来想起来，也可以把它补在这一天。'} icon={searching ? 'search-outline' : 'calendar-outline'} />}
    {!searching ? <ActionButton secondary title="补写这一天" icon="pencil-outline" onPress={() => {
      if (data.draft && !data.draft.kind && (data.draft.text.trim() || data.draft.photos.length)) Alert.alert('有一份还没写完的草稿', '先打开草稿，改一下发生日期就可以补写这一天。', [{ text: '稍后', style: 'cancel' }, { text: '打开草稿', onPress: () => openWriter(undefined, reviewDate) }]);
      else openWriter(undefined, reviewDate);
    }} /> : null}
  </Screen>;
}

export function CountdownsScreen() {
  const { data, saveCountdown, deleteCountdown } = useDiaryContext();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Countdown | null>(null);
  const [kind, setKind] = useState<Countdown['kind']>();
  const [title, setTitle] = useState('');
  const [selectedDate, setDate] = useState<Date | null>(null);
  const date = selectedDate ?? new Date();
  const [busy, setBusy] = useState(false);
  const [androidPicker, setAndroidPicker] = useState(false);
  const saving = useRef(false);
  const confirmingClose = useRef(false);
  const items = [...data.countdowns].sort((a, b) => {
    const aDays = daysFromToday(a.date), bDays = daysFromToday(b.date);
    if ((aDays < 0) !== (bDays < 0)) return aDays < 0 ? 1 : -1;
    return aDays < 0 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  function openForm(item?: Countdown) {
    setEditing(item ?? null);
    setTitle(item?.title ?? '');
    setKind(item?.kind);
    setDate(item ? parseDay(item.date) : null);
    setAdding(true);
  }
  function remove(item: Countdown) {
    Alert.alert(item.title, '要移除这个日子吗？', [{ text: '保留', style: 'cancel' }, { text: '移除', style: 'destructive', onPress: () => { void deleteCountdown(item.id).catch((error) => showError('没能移除', error)); } }]);
  }
  function manage(item: Countdown) {
    Alert.alert(item.title, undefined, [
      { text: '修改', onPress: () => openForm(item) },
      { text: '移除', style: 'destructive', onPress: () => remove(item) },
      { text: '取消', style: 'cancel' },
    ]);
  }
  async function save() {
    if (!title.trim() || saving.current || confirmingClose.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await saveCountdown({ title: title.trim(), date: dayKey(date), ...(kind ? { kind } : {}) }, editing?.id);
      setAdding(false);
    }
    catch (error) { showError('还没保存好', error); }
    finally { saving.current = false; setBusy(false); }
  }
  function closeForm() {
    if (saving.current || confirmingClose.current) return;
    Keyboard.dismiss();
    setAndroidPicker(false);
    const changed = title !== (editing?.title ?? '') || kind !== editing?.kind ||
      (selectedDate && dayKey(selectedDate) !== (editing?.date ?? dayKey()));
    if (!changed) { setAdding(false); return; }
    confirmingClose.current = true;
    const reset = () => { confirmingClose.current = false; };
    Alert.alert('放弃这次修改？', '这个日子还没保存。', [
      { text: '继续填写', style: 'cancel', onPress: reset },
      { text: '放弃并返回', style: 'destructive', onPress: () => { reset(); setAdding(false); } },
    ], { cancelable: true, onDismiss: reset });
  }
  const countdowns = items.filter(item => !item.kind);
  const anniversaries = items.filter(item => item.kind === 'anniversary');
  return <Screen title="期待">
    <ActionButton title="添加日子" icon="add" onPress={() => openForm()} />
    {countdowns.length > 0 && <SectionHeading title="期待日" />}
    {countdowns.map(item => <CountdownCard key={item.id} item={item} onManage={() => manage(item)} />)}
    {anniversaries.length > 0 && <SectionHeading title="纪念日" />}
    {anniversaries.map(item => <CountdownCard key={item.id} item={item} onManage={() => manage(item)} />)}
    {!items.length && <EmptyState title="这里可以放期待日和纪念日" detail="为下一趟旅行倒数，也可以记下第一次见面的日子。" icon="gift-outline" />}
    <Modal visible={adding} animationType="slide" presentationStyle="fullScreen" allowSwipeDismissal={false} onRequestClose={closeForm}>
      <BackPage title={editing ? '修改日子' : '添加日子'} onBack={closeForm} disabled={busy}
        action={<ActionButton title="保存日子" busy={busy} disabled={!title.trim()} onPress={() => { void save(); }} />}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          <View style={styles.kindRow}>
            {([undefined, 'anniversary'] as const).map(option => <Pressable key={option ?? 'countdown'}
              accessibilityRole="button" accessibilityState={{ selected: kind === option, disabled: busy }}
              disabled={busy} onPress={() => setKind(option)} style={[styles.kindOption, kind === option && styles.kindSelected]}>
              <Text style={[styles.kindText, kind === option && styles.kindSelectedText]}>{option ? '纪念日' : '期待日'}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.label}>这是什么日子？</Text>
          <TextInput accessibilityLabel="日子名称" placeholder={kind ? '例如：第一次见面' : '例如：去看海'} placeholderTextColor="#92978A" value={title} onChangeText={setTitle} maxLength={80} style={styles.titleInput} editable={!busy} />
          <Text style={styles.label}>它在哪一天？</Text>
          {Platform.OS === 'ios' ? <DateTimePicker accessibilityLabel="日子的日期" value={date} mode="date" display="inline" themeVariant="light" locale="zh-CN" disabled={busy} onChange={(_, next) => { if (next && !saving.current) setDate(next); }} /> : <ActionButton secondary disabled={busy} title={dayKey(date)} onPress={() => setAndroidPicker(true)} />}
          {androidPicker ? <DateTimePicker mode="date" value={date} onChange={(_, next) => { setAndroidPicker(false); if (next && !saving.current) setDate(next); }} /> : null}
        </ScrollView>
      </BackPage>
    </Modal>
  </Screen>;
}

export function SettingsScreen() {
  const { data, selectMascot, exportBackup, importBackup } = useDiaryContext();
  const [busy, setBusy] = useState<'export' | 'import' | 'mascot' | null>(null);
  async function run(action: 'export' | 'import') {
    if (busy) return;
    setBusy(action);
    try { if (action === 'export') await exportBackup(); else await importBackup(); }
    catch (error) { showError(action === 'export' ? '没能导出备份' : '没能恢复备份', error); }
    finally { setBusy(null); }
  }
  function confirmImport() {
    Alert.alert('从备份恢复？', '恢复会替换这台手机里现有的日记、照片、期待日和草稿。建议先导出一份当前备份。', [{ text: '取消', style: 'cancel' }, { text: '选择备份文件', style: 'destructive', onPress: () => { void run('import'); } }]);
  }
  return <Screen title="我的小角落">
    <View style={styles.previewNotice}><Text style={styles.cardTitle}>下次怎么打开日记？</Text><Text style={styles.paragraph}>电脑运行「Start Diary.cmd」，手机和电脑连同一个 Wi-Fi。打开 Expo Go，在首页的 Development servers 里点这台电脑就能继续写。</Text></View>
    <SectionHeading title="今天让谁陪你？" />
    <View style={styles.mascotGrid}>{mascots.map((mascot) => {
      const active = data.mascot === mascot.id;
      return <Pressable key={mascot.id} accessibilityRole="button" accessibilityLabel={`选择${mascot.name}`} accessibilityState={{ selected: active }} disabled={Boolean(busy)} onPress={() => {
        setBusy('mascot');
        void selectMascot(mascot.id).catch((error) => showError('没能更换小猪', error)).finally(() => setBusy(null));
      }} style={[styles.mascotCard, { backgroundColor: mascot.color }, active && styles.selectedMascot]}><Image source={mascot.image} style={styles.mascotImage} resizeMode="contain" /><View style={styles.mascotLabel}><Text style={styles.mascotName}>{mascot.name}</Text>{active ? <Icon name="checkmark-circle" size={19} /> : null}</View></Pressable>;
    })}</View>
    <SectionHeading title="把回忆收好" />
    <View style={styles.backupCard}><View style={styles.backupHeading}><Icon name="phone-portrait-outline" size={25} /><Text style={styles.cardTitle}>日记保存在这台手机</Text></View><Text style={styles.paragraph}>文字、照片和草稿会保存在本机。你可以导出一份完整备份，留作恢复时使用。</Text><View style={styles.backupHint}><Icon name="cloud-outline" size={23} /><Text style={styles.backupHintText}>导出后，在共享菜单选「存储到文件」，再选择你自己的 iCloud Drive。这里使用手动备份。</Text></View><Text style={styles.paragraph}>预览版支持单张照片 6 MB、完整备份中照片合计 24 MB。先用少量照片体验。</Text><ActionButton title="导出日记与照片备份" icon="share-outline" secondary busy={busy === 'export'} disabled={Boolean(busy)} onPress={() => { void run('export'); }} /><ActionButton title="从备份文件恢复" icon="folder-open-outline" secondary busy={busy === 'import'} disabled={Boolean(busy)} onPress={confirmImport} /></View>
    <View style={styles.quietNote}><Icon name="flower-outline" size={24} /><Text style={styles.quietText}>想起来就写，想歇一歇也可以。{ '\n' }这里会为你留着位置。</Text></View>
    <Text style={styles.pageFootnote}>小猪向阳日记 · 第一版</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  shortcuts: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  flowerBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.yellowLight, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 28, flexDirection: 'row', minHeight: 214, overflow: 'hidden', paddingLeft: 22, paddingTop: 24, paddingBottom: 25 },
  heroCopy: { flex: 1, zIndex: 1 },
  eyebrow: { color: colors.green, fontSize: 13, letterSpacing: 1, marginBottom: 12, fontWeight: '600' },
  heroTitle: { fontSize: 25, lineHeight: 36, fontWeight: '700', color: colors.ink },
  heroDetail: { fontSize: 14, lineHeight: 23, color: colors.muted, marginTop: 12 },
  heroPig: { width: '43%', height: 193, alignSelf: 'flex-end', marginRight: 4, marginBottom: -7 },
  pageFootnote: { textAlign: 'center', fontSize: 13, lineHeight: 21, color: colors.muted, paddingVertical: 10 },
  entryCard: { borderRadius: 22, paddingHorizontal: 19, paddingBottom: 20, paddingTop: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 9 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -9 },
  entryTimeGroup: { flexDirection: 'row', gap: 9, alignItems: 'center', flex: 1 },
  timeMark: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.yellow },
  entryTime: { fontSize: 14, fontWeight: '600', color: colors.green, flexShrink: 1 },
  entryText: { fontSize: 17, lineHeight: 29, color: colors.ink },
  expandButton: { alignSelf: 'flex-start', paddingVertical: 7, minHeight: 40, justifyContent: 'center' },
  link: { fontSize: 14, color: colors.green, fontWeight: '600' },
  entryPhotos: { gap: 10, paddingTop: 4 },
  entryPhoto: { width: 108, height: 108, borderRadius: 15, backgroundColor: colors.line },
  previewImage: { flex: 1, width: '100%' },
  countdownCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 19, paddingLeft: 18, paddingRight: 10, backgroundColor: colors.yellowLight, borderRadius: 23 },
  countdownCompact: { paddingRight: 20 },
  anniversaryCard: { backgroundColor: colors.lavender },
  countdownIcon: { width: 43, height: 43, borderRadius: 16, backgroundColor: '#FFFFFFA0', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, color: colors.ink, fontWeight: '600', flexShrink: 1, lineHeight: 23 },
  small: { fontSize: 13, lineHeight: 21, color: colors.muted, marginTop: 4 },
  countdownNumber: { alignItems: 'center', minWidth: 43 },
  daysNumber: { fontSize: 27, fontWeight: '600', color: colors.green },
  daysLabel: { fontSize: 13, color: colors.green, marginTop: 1 },
  searchBox: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, backgroundColor: colors.greenLight, borderRadius: 18 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 54, color: colors.ink },
  cancelSearch: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  calendar: { backgroundColor: colors.surface, borderRadius: 24, padding: 10, borderWidth: 1, borderColor: colors.line },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekCell: { width: '14.285714%', height: 38, alignItems: 'center', justifyContent: 'center' },
  weekText: { fontSize: 13, color: colors.muted },
  dayCell: { width: '14.285714%', height: 47, alignItems: 'center', justifyContent: 'center' },
  dayInner: { width: 39, height: 43, borderRadius: 15, justifyContent: 'center', alignItems: 'center', gap: 3 },
  activeDay: { backgroundColor: colors.green },
  currentDay: { backgroundColor: colors.yellowLight },
  dayText: { fontSize: 16, color: colors.ink },
  activeDayText: { color: '#FFFFFF', fontWeight: '600' },
  calendarDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green },
  selectedDot: { backgroundColor: colors.yellow },
  todayLink: { alignSelf: 'center', paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  kindRow: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 19, backgroundColor: colors.greenLight },
  kindOption: { minHeight: 46, flex: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  kindSelected: { backgroundColor: colors.green },
  kindText: { color: colors.green, fontSize: 16, fontWeight: '600' },
  kindSelectedText: { color: colors.surface },
  modalContent: { padding: 24, gap: 22 },
  label: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  titleInput: { fontSize: 18, color: colors.ink, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 17, padding: 17 },
  mascotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  mascotCard: { width: '48%', flexGrow: 1, borderRadius: 23, borderWidth: 2, borderColor: 'transparent', paddingTop: 9, paddingBottom: 15, alignItems: 'center' },
  selectedMascot: { borderColor: colors.green },
  mascotImage: { width: 118, height: 128 },
  mascotLabel: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 27 },
  mascotName: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  backupCard: { borderRadius: 24, padding: 20, gap: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  backupHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paragraph: { fontSize: 15, lineHeight: 25, color: colors.muted },
  backupHint: { flexDirection: 'row', gap: 12, padding: 15, borderRadius: 17, backgroundColor: colors.greenLight },
  backupHintText: { fontSize: 14, lineHeight: 23, color: colors.green, flex: 1 },
  quietNote: { alignItems: 'center', paddingTop: 18, gap: 13 },
  quietText: { fontSize: 15, lineHeight: 26, color: colors.muted, textAlign: 'center' },
  previewNotice: { backgroundColor: colors.yellowLight, borderRadius: 22, padding: 19, gap: 10 },
});
