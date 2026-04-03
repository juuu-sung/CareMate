import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="parent-signup" />
      <Stack.Screen name="parent-complete" />
      <Stack.Screen name="guardian-signup" />
    </Stack>
  );
}