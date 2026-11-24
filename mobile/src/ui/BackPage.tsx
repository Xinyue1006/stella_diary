import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, type PropsWithChildren, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

type BackPageProps = PropsWithChildren<{
  title: string;
  onBack: () => void;
  backLabel?: string;
  disabled?: boolean;
  dark?: boolean;
  aboveTabBar?: boolean;
  action?: ReactNode;
}>;

export function BackPage({ title, onBack, children, backLabel = '返回', disabled = false, dark = false, aboveTabBar = false, action }: BackPageProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const start = useRef<{ x: number; y: number } | null>(null);

  // Only take horizontal gestures that start in the right margin. Text fields,
  // photo strips, date pickers and the bottom actions retain their own gestures.
  function rememberTouch(event: GestureResponderEvent) {
    const { pageX, pageY, touches } = event.nativeEvent;
    start.current = !disabled && Platform.OS === 'ios' && touches.length === 1 &&
      pageX >= width - insets.right - 20 ? { x: pageX, y: pageY } : null;
    return false;
  }

  function shouldCapture(event: GestureResponderEvent) {
    if (!start.current) return false;
    const { pageX, pageY, touches } = event.nativeEvent;
    const horizontal = start.current.x - pageX;
    const vertical = Math.abs(start.current.y - pageY);
    if (touches.length !== 1 || vertical > 18 || horizontal < -12) start.current = null;
    return Boolean(start.current) && horizontal > 14 && horizontal > vertical * 2;
  }

  function releaseTouch(event: GestureResponderEvent) {
    const origin = start.current;
    start.current = null;
    if (!origin || disabled) return;
    const left = origin.x - event.nativeEvent.pageX;
    if (left >= 64 && left > Math.abs(event.nativeEvent.pageY - origin.y) * 2) onBack();
  }

  const foreground = dark ? '#FFFFFF' : colors.green;
  return <KeyboardAvoidingView style={[styles.page, dark && styles.dark]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SafeAreaView style={styles.flex} edges={aboveTabBar ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
      <Text accessibilityRole="header" style={[styles.title, dark && styles.lightText]}>{title}</Text>
      <View style={styles.flex}
        onStartShouldSetResponderCapture={rememberTouch}
        onMoveShouldSetResponderCapture={shouldCapture}
        onResponderMove={event => { if (event.nativeEvent.touches.length !== 1) start.current = null; }}
        onResponderRelease={releaseTouch}
        onResponderTerminate={() => { start.current = null; }}>
        {children}
      </View>
      <View style={[styles.footer, dark && styles.darkFooter]}>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="返回上一页"
          accessibilityState={{ disabled }} disabled={disabled} onPress={onBack}
          style={({ pressed }) => [styles.back, dark && styles.darkBack, (pressed || disabled) && styles.dim]}>
          <Ionicons name="chevron-back" size={21} color={foreground} />
          <Text style={[styles.backText, { color: foreground }]}>{backLabel}</Text>
        </Pressable>
        {action && <View style={styles.flex}>{action}</View>}
      </View>
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.background },
  dark: { backgroundColor: '#171B16F5' },
  title: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 18, textAlign: 'center', fontWeight: '600', color: colors.ink },
  lightText: { color: '#FFFFFF' },
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 6 },
  darkFooter: { borderColor: '#FFFFFF40' },
  back: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.greenLight },
  darkBack: { backgroundColor: '#FFFFFF24' },
  backText: { fontWeight: '600', fontSize: 16 },
  dim: { opacity: 0.55 },
});
