import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const main = () => {
  const packageJsonPath = join(process.cwd(), "package.json");
  const tauriConfPath = join(process.cwd(), "src-tauri", "tauri.conf.json");
  const cargoTomlPath = join(process.cwd(), "src-tauri", "Cargo.toml");

  // Read the new version from package.json
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  const newVersion = packageJson.version;

  if (!newVersion) {
    throw new Error("Could not find version in package.json");
  }

  console.log(`Synchronizing version to: ${newVersion}`);

  // Update tauri.conf.json
  const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
  tauriConf.version = newVersion;
  writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
  console.log("Updated src-tauri/tauri.conf.json");

  // Update Cargo.toml
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
