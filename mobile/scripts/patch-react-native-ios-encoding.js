const fs = require("fs");
const path = require("path");

function findHermesScript() {
  const candidates = [
    path.join(
      process.cwd(),
      "node_modules",
      "react-native",
      "sdks",
      "hermes-engine",
      "utils",
      "build-hermes-xcode.sh"
    ),
    path.join(
      process.cwd(),
      "node_modules",
      "react-native",
      "sdks",
      "hermes",
      "utils",
      "build-hermes-xcode.sh"
    ),
    path.join(
      process.cwd(),
      "node_modules",
      "hermes-engine",
      "utils",
      "build-hermes-xcode.sh"
    ),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function patchHermesBuildScript(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  const marker = 'NODE_BINARY=$(command -v node)\n';

  if (!source.includes(marker)) {
    console.log("Hermes build marker not found, skipping patch");
    return false;
  }

  if (source.includes('apple_arch_sysroots=""')) {
    console.log("Hermes encoding patch already applied");
    return false;
  }

  const insertion =
    marker +
    'apple_arch_sysroots=""\n' +
    'for arch in $ARCHS; do\n' +
    '  if [[ -n "$apple_arch_sysroots" ]]; then\n' +
    '    apple_arch_sysroots="${apple_arch_sysroots};"\n' +
    '  fi\n' +
    '  apple_arch_sysroots="${apple_arch_sysroots}${SDKROOT}"\n' +
    'done\n';

  const patched = source.replace(marker, insertion);

  if (patched === source) {
    console.log("No changes applied to Hermes build script");
    return false;
  }

  fs.writeFileSync(filePath, patched, "utf8");
  console.log("Applied Hermes encoding patch");
  return true;
}

function main() {
  const hermesScriptPath = findHermesScript();

  if (!hermesScriptPath) {
    console.log("Hermes build script not found, skipping patch");
    process.exit(0);
  }

  patchHermesBuildScript(hermesScriptPath);
  process.exit(0);
}

main();