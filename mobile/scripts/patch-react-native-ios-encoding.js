const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const hermesPodspecPath = path.join(
  projectRoot,
  'node_modules',
  'react-native',
  'sdks',
  'hermes-engine',
  'hermes-engine.podspec'
);
const hermesBuildScriptPath = path.join(
  projectRoot,
  'node_modules',
  'react-native',
  'sdks',
  'hermes-engine',
  'utils',
  'build-hermes-xcode.sh'
);

function patchHermesPodspec(contents) {
  return contents.replaceAll(
    ']).strip',
    "]).strip.force_encoding('UTF-8')"
  );
}

function patchHermesBuildScript(contents) {
  if (contents.includes('apple_arch_sysroots')) {
    return contents;
  }

  const marker = 'architectures=$( echo "$ARCHS" | tr  " " ";" )\n';
  const insertion = `${marker}apple_arch_sysroots=""\nfor arch in $ARCHS; do\n  if [[ -n "$apple_arch_sysroots" ]]; then\n    apple_arch_sysroots="${apple_arch_sysroots};"\n  fi\n  apple_arch_sysroots="${apple_arch_sysroots}${SDKROOT}"\ndone\n`;

  return contents
    .replace(marker, insertion)
    .replace(
      '-DCMAKE_OSX_ARCHITECTURES:STRING="$architectures" \\',
      '-DCMAKE_OSX_ARCHITECTURES:STRING="$architectures" \\\n  -DCMAKE_APPLE_ARCH_SYSROOTS:STRING="$apple_arch_sysroots" \\'
    );
}

function main() {
  if (!fs.existsSync(hermesPodspecPath)) {
    console.log('Skipping Hermes encoding patch: hermes-engine.podspec not found');
  } else {
    const currentContents = fs.readFileSync(hermesPodspecPath, 'utf8');

    if (currentContents.includes(".strip.force_encoding('UTF-8')")) {
      console.log('Hermes encoding patch already applied');
    } else {
      const nextContents = patchHermesPodspec(currentContents);

      if (nextContents === currentContents) {
        console.log('Skipping Hermes encoding patch: no matching podspec pattern found');
      } else {
        fs.writeFileSync(hermesPodspecPath, nextContents);
        console.log('Applied Hermes encoding patch');
      }
    }
  }

  if (!fs.existsSync(hermesBuildScriptPath)) {
    console.log('Skipping Hermes Xcode sysroot patch: build-hermes-xcode.sh not found');
    return;
  }

  const currentBuildScript = fs.readFileSync(hermesBuildScriptPath, 'utf8');
  const nextBuildScript = patchHermesBuildScript(currentBuildScript);

  if (nextBuildScript === currentBuildScript) {
    console.log('Hermes Xcode sysroot patch already applied');
    return;
  }

  fs.writeFileSync(hermesBuildScriptPath, nextBuildScript);
  console.log('Applied Hermes Xcode sysroot patch');
}

main();
