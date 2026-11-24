import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './components';
import { colors } from './theme';

/** Place inside the modal SafeAreaView and outside its scrolling/keyboard area. */
export function ModalHeader({ title, onBack, backLabel = '返回', disabled = false, busy = false, dark = false }: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  dark?: boolean;
}) {
  const foreground = dark ? '#FFFFFF' : colors.ink;
  const backColor = dark ? '#FFFFFF' : colors.green;
  return <View style={[styles.header, dark && styles.darkHeader]}>
    <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="返回上一页" accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
      <Icon name="chevron-back" size={22} color={backColor} />
      <Text style={[styles.backText, { color: backColor }]}>{backLabel}</Text>
    </Pressable>
    <Text accessibilityRole="header" style={[styles.title, { color: foreground }]} numberOfLines={2}>{title}</Text>
    <View style={styles.activity}>{busy ? <ActivityIndicator accessibilityLabel="正在保存，请稍候" color={foreground} /> : null}</View>
  </View>;
}

const styles = StyleSheet.create({
  header: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, minHeight: 62, backgroundColor: colors.background, borderBottomWidth: 1, borderColor: colors.line },
  darkHeader: { backgroundColor: 'transparent', borderColor: '#FFFFFF24' },
  back: { minHeight: 48, minWidth: 78, maxWidth: '46%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 3, borderRadius: 16, paddingHorizontal: 5, paddingVertical: 9 },
  backText: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  title: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  activity: { width: 30, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.45 },
});
