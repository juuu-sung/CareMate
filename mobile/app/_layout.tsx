import { Stack } from 'expo-router';
import '../services/locationTask';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="parent-login" />
      <Stack.Screen name="parent-signup" />
      <Stack.Screen name="parent-complete" />
      <Stack.Screen name="parent-agent-voice-setup" />
      <Stack.Screen name="parent-agent-name-setup" />
      <Stack.Screen name="home" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="calendar" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="guardian-login" />
      <Stack.Screen name="guardian-signup" />
      <Stack.Screen name="guardian-parent-info" />
      <Stack.Screen name="guardian-home" />
    </Stack>
  );
}
