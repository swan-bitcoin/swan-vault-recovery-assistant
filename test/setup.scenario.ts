import os from 'os'
import fs from 'fs'
import path from 'path'
import * as crypto from 'crypto'
import { afterAll, beforeAll, should } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import { Builder, By, Capabilities } from 'selenium-webdriver'
// import { webkit } from 'playwright'

function log(message: string, ...args: any): void {
  console.log('[TEST][SETUP]', message, ...args)
}

export let driver
let tauriDriver

const application = path.resolve(__dirname, '..', 'src-tauri', 'target', 'release', 'tempura')
const hashFile = path.resolve(__dirname, '..', 'src-tauri', 'target', 'tempura-hashfile')

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

beforeAll(async () => {
  //perform a build if the hash file doesn't exist (first run) or if the source files have changed
  let currentHash
  let shouldBuild = !fs.existsSync(hashFile)
  if (!shouldBuild) {
    const previousHash = fs.readFileSync(hashFile, 'utf8')

    // gen the the frontend 'dist' contents and hash the source directories
    await spawnSync('pnpm', ['build'], { stdio: 'inherit' })
    currentHash = hashFiles(sourcePaths)
    shouldBuild = currentHash !== previousHash
  }

  if (shouldBuild) {
    log('build files have changed, building...')
    await spawnSync('pnpm', ['tauri', 'build', '--no-bundle'], { stdio: 'inherit' })
    fs.writeFileSync(hashFile, currentHash ?? hashFiles(sourcePaths))
  } else {
    log('build will be skipped because source files have not changed')
  }

  log('display variable:', process.env.DISPLAY)

  tauriDriver = spawn(path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'), [], {
    // stdio: ['ignore', process.stdout, process.stderr],
    stdio: 'inherit',
  })

  // const browser = await webkit.launch({ headless: true })
  // const context = await browser.newContext()
  // const page = await context.newPage()

  const capabilities = new Capabilities()
  capabilities.set('tauri:options', { application })
  capabilities.setLoggingPrefs({ browser: 'ALL', driver: 'ALL', server: 'ALL' })
  // capabilities.setBrowserName('playwright-webkit')
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
