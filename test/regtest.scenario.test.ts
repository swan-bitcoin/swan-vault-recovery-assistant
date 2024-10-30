import os from 'os'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { Builder, By, Capabilities } from 'selenium-webdriver'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { driver } from './setup.scenario'

describe('e2e', function () {
  it('should open the window', async function () {
    const test = await driver.findElement(By.id('temporary-message')).getText()
    expect(test).toMatch(/^Hi there!/)
  })
})
