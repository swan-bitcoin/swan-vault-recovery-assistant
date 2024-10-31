import RegtestClient from './util/regtest.client'
import { By } from 'selenium-webdriver'
import { beforeAll, describe, expect, it } from 'vitest'
import { driver } from './setup.scenario'
import prand from 'pure-rand'
import { ensureDockerStack } from './util/container'

const log = (message: string, ...args: any[]): void => {
  console.log('[TEST]', message, ...args)
}

const client = new RegtestClient()
const seed = Date.now() ^ (Math.random() * 0x100000000)
const prng = prand.xoroshiro128plus(seed)
beforeAll(
  async () => {
    log('-----------------------------------------')
    log('initiating regtest scenario test')
    log('using prng seed:', seed)
    log('-----------------------------------------')

    try {
      await ensureDockerStack()
      await client.initialize()
    } catch (e) {
      log('WARNING: could not initialize regtest client', { error: e })
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  },
  60 * 1000 // 60 seconds
)

describe('sanity checks. scenario test setup', function () {
  it('initialized the regtest client', async () => {
    const info = await client.getBlockchainInfo()
    expect(info).toBeTruthy()
    expect(info.chain).toBe('regtest')
  })

  it('opened the window', async function () {
    const test = await driver.findElement(By.id('temporary-message')).getText()
    expect(test).toMatch(/^Hi there!/)
  })
})
