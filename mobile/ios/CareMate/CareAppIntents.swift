import AppIntents
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
        return .result(dialog: IntentDialog("케어를 열어 음성 대화를 시작할게요."))
    }
}

@available(iOS 16.0, *)
struct CareShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartVoiceChatIntent(),
            phrases: [
                "\(.applicationName) 대화 시작",
                "\(.applicationName) 열고 대화 시작",
                "음성 대화 시작 \(.applicationName)"
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
