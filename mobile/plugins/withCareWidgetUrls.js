const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-care-widget-urls';
const PLUGIN_VERSION = '1.0.0';
const TARGET_NAME = 'ExpoWidgetsTarget';

function injectWidgetUrl(contents, url) {
  const sanitizedContents = contents.replace(/\n\s+\.widgetURL\(URL\(string: ".*?"\)\)/g, '');
  const entryViewPattern = /(\s+WidgetsEntryView\(entry: entry\))/m;

  if (!entryViewPattern.test(sanitizedContents)) {
    return sanitizedContents;
  }

  return sanitizedContents.replace(
    entryViewPattern,
    `$1\n        .widgetURL(URL(string: "${url}"))`
  );
}

const withCareWidgetUrls = (config, props = {}) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const widgets = Array.isArray(props.widgets) ? props.widgets : [];
      const widgetsTargetPath = path.join(config.modRequest.platformProjectRoot, TARGET_NAME);

      for (const widget of widgets) {
        const widgetFilePath = path.join(widgetsTargetPath, `${widget.name}.swift`);
        if (!fs.existsSync(widgetFilePath)) {
          continue;
        }

        const currentContents = fs.readFileSync(widgetFilePath, 'utf8');
        const nextContents = injectWidgetUrl(currentContents, widget.url);
        if (currentContents !== nextContents) {
          fs.writeFileSync(widgetFilePath, nextContents);
        }
      }

      return config;
    },
  ]);

module.exports = createRunOncePlugin(withCareWidgetUrls, PLUGIN_NAME, PLUGIN_VERSION);
