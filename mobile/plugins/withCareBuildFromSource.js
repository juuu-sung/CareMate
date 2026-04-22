const fs = require('fs');
const path = require('path');
const { createRunOncePlugin, withDangerousMod, withPodfileProperties } = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-care-build-from-source';
const PLUGIN_VERSION = '1.0.0';

function removeHermesBuildFromSource(contents) {
  return contents.replace(/ENV\['RCT_BUILD_HERMES_FROM_SOURCE'\] \|\|= 'true'\n/g, '');
}

const withCareBuildFromSource = (config) => {
  config = withPodfileProperties(config, (config) => {
    config.modResults['ios.buildReactNativeFromSource'] = 'true';
    return config;
  });

  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      const currentContents = fs.readFileSync(podfilePath, 'utf8');
      let nextContents = removeHermesBuildFromSource(currentContents);
      nextContents = nextContents.replace(
        /ENV\['RCT_USE_RN_DEP'\] \|\|= '1' if podfile_properties\['ios\.buildReactNativeFromSource'\] != 'true'\n/g,
        ''
      );
      nextContents = nextContents.replace(
        /ENV\['RCT_USE_PREBUILT_RNCORE'\] \|\|= '1' if podfile_properties\['ios\.buildReactNativeFromSource'\] != 'true'\n/g,
        ''
      );

      if (currentContents !== nextContents) {
        fs.writeFileSync(podfilePath, nextContents);
      }

      return config;
    },
  ]);
};

module.exports = createRunOncePlugin(withCareBuildFromSource, PLUGIN_NAME, PLUGIN_VERSION);
