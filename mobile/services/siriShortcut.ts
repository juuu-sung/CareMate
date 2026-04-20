import { NativeModules, Platform } from 'react-native';

export type PendingSiriShortcutAction = 'startVoiceChat';

type CareShortcutNativeModule = {
  getPendingLaunchAction?: () => Promise<string | null>;
};

function getNativeModule(): CareShortcutNativeModule | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (NativeModules.CareShortcutModule as CareShortcutNativeModule | undefined) ?? null;
}

export async function consumePendingSiriShortcutAction(): Promise<PendingSiriShortcutAction | null> {
  const nativeModule = getNativeModule();

  if (!nativeModule?.getPendingLaunchAction) {
    return null;
  }

  try {
    const action = await nativeModule.getPendingLaunchAction();
    return action === 'startVoiceChat' ? action : null;
  } catch {
    return null;
  }
}
