import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import type { ComponentProps, PropsWithChildren } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './theme';
import { BackPage } from './BackPage';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.green }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function ActionButton({ title, onPress, icon, secondary = false, busy = false, disabled = false }: { title: string; onPress: () => void; icon?: IconName; secondary?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={colors.ink} /> : icon ? <Icon name={icon} color={colors.ink} size={21} /> : null}
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, label, onPress, color = colors.green, disabled = false }: { name: IconName; label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled]}><Icon name={name} color={color} /></Pressable>;
}

export function Screen({ children, title }: PropsWithChildren<{ title?: string }>) {
  const router = useRouter();
  const content = <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>;
  if (!title) return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>{content}</SafeAreaView>;
  function back() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.navigate('/');
  }
  return <BackPage title={title} aboveTabBar onBack={back}>{content}</BackPage>;
}

export function PageHeading({ title, subtitle, accessory }: { title: string; subtitle: string; accessory?: React.ReactNode }) {
  return <View style={styles.headingRow}><View style={styles.headingCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>{accessory}</View>;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View>;
}

export function EmptyState({ title, detail, icon = 'flower-outline' }: { title: string; detail: string; icon?: IconName }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Icon name={icon} size={29} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 40, gap: 20 },
  title: { fontSize: 29, fontWeight: '700', color: colors.ink, letterSpacing: 0.6 },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted, marginTop: 7 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  headingCopy: { flex: 1 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: colors.ink },
  detail: { fontSize: 14, color: colors.muted },
  button: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 20, backgroundColor: colors.yellow, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  secondary: { backgroundColor: colors.greenLight },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  buttonText: { fontSize: 16, color: colors.ink, fontWeight: '600', flexShrink: 1 },
  iconButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  empty: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 22, gap: 12 },
  emptyIcon: { width: 58, height: 58, borderRadius: 24, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, color: colors.ink, fontWeight: '600', textAlign: 'center' },
  emptyDetail: { fontSize: 15, lineHeight: 24, textAlign: 'center', color: colors.muted },
});
