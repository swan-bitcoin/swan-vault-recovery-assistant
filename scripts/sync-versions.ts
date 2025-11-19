import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import semver from "semver";

type BumpType = "major" | "minor" | "patch";

const main = () => {
  const bumpType = process.argv[2] as BumpType;
  if (!["major", "minor", "patch"].includes(bumpType)) {
    throw new Error(
      `Invalid version bump type: ${bumpType}. Must be one of 'major', 'minor', or 'patch'.`
    );
  }

  const packageJsonPath = join(process.cwd(), "package.json");
  const tauriConfPath = join(process.cwd(), "src-tauri", "tauri.conf.json");
  const cargoTomlPath = join(process.cwd(), "src-tauri", "Cargo.toml");

  // 1. Read current version from package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const currentVersion = packageJson.version;

  if (!currentVersion) {
    throw new Error("Could not find version in package.json");
  }

  // 2. Calculate the new version
  const newVersion = semver.inc(currentVersion, bumpType);
  if (!newVersion) {
    throw new Error(
      `Could not increment version ${currentVersion} by ${bumpType}`
    );
  }

  console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

  // 3. Write new version to all files
  // package.json
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  console.log("Updated package.json");

  // tauri.conf.json
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
  tauriConf.version = newVersion;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
  console.log("Updated src-tauri/tauri.conf.json");

  // Cargo.toml
  let cargoToml = readFileSync(cargoTomlPath, "utf-8");
  cargoToml = cargoToml.replace(
    /^version = ".*"/m,
    `version = "${newVersion}"`
  );
  writeFileSync(cargoTomlPath, cargoToml);
  console.log("Updated src-tauri/Cargo.toml");

  console.log("Version synchronization complete.");
};

main();