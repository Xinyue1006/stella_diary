import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { colors } from '../../ui/theme';

export default function TabLayout() {
  return <Tabs backBehavior="history" screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 12, fontWeight: '500' }, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: colors.background } }}>
    <Tabs.Screen name="index" options={{ title: '今天', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'sunny' : 'sunny-outline'} size={25} color={typeof color === 'string' ? color : colors.green} /> }} />
    <Tabs.Screen name="review" options={{ title: '回看', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={24} color={typeof color === 'string' ? color : colors.green} /> }} />
    <Tabs.Screen name="countdowns" options={{ title: '期待', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'flower' : 'flower-outline'} size={24} color={typeof color === 'string' ? color : colors.green} /> }} />
    <Tabs.Screen name="settings" options={{ title: '我的', tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'heart' : 'heart-outline'} size={24} color={typeof color === 'string' ? color : colors.green} /> }} />
  </Tabs>;
}
