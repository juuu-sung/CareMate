import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import type { AuthSession } from '../services/authSession';
import {
  getAuthSessionHomeRoute,
  loadAuthSession,
  subscribeAuthSession,
} from '../services/authSession';

import {
  checkForNewGuardianLetter,
  primeGuardianLetterNotificationState,
} from '../services/letterNotifications';
import { addMedicationReminderResponseListener } from '../services/medicationReminders';
import {
  addCarePushResponseListener,
  registerCurrentDeviceForPush,
} from '../services/pushNotifications';
import {
  addScheduleReminderResponseListener,
  syncSchedulesToDevice,
} from '../services/scheduleDeviceSync';

import {
  ensureBackgroundLocationSync,
  stopBackgroundLocationSync,
  syncRequestedElderLocation,
} from '../services/locationTask';

import { consumePendingSiriShortcutAction } from '../services/siriShortcut';

import {
  destroyWakeWord,
  startWakeWordListening,
  stopWakeWordListening,
} from '../services/wakeWord';

const PUBLIC_ENTRY_PATHS = new Set([
  '/',
  '/index',
  '/parent-login',
  '/guardian-login',
  '/parent-signup',
  '/guardian-signup',
]);

function isSameAuthSession(
  currentSession: AuthSession | null,
  nextSession: AuthSession | null
) {
  return JSON.stringify(currentSession) === JSON.stringify(nextSession);
}

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);

  const pathnameRef = useRef(pathname);
  const authSessionRef = useRef<AuthSession | null>(null);

  const isHandlingShortcutRef = useRef(false);
  const isShowingGuardianLetterAlertRef = useRef(false);

  const wakeStartedRef = useRef(false);
  const wakeNavigatingRef = useRef(false);
  const pushRegistrationKeyRef = useRef('');
  const scheduleSyncKeyRef = useRef('');
  const scheduleSyncAtRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname;

    if (pathname === '/home') {
      wakeNavigatingRef.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  const applyAuthSession = useCallback((nextSession: AuthSession | null) => {
    authSessionRef.current = nextSession;
    setAuthSession((currentSession) => {
      if (isSameAuthSession(currentSession, nextSession)) {
        return currentSession;
      }

      return nextSession;
    });
  }, []);

  useEffect(() => {
    const subscription = addMedicationReminderResponseListener((data) => {
      const session = authSessionRef.current;

      if (session?.role !== 'parent') {
        return;
      }

      const elderUserId = data.elderUserId || session.elderUserId || session.parentId;

      router.push({
        pathname: '/elder-medication',
        params: {
          elderUserId,
          elder_user_id: elderUserId,
          parentName: session.parentName,
          medicationId: data.medicationId,
          medicationName: data.medicationName,
          timeScope: data.timeScope,
        },
      });
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    const subscription = addScheduleReminderResponseListener(() => {
      const session = authSessionRef.current;

      if (session?.role !== 'parent') {
        return;
      }

      router.push({
        pathname: '/calendar',
        params: {
          viewerRole: 'parent',
          elderUserId: session.elderUserId || session.parentId,
          parentId: session.parentId,
        },
      });
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    const subscription = addCarePushResponseListener((data) => {
      const session = authSessionRef.current;

      if (!session) {
        return;
      }

      if (session.role === 'guardian' && data.targetRole === 'guardian') {
        router.push({
          pathname: '/guardian-alerts',
          params: {
            parentId: session.parentId,
            parentName: session.parentName,
            linkCode: session.linkCode,
          },
        });
        return;
      }

      if (session.role === 'parent' && data.targetRole === 'elder') {
        const elderUserId = session.elderUserId || session.parentId;

        if (data.alertType === 'location_request') {
          void syncRequestedElderLocation({
            elderUserId,
            linkCode: session.linkCode,
          });
        }

        if (data.alertType === 'schedule_sync') {
          void syncSchedulesToDevice({ elderUserId }).catch((error) => {
            console.log('[ScheduleSync] push sync error:', error);
          });
        }

        if (data.alertType === 'schedule_sync') {
          router.push({
            pathname: '/calendar',
            params: {
              viewerRole: 'parent',
              elderUserId,
              parentId: session.parentId,
            },
          });
        } else {
          router.push({
            pathname: '/home',
            params: {
              parentId: session.parentId,
              elderUserId,
              parentName: session.parentName,
              linkCode: session.linkCode,
            },
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  const handlePendingSiriShortcut = useCallback(async () => {
    if (isHandlingShortcutRef.current) return;

    isHandlingShortcutRef.current = true;

    try {
      const action = await consumePendingSiriShortcutAction();

      if (action !== 'startVoiceChat') return;

      if (wakeStartedRef.current) {
        wakeStartedRef.current = false;
        await stopWakeWordListening();
      }

      if (pathnameRef.current !== '/chat') {
        router.push('/chat?input=voice&autostart=1&shortcut=siri');
      }
    } catch (error) {
      console.log('[SiriShortcut] error:', error);
    } finally {
      isHandlingShortcutRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const storedSession = await loadAuthSession();

        if (cancelled) return;

        applyAuthSession(storedSession);

        if (storedSession && PUBLIC_ENTRY_PATHS.has(pathnameRef.current)) {
          router.replace(getAuthSessionHomeRoute(storedSession));
        }
      } catch (error) {
        console.log('SESSION RESTORE ERROR:', error);
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
  }, [applyAuthSession, router]);

  useEffect(() => {
    return subscribeAuthSession((nextSession) => {
      applyAuthSession(nextSession);
    });
  }, [applyAuthSession]);

  useEffect(() => {
    if (appState === 'active') {
      void handlePendingSiriShortcut();
    }
  }, [appState, handlePendingSiriShortcut]);

  useEffect(() => {
    if (!isSessionHydrated || appState !== 'active' || !authSession) {
      if (!authSession) {
        pushRegistrationKeyRef.current = '';
      }
      return;
    }

    const registrationKey =
      authSession.role === 'parent'
        ? `parent:${authSession.parentId}:${authSession.linkCode}`
        : `guardian:${authSession.guardianId}:${authSession.parentId}:${authSession.linkCode}`;

    if (pushRegistrationKeyRef.current === registrationKey) {
      return;
    }

    pushRegistrationKeyRef.current = registrationKey;

    void registerCurrentDeviceForPush(authSession).catch((error) => {
      pushRegistrationKeyRef.current = '';
      console.log('[PushNotification] registration error:', error);
    });
  }, [appState, authSession, isSessionHydrated]);

  useEffect(() => {
    if (!isSessionHydrated || appState !== 'active') {
      return;
    }

    if (authSession?.role !== 'parent') {
      void stopBackgroundLocationSync().catch((error) => {
        console.log('[LocationTask] stop background sync error:', error);
      });
      return;
    }

    const elderUserId = authSession.elderUserId || authSession.parentId;

    void ensureBackgroundLocationSync({
      elderUserId,
      linkCode: authSession.linkCode,
    }).then((status) => {
      if (!status.started) {
        console.log('[LocationTask] background sync not started:', status.message);
      }
    }).catch((error) => {
      console.log('[LocationTask] background sync setup error:', error);
    });
  }, [appState, authSession, isSessionHydrated]);

  useEffect(() => {
    if (
      !isSessionHydrated ||
      appState !== 'active' ||
      authSession?.role !== 'parent'
    ) {
      return;
    }

    const elderUserId = authSession.elderUserId || authSession.parentId;
    const syncKey = `schedule:${elderUserId}:${authSession.linkCode}`;
    const now = Date.now();

    if (
      scheduleSyncKeyRef.current === syncKey &&
      now - scheduleSyncAtRef.current < 60 * 1000
    ) {
      return;
    }

    scheduleSyncKeyRef.current = syncKey;
    scheduleSyncAtRef.current = now;

    void syncSchedulesToDevice({ elderUserId }).catch((error) => {
      scheduleSyncKeyRef.current = '';
      console.log('[ScheduleSync] active sync error:', error);
    });
  }, [appState, authSession, isSessionHydrated]);

  useEffect(() => {
    let disposed = false;

    const shouldListen =
      isSessionHydrated &&
      appState === 'active' &&
      pathname === '/home' &&
      authSession?.role === 'parent';

    if (!shouldListen) {
      return () => {
        disposed = true;
      };
    }

    if (wakeStartedRef.current) {
      return () => {
        disposed = true;
      };
    }

    wakeStartedRef.current = true;

    const wakeName = authSession.agentName?.trim() || '케어';

    void startWakeWordListening({
      wakeName,
      onDetected: async () => {
        if (disposed) return;
        if (pathnameRef.current !== '/home') return;
        if (wakeNavigatingRef.current) return;

        wakeNavigatingRef.current = true;
        wakeStartedRef.current = false;

        await destroyWakeWord();

        router.push({
          pathname: '/chat',
          params: {
            input: 'voice',
            autostart: '1',
            wakeup: '1',
            elderUserId: authSession.elderUserId || authSession.parentId,
            elder_user_id: authSession.elderUserId || authSession.parentId,
            parentName: authSession.parentName,
            linkCode: authSession.linkCode,
            link_code: authSession.linkCode,
            selectedVoice: authSession.agentVoice,
            agentVoice: authSession.agentVoice,
            agent_voice: authSession.agentVoice,
            agentName: wakeName,
            agent_name: wakeName,
          },
        });
      },
      onError: (message) => {
        console.log('[WakeWord] error:', message);
      },
    });

    return () => {
      disposed = true;
      wakeStartedRef.current = false;
      wakeNavigatingRef.current = false;
      void destroyWakeWord();
    };
  }, [
    isSessionHydrated,
    appState,
    pathname,
    authSession?.role,
    authSession?.role === 'parent' ? authSession.agentName : undefined,
    authSession?.role === 'parent' ? authSession.agentVoice : undefined,
    router,
  ]);

  useEffect(() => {
    let disposed = false;

    const shouldRunLetterCheck =
      isSessionHydrated &&
      appState === 'active' &&
      authSession?.role === 'parent';

    if (!shouldRunLetterCheck) {
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

                const latestSession = authSessionRef.current;

                if (latestSession) {
                  router.replace(getAuthSessionHomeRoute(latestSession));
                }
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
    }, 30000);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [isSessionHydrated, appState, authSession, router]);

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
      <Stack.Screen name="guardian-alerts" />
      <Stack.Screen name="guardian-alert-history" />
      <Stack.Screen name="guardian-medications" />
      <Stack.Screen name="guardian-conversations" />
      <Stack.Screen name="guardian-depression-risk" />
      <Stack.Screen name="guardian-location" />
      <Stack.Screen name="guardian-letter" />
    </Stack>
  );
}
