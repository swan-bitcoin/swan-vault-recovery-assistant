import { readdirSync, renameSync, statSync, lstatSync } from 'fs'
import { join, dirname, extname } from 'path'

/**
 * Renames Tauri bundled build artifacts from Title Case to kebab-case.
 *
 * Tauri uses `productName` for both the display name and installer filenames,
 * with no native way to configure them separately (see tauri-apps/tauri#13999).
 * This script runs after `tauri build` to rename installer artifacts while
 * preserving the user-friendly display name for the installed application.
 *
 * Binary names are produced from the 'mainBinaryName' field in tauri.conf.json, and
 * these are configured with platform-specific config files to follow expected conventions.
 */

const BUNDLE_DIR = join(process.cwd(), 'src-tauri', 'target', 'release', 'bundle')
const PRODUCT_NAME = 'Swan Vault Recovery Assistant'
const KEBAB_NAME = 'swan-vault-recovery-assistant'

// Only rename these final artifact types
const ARTIFACT_EXTENSIONS = new Set(['.deb', '.rpm', '.AppImage', '.dmg', '.msi', '.exe', '.app'])

const renameArtifactsInDir = (dir: string, depth: number = 0): void => {
  // Only go 2 levels deep: bundle/<type>/<artifact>
  if (depth > 2) return

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)

    // Use lstatSync to avoid following symlinks
    let stat
    try {
      stat = lstatSync(fullPath)
    } catch {
      continue
    }

    // Skip symlinks entirely
    if (stat.isSymbolicLink()) continue

    const ext = extname(entry)

    if (stat.isDirectory()) {
      if (ARTIFACT_EXTENSIONS.has(ext) && entry.includes(PRODUCT_NAME)) {
        // Rename .app bundles (macOS) - don't recurse into them
        const newName = entry.replace(PRODUCT_NAME, KEBAB_NAME)
        const newPath = join(dir, newName)
        console.log(`Renaming directory: ${entry} -> ${newName}`)
        renameSync(fullPath, newPath)
      } else if (!entry.endsWith('.AppDir')) {
        // Recurse into subdirectories, but skip .AppDir intermediate dirs
        renameArtifactsInDir(fullPath, depth + 1)
      }
    } else if (stat.isFile() && ARTIFACT_EXTENSIONS.has(ext) && entry.includes(PRODUCT_NAME)) {
      const newName = entry.replace(PRODUCT_NAME, KEBAB_NAME)
      const newPath = join(dirname(fullPath), newName)
      console.log(`Renaming file: ${entry} -> ${newName}`)
      renameSync(fullPath, newPath)
    }
  }
}

const main = () => {
  console.log(`Renaming build artifacts in ${BUNDLE_DIR}`)
  console.log(`Replacing "${PRODUCT_NAME}" with "${KEBAB_NAME}"`)
  console.log()

  try {
    statSync(BUNDLE_DIR)
  } catch {
    console.log('Bundle directory does not exist. Skipping rename.')
    return
  }

  renameArtifactsInDir(BUNDLE_DIR)
  console.log()
  console.log('Artifact renaming complete.')
}

main()
