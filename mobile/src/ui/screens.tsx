import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Countdown, Entry } from '../types';
import { ActionButton, EmptyState, Icon, IconButton, PageHeading, Screen, SectionHeading } from './components';
import { dayKey, daysFromToday, displayDate, displayTime, parseDay } from './dates';
import { useDiaryContext } from './diaryContext';
import { getMascot, mascots } from './mascots';
import { ModalHeader } from './ModalHeader';
import { colors } from './theme';

function showError(title: string, error: unknown) {
  Alert.alert(title, error instanceof Error ? error.message : '请稍后再试。');
}

function sortedEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

function TabHeader({ title }: { title: string }) {
  const router = useRouter();
  function goBack() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.navigate('/');
  }
  return <ModalHeader title={title} onBack={goBack} />;
}

function CountdownCard({ item, compact = false, onDelete }: { item: Countdown; compact?: boolean; onDelete?: () => void }) {
  const days = daysFromToday(item.date);
  return <View style={[styles.countdownCard, compact && styles.countdownCompact]}>
    <View style={styles.countdownIcon}><Icon name="flower-outline" size={25} /></View>
    <View style={styles.flex}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.small}>{parseDay(item.date).toLocaleDateString('zh-CN')}</Text></View>
    <View style={styles.countdownNumber}><Text style={styles.daysNumber}>{days === 0 ? '今天' : Math.abs(days)}</Text>{days !== 0 ? <Text style={styles.daysLabel}>{days > 0 ? '天后' : '天前'}</Text> : null}</View>
    {onDelete ? <IconButton name="ellipsis-horizontal" label={`管理${item.title}`} onPress={onDelete} /> : null}
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
    <View style={styles.entryHeader}><View style={styles.entryTimeGroup}><View style={styles.timeMark} /><Text style={styles.entryTime}>{showDate ? `${new Date(entry.occurredAt).toLocaleDateString('zh-CN')} · ` : ''}{displayTime(entry.occurredAt)}</Text></View><IconButton name="ellipsis-horizontal" label={`管理${displayTime(entry.occurredAt)}的记录`} onPress={actions} /></View>
    {entry.text ? <Text style={styles.entryText} numberOfLines={expanded ? undefined : 7} onTextLayout={(event) => { if (event.nativeEvent.lines.length >= 7) setCanExpand(true); }}>{entry.text}</Text> : null}
    {canExpand ? <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={styles.expandButton}><Text style={styles.link}>{expanded ? '收起文字' : '展开全文'}</Text></Pressable> : null}
    {entry.photos.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.entryPhotos}>{entry.photos.map((photo, index) => <Pressable accessibilityRole="button" accessibilityLabel={`查看这条记录的第 ${index + 1} 张照片`} key={photo.id} onPress={() => setPreview(photo.uri)}><Image source={{ uri: photo.uri }} style={styles.entryPhoto} /></Pressable>)}</ScrollView> : null}
    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <SafeAreaView style={styles.preview}>
        <ModalHeader title="照片" backLabel="返回日记" dark onBack={() => setPreview(null)} />
        {preview ? <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" /> : null}
      </SafeAreaView>
    </Modal>
  </View>;
}

export function TodayScreen() {
  const { data, openWriter } = useDiaryContext();
  const router = useRouter();
  const today = dayKey();
  const entries = sortedEntries(data.entries.filter((entry) => dayKey(entry.occurredAt) === today));
  const mascot = getMascot(data.mascot);
  const nextDay = [...data.countdowns].filter((item) => daysFromToday(item.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  return <Screen>
    <PageHeading title="今天" subtitle={displayDate(new Date())} accessory={<View style={styles.flowerBadge}><Icon name="flower" size={25} color="#927116" /></View>} />
    <View style={[styles.hero, { backgroundColor: mascot.color }]}><View style={styles.heroCopy}><Text style={styles.eyebrow}>今天的小伙伴</Text><Text style={styles.heroTitle}>{mascot.name}</Text><Text style={styles.heroDetail}>陪你记下今天的小事。</Text></View><Image source={mascot.image} style={styles.heroPig} resizeMode="contain" accessibilityLabel={`陪伴你的${mascot.name}`} /></View>
    <ActionButton title={data.draft && (data.draft.text.trim() || data.draft.photos.length) ? '继续上次的草稿' : '写一条记录'} icon="pencil-outline" onPress={() => openWriter()} />
    {nextDay ? <Pressable accessibilityRole="button" accessibilityLabel={`查看期待日：${nextDay.title}`} onPress={() => router.navigate('/countdowns')}><CountdownCard item={nextDay} compact /></Pressable> : null}
    <SectionHeading title="今天的小片段" detail={entries.length ? `${entries.length} 条 · 按发生时间` : undefined} />
    {entries.length ? entries.map((entry) => <EntryCard key={entry.id} entry={entry} />) : <EmptyState title="今天还留着空白" detail="有想记下来的事，再来写就好。\n以前的事也可以随时补记。" />}
    <Text style={styles.pageFootnote}>你的每一个小片段，都有自己的位置。</Text>
  </Screen>;
}

function Calendar({ selected, onSelect, entries }: { selected: string; onSelect: (date: string) => void; entries: Entry[] }) {
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
  const searching = Boolean(query.trim());
  const entries = searching ? data.entries.filter((entry) => entry.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : sortedEntries(data.entries.filter((entry) => dayKey(entry.occurredAt) === reviewDate));
  return <Screen header={<TabHeader title="回看" />}>
    <View style={styles.searchBox}>
      <Icon name="search-outline" size={21} />
      <TextInput accessibilityLabel="搜索日记关键词" placeholder="找一段话，或一件小事" placeholderTextColor="#92978A" value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={styles.searchInput} returnKeyType="search" />
      {searchFocused || query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="取消搜索，返回日历" onPress={() => { setQuery(''); Keyboard.dismiss(); }} style={styles.cancelSearch}><Text style={styles.link}>取消</Text></Pressable> : null}
    </View>
    {!searching ? <Calendar key={reviewDate.slice(0, 7)} selected={reviewDate} onSelect={setReviewDate} entries={data.entries} /> : null}
    <SectionHeading title={searching ? '找到的小片段' : displayDate(parseDay(reviewDate))} detail={`${entries.length} 条`} />
    {entries.length ? entries.map((entry) => <EntryCard key={entry.id} entry={entry} showDate={searching} />) : <EmptyState title={searching ? '暂时没有找到' : '这一天还没有记录'} detail={searching ? '换一个关键词试试。' : '后来想起来，也可以把它补在这一天。'} icon={searching ? 'search-outline' : 'calendar-outline'} />}
    {!searching ? <ActionButton secondary title="补写这一天" icon="pencil-outline" onPress={() => {
      if (data.draft && (data.draft.text.trim() || data.draft.photos.length)) Alert.alert('有一份还没写完的草稿', '先打开草稿，改一下发生日期就可以补写这一天。', [{ text: '稍后', style: 'cancel' }, { text: '打开草稿', onPress: () => openWriter(undefined, reviewDate) }]);
      else openWriter(undefined, reviewDate);
    }} /> : null}
  </Screen>;
}

export function CountdownsScreen() {
  const { data, saveCountdown, deleteCountdown } = useDiaryContext();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedDate, setDate] = useState<Date | null>(null);
  const date = selectedDate ?? new Date();
  const [busy, setBusy] = useState(false);
  const [androidPicker, setAndroidPicker] = useState(false);
  const saving = useRef(false);
  const items = [...data.countdowns].sort((a, b) => {
    const aDays = daysFromToday(a.date), bDays = daysFromToday(b.date);
    if ((aDays < 0) !== (bDays < 0)) return aDays < 0 ? 1 : -1;
    return aDays < 0 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  function remove(item: Countdown) {
    Alert.alert(item.title, '要移除这个日子吗？', [{ text: '保留', style: 'cancel' }, { text: '移除', style: 'destructive', onPress: () => { void deleteCountdown(item.id).catch((error) => showError('没能移除', error)); } }]);
  }
  async function save() {
    if (!title.trim() || saving.current) return;
    saving.current = true;
    setBusy(true);
    try { await saveCountdown({ title: title.trim(), date: dayKey(date) }); setAdding(false); setTitle(''); setDate(null); }
    catch (error) { showError('还没保存好', error); }
    finally { saving.current = false; setBusy(false); }
  }
  function closeForm() {
    if (saving.current) return;
    Keyboard.dismiss();
    setAndroidPicker(false);
    setAdding(false);
  }
  return <Screen header={<TabHeader title="期待" />}>
    <View style={styles.expectationBanner}><Icon name="sunny-outline" size={31} color="#917219" /><Text style={styles.expectationText}>给未来，留一点小小的期待。</Text></View>
    <ActionButton title="放一个日子在这里" icon="add" onPress={() => setAdding(true)} />
    {items.length ? items.map((item) => <CountdownCard key={item.id} item={item} onDelete={() => remove(item)} />) : <EmptyState title="有期待的时候，再放进来" detail="旅行、生日，或任何对你有意义的日子。\n已经过去的日子，也可以记住。" icon="gift-outline" />}
    <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeForm}>
      <SafeAreaView style={styles.modalSafe}>
        <ModalHeader title="一个想记住的日子" onBack={closeForm} busy={busy} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
          <Text style={styles.label}>这是什么日子？</Text>
          <TextInput accessibilityLabel="日子名称" placeholder="例如：去看海" placeholderTextColor="#92978A" value={title} onChangeText={setTitle} maxLength={80} style={styles.titleInput} editable={!busy} />
          <Text style={styles.label}>它在哪一天？</Text>
          {Platform.OS === 'ios' ? <DateTimePicker accessibilityLabel="期待日日期" value={date} mode="date" display="inline" themeVariant="light" locale="zh-CN" disabled={busy} onChange={(_, next) => { if (next && !saving.current) setDate(next); }} /> : <ActionButton secondary disabled={busy} title={dayKey(date)} onPress={() => setAndroidPicker(true)} />}
          {androidPicker ? <DateTimePicker mode="date" value={date} onChange={(_, next) => { setAndroidPicker(false); if (next && !saving.current) setDate(next); }} /> : null}
          <ActionButton title="收好这个日子" busy={busy} disabled={!title.trim()} onPress={() => { void save(); }} />
        </ScrollView>
      </SafeAreaView>
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
  return <Screen header={<TabHeader title="我的小角落" />}>
    <View style={styles.previewNotice}><Text style={styles.cardTitle}>下次怎么打开日记？</Text><Text style={styles.paragraph}>电脑运行「启动日记」，手机和电脑连同一个 Wi-Fi。打开 Expo Go，在首页的 Development servers 里点这台电脑就能继续写。</Text></View>
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
  preview: { flex: 1, backgroundColor: '#171B16F5' },
  previewImage: { flex: 1, width: '100%' },
  countdownCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 19, paddingLeft: 18, paddingRight: 10, backgroundColor: colors.yellowLight, borderRadius: 23 },
  countdownCompact: { paddingRight: 20 },
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
  expectationBanner: { minHeight: 123, borderRadius: 26, backgroundColor: colors.yellowLight, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 13 },
  expectationText: { fontSize: 16, color: colors.ink, lineHeight: 25, textAlign: 'center' },
  modalSafe: { flex: 1, backgroundColor: colors.background },
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
