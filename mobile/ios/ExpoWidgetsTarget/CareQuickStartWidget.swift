import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct CareQuickStartWidget: Widget {
  let name: String = "CareQuickStartWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      WidgetsEntryView(entry: entry)
    }
    .configurationDisplayName("케어 대화")
    .description("한 번 눌러 바로 음성 대화를 시작합니다.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}