import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import type { AuthSession } from '../services/authSession';
import {
  getAuthSessionHomeRoute,
  loadAuthSession,
} from '../services/authSession';
import {
  checkForNewGuardianLetter,
  primeGuardianLetterNotificationState,
} from '../services/letterNotifications';
import '../services/locationTask';
import { consumePendingSiriShortcutAction } from '../services/siriShortcut';
import { destroyWakeWord, startWakeWordListening, stopWakeWordListening } from '../services/wakeWord';
import { initializeWidgets } from '../services/widgets';

const PUBLIC_ENTRY_PATHS = new Set([
  '/',
  '/index',
  '/parent-login',
  '/guardian-login',
  '/parent-signup',
  '/guardian-signup',
]);

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  const isHandlingShortcutRef = useRef(false);
  const isShowingGuardianLetterAlertRef = useRef(false);

  const handlePendingSiriShortcut = useCallback(async () => {
    if (isHandlingShortcutRef.current) {
      return;
    }

    isHandlingShortcutRef.current = true;

    try {
      const action = await consumePendingSiriShortcutAction();

      if (action !== 'startVoiceChat') {
        return;
      }

      await stopWakeWordListening();

      if (pathname !== '/chat') {
        router.push('/chat?input=voice&autostart=1&shortcut=siri');
      }
    } finally {
      isHandlingShortcutRef.current = false;
    }
  }, [pathname, router]);

  useEffect(() => {
    initializeWidgets();

    const subscription = AppState.addEventListener('change', setAppState);

    return () => {
      subscription.remove();
      void destroyWakeWord();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const storedSession = await loadAuthSession();

        if (!cancelled) {
          setAuthSession(storedSession);
        }

        if (
          !cancelled &&
          storedSession &&
          PUBLIC_ENTRY_PATHS.has(pathname)
        ) {
          router.replace(getAuthSessionHomeRoute(storedSession));
        }
      } finally {
        if (!cancelled) {
          setIsSessionHydrated(true);
        }
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    void handlePendingSiriShortcut();
  }, [handlePendingSiriShortcut]);

  useEffect(() => {
    let disposed = false;
    const shouldListen = appState === 'active' && pathname !== '/chat';

    if (appState === 'active') {
      void handlePendingSiriShortcut();
    }

    if (shouldListen) {
      void startWakeWordListening({
        onDetected: async () => {
          if (disposed) {
            return;
          }

          await stopWakeWordListening();

          if (pathname !== '/chat') {
            router.push('/chat?input=voice&autostart=1&wakeup=1');
          }
        },
        onError: (message) => {
          console.log('Wake word:', message);
        },
      });
    } else {
      void stopWakeWordListening();
    }

    return () => {
      disposed = true;
    };
  }, [appState, handlePendingSiriShortcut, pathname, router]);

  useEffect(() => {
    let disposed = false;

    if (appState !== 'active' || authSession?.role !== 'parent') {
      return () => {
        disposed = true;
      };
    }

    const elderUserId = authSession.elderUserId || authSession.parentId;
    const { linkCode, parentName } = authSession;

    if (!elderUserId || !linkCode) {
      return () => {
        disposed = true;
      };
    }

    const checkGuardianLetter = async (primeOnly: boolean) => {
      try {
        if (primeOnly) {
          await primeGuardianLetterNotificationState(elderUserId, linkCode);
          return;
        }

        const latestGuardianLetter = await checkForNewGuardianLetter(
          elderUserId,
          linkCode
        );

        if (
          disposed ||
          !latestGuardianLetter ||
          isShowingGuardianLetterAlertRef.current
        ) {
          return;
        }

        isShowingGuardianLetterAlertRef.current = true;

        Alert.alert(
          '새 보호자 메시지',
          `${parentName} 님께 새 편지가 도착했어요.\n\n${latestGuardianLetter.content}`,
          [
            {
              text: '나중에 보기',
              style: 'cancel',
              onPress: () => {
                isShowingGuardianLetterAlertRef.current = false;
              },
            },
            {
              text: '확인하기',
              onPress: () => {
                isShowingGuardianLetterAlertRef.current = false;
                router.replace(getAuthSessionHomeRoute(authSession));
              },
            },
          ]
        );
      } catch (error) {
        console.log('보호자 메시지 알림 확인 오류:', error);
      }
    };

    void checkGuardianLetter(true);

    const interval = setInterval(() => {
      void checkGuardianLetter(false);
    }, 5000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [appState, authSession, router]);

  if (!isSessionHydrated) {
    return null;
  }

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
      <Stack.Screen name="guardian-health" />
      <Stack.Screen name="guardian-conversations" />
      <Stack.Screen name="guardian-location" />
      <Stack.Screen name="guardian-letter" />
    </Stack>
  );
}
