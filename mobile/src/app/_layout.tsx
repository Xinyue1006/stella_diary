import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DiaryProvider } from '../ui/DiaryProvider';

export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark" /><DiaryProvider><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /></Stack></DiaryProvider></SafeAreaProvider>;
}
