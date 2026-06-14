import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

let hasInitializedWidgets = false;

export function initializeWidgets() {
  if (Platform.OS !== 'ios' || hasInitializedWidgets) {
    return;
  }

  if (!requireOptionalNativeModule('ExpoWidgets')) {
    return;
  }

  try {
    const careQuickStartWidget = require('../widgets/CareQuickStartWidget')
      .default as typeof import('../widgets/CareQuickStartWidget').default;

    careQuickStartWidget.updateSnapshot({
      title: '바로 말하기',
      subtitle: '누르면 바로 음성 대화를 시작해요.',
      shortLabel: '케어',
    });

    hasInitializedWidgets = true;
  } catch (e) {
    console.log('expo-widgets skipped');
  }
}
