const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withDangerousMod } = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-care-widgets-pods-fix';
const PLUGIN_VERSION = '1.0.0';

const WIDGETS_REQUIRE_PATTERN =
  /require File\.join\(File\.dirname\(`node --print "require\.resolve\('expo-widgets\/package\.json'\)"`\), "scripts\/autolinking"\)/;

const WIDGETS_PODS_FIX = `
def use_expo_modules_widgets!(options = {})
  output = Expo::AutolinkingManager.new(self, @current_target_definition, options).send(:resolve)

  all_packages = output["modules"].map { |mod| mod["packageName"] }
  used_packages = ["expo", "expo-widgets", "@expo/ui"]
  packages_to_exclude = all_packages - used_packages

  options[:exclude] = packages_to_exclude
  use_expo_modules!(options)
end
`;

function applyWidgetsPodsFix(contents) {
  if (contents.includes('send(:resolve)')) {
    return contents;
  }

  const requireLineMatch = contents.match(WIDGETS_REQUIRE_PATTERN);

  if (!requireLineMatch) {
    return contents;
  }

  const requireLine = requireLineMatch[0];
  return contents.replace(requireLine, `${requireLine}\n${WIDGETS_PODS_FIX}`);
}

const withCareWidgetsPodsFix = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      const currentContents = fs.readFileSync(podfilePath, 'utf8');
      const nextContents = applyWidgetsPodsFix(currentContents);

      if (currentContents !== nextContents) {
        fs.writeFileSync(podfilePath, nextContents);
      }

      return config;
    },
  ]);

module.exports = createRunOncePlugin(withCareWidgetsPodsFix, PLUGIN_NAME, PLUGIN_VERSION);
