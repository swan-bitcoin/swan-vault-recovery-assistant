import os from 'os'
import fs from 'fs'
import path from 'path'
import * as crypto from 'crypto'
import { afterAll, beforeAll, should } from 'vitest'
import { ChildProcess, spawn, spawnSync } from 'child_process'
import { Builder, Capabilities, WebDriver } from 'selenium-webdriver'

function log(message: string, ...args: any): void {
  console.log('[TEST][SETUP]', message, ...args)
}

export let driver: WebDriver
let tauriDriver: ChildProcess

function getApplicationPath(): string {
  const targetDir = path.resolve(__dirname, '..', 'src-tauri', 'target', 'release')

  switch (os.platform()) {
    case 'win32':
      return path.join(targetDir, 'Swan Vault Recovery Assistant.exe')
    case 'darwin':
      return path.join(targetDir, 'Swan Vault Recovery Assistant')
    default: // linux and others
      return path.join(targetDir, 'swan-vault-recovery-assistant')
  }
}

const application = getApplicationPath()
const hashFile = path.resolve(__dirname, '..', 'src-tauri', 'target', 'swan-vault-recovery-assistant-hashfile')

// a list of files and directories to hash to determine when we should build
const tauriDir = path.resolve(__dirname, '..', 'src-tauri')
const sourcePaths = [
  path.resolve(__dirname, '..', 'dist'),
  path.resolve(__dirname, '..', 'src'),
  path.resolve(__dirname, '..', 'index.html'),
  path.join(tauriDir, 'Cargo.lock'),
  path.join(tauriDir, 'Cargo.toml'),
  path.join(tauriDir, 'capabilities'),
  path.join(tauriDir, 'gen'),
  path.join(tauriDir, 'icons'),
  path.join(tauriDir, 'src'),
  path.join(tauriDir, 'tauri.conf.json'),
]

/**
 * recursively hashes all files in the given paths
 */
function hashFiles(paths: string[]): string {
  const hash = crypto.createHash('sha256')

  function hashPath(p: string) {
    if (!fs.existsSync(p)) return

    const stat = fs.statSync(p)
    if (stat.isFile()) {
      const content = fs.readFileSync(p)
      hash.update(content)
      return
    }

    if (stat.isDirectory()) {
      const files = fs.readdirSync(p)
      files.forEach((file) => {
        const fullPath = path.join(p, file)
        hashPath(fullPath)
      })
    }
  }

  paths.forEach((p) => {
    hashPath(p)
  })

  return hash.digest('hex')
}

async function build() {
  if (process.env.SVRA_SCENARIO_SKIP_BUILD) {
    log('build will be skipped because SVRA_SCENARIO_SKIP_BUILD is set.')
    return
  }

  // perform a build if the hash file doesn't exist (first run) or if the source files have changed
  let currentHash
  const hashFileExists = fs.existsSync(hashFile)
  if (hashFileExists) {
    const previousHash = fs.readFileSync(hashFile, 'utf8')

    // gen the the frontend 'dist' contents and hash the source directories
    await spawnSync('pnpm', ['build'], { stdio: 'inherit' })
    currentHash = hashFiles(sourcePaths)

    if (currentHash === previousHash) {
      log('build will be skipped because source files have not changed.')
      return
    }
  }

  // either no hash file exists or source files changed, run a build and generate the hashfile
  await spawnSync('pnpm', ['tauri', 'build', '--no-bundle'], { stdio: 'inherit' })
  fs.writeFileSync(hashFile, currentHash ?? hashFiles(sourcePaths))
}

beforeAll(async () => {
  if (os.platform() === 'darwin') {
    throw new Error('Platform tests are not supported on MacOS. Refer to the README for instructions.')
  }

  await build()

  tauriDriver = spawn(path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'), [], {
    // stdio: ['ignore', process.stdout, process.stderr],
    stdio: 'inherit',
  })

  const capabilities = new Capabilities()
  capabilities.set('tauri:options', { application })
  capabilities.setLoggingPrefs({ browser: 'ALL', driver: 'ALL', server: 'ALL' })
  capabilities.setBrowserName('wry')

  // start the webdriver client
  driver = await new Builder().withCapabilities(capabilities).usingServer('http://localhost:4444/').build()
}, 300_000 /* 5 minute timeout */)

afterAll(async function () {
  if (driver) {
    await driver.quit()
  }

  if (tauriDriver) {
    tauriDriver.kill()
  }
})
