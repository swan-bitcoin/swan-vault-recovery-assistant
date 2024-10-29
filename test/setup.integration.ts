import os from 'os'
import path from 'path'
import { afterAll, beforeAll } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import { Builder, By, Capabilities } from 'selenium-webdriver'

export let driver
let tauriDriver
const application = path.resolve(__dirname, '..', 'src-tauri', 'target', 'release', 'tempura')

beforeAll(async () => {
  // TODO
  // this causes it to rebuild release -every- time, which is super slow.
  // consider checking for binary exist, which could lead to unexpected results locally
  //   await spawnSync('pnpm', ['tauri', 'build'], { stdio: 'inherit' })

  tauriDriver = spawn(path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'), [], {
    // stdio: ['ignore', process.stdout, process.stderr],
    stdio: 'inherit',
  })

  const capabilities = new Capabilities()
  capabilities.set('tauri:options', { application })
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
