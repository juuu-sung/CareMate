const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  createRunOncePlugin,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-care-siri-shortcuts';
const PLUGIN_VERSION = '1.0.0';
const MODULE_FILE_NAME = 'CareShortcutModule.m';
const APP_INTENTS_FILE_NAME = 'CareAppIntents.swift';

function addShortcutRegistrationToAppDelegate(contents) {
  if (contents.includes('CareShortcutUpdater.register()')) {
    return contents;
  }

  const returnPattern = /^([ \t]+return\s+super\.application\([^\n]+\))/m;
  if (!returnPattern.test(contents)) {
    return contents;
  }

  return contents.replace(
    returnPattern,
    `    if #available(iOS 16.0, *) {\n      CareShortcutUpdater.register()\n    }\n\n$1`
  );
}

function sanitizeForSwiftString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function writeFileIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === contents) {
      return;
    }
  }

  fs.writeFileSync(filePath, contents);
}

function getModuleSource() {
  return `#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static NSString * const CareShortcutPendingActionKey = @"CareShortcutPendingAction";

@interface CareShortcutModule : NSObject <RCTBridgeModule>
@end

@implementation CareShortcutModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_REMAP_METHOD(getPendingLaunchAction,
                 getPendingLaunchActionWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  NSString *action = [defaults stringForKey:CareShortcutPendingActionKey];

  if (action != nil) {
    [defaults removeObjectForKey:CareShortcutPendingActionKey];
    [defaults synchronize];
  }

  resolve(action ?: (id)kCFNull);
}

@end
`;
}

function getAppIntentsSource({ spokenName }) {
  const safeSpokenName = sanitizeForSwiftString(spokenName);

  return `import AppIntents
import Foundation

private enum CareShortcutPendingAction: String {
    case startVoiceChat = "startVoiceChat"
}

private enum CareShortcutStorage {
    static let pendingActionKey = "CareShortcutPendingAction"

    static func store(_ action: CareShortcutPendingAction) {
        let defaults = UserDefaults.standard
        defaults.set(action.rawValue, forKey: pendingActionKey)
        defaults.synchronize()
    }
}

@available(iOS 16.0, *)
struct StartVoiceChatIntent: AppIntent {
    static var title: LocalizedStringResource = "대화 시작"
    static var description = IntentDescription("케어 음성 대화를 바로 시작합니다.")
    static var openAppWhenRun: Bool = true

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes { .foreground(.deferred) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        CareShortcutStorage.store(.startVoiceChat)
        return .result(dialog: IntentDialog("${safeSpokenName}를 열어 음성 대화를 시작할게요."))
    }
}

@available(iOS 16.0, *)
struct CareShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartVoiceChatIntent(),
            phrases: [
                "\\(.applicationName) 대화 시작",
                "\\(.applicationName) 열고 대화 시작",
                "음성 대화 시작 \\(.applicationName)"
            ],
            shortTitle: "대화 시작",
            systemImageName: "mic.circle.fill"
        )
    }
}

@available(iOS 16.0, *)
struct CareShortcutUpdater {
    static func register() {
        CareShortcutsProvider.updateAppShortcutParameters()
    }
}
`;
}

function ensureNativeFiles(projectRoot, props) {
  const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
  writeFileIfChanged(path.join(sourceRoot, MODULE_FILE_NAME), getModuleSource());
  writeFileIfChanged(
    path.join(sourceRoot, APP_INTENTS_FILE_NAME),
    getAppIntentsSource({
      spokenName: props.spokenName,
    })
  );
}

function ensureXcodeSources(projectRoot, project) {
  const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
  const groupName = projectName;

  for (const fileName of [MODULE_FILE_NAME, APP_INTENTS_FILE_NAME]) {
    const filepath = `${projectName}/${fileName}`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName,
        project,
        verbose: true,
      });
    }
  }

  return project;
}

const withCareSiriShortcuts = (config, rawProps = {}) => {
  const props = {
    appSynonym: rawProps.appSynonym || '케어',
    spokenName: rawProps.spokenName || rawProps.appSynonym || '케어',
  };

  config = withInfoPlist(config, (config) => {
    const infoPlist = config.modResults;
    infoPlist.CFBundleSpokenName = props.spokenName;

    const existing = Array.isArray(infoPlist.INAlternativeAppNames) ? infoPlist.INAlternativeAppNames : [];
    const filtered = existing.filter((entry) => entry?.INAlternativeAppName !== props.appSynonym);
    filtered.push({
      INAlternativeAppName: props.appSynonym,
      INAlternativeAppNamePronunciationHint: props.spokenName,
    });
    infoPlist.INAlternativeAppNames = filtered;

    return config;
  });

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      ensureNativeFiles(config.modRequest.projectRoot, props);
      return config;
    },
  ]);

  config = withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      return config;
    }

    config.modResults.contents = addShortcutRegistrationToAppDelegate(config.modResults.contents);
    return config;
  });

  config = withXcodeProject(config, (config) => {
    config.modResults = ensureXcodeSources(config.modRequest.projectRoot, config.modResults);
    return config;
  });

  return config;
};

module.exports = createRunOncePlugin(withCareSiriShortcuts, PLUGIN_NAME, PLUGIN_VERSION);
