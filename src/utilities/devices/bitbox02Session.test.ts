import { describe, it, expect, vi } from 'vitest'
import type { Bitbox02Progress } from '../../bindings'
import { isBitbox02SessionPending, runBitbox02Session } from './bitbox02Session'

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage: (update: Bitbox02Progress) => void = () => {}
  },
}))

type Channel = Parameters<Parameters<typeof runBitbox02Session>[0]>[0]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('runBitbox02Session()', () => {
  it('should be pending while the command runs and not pending after it resolves', async () => {
    const command = deferred<string>()
    const session = runBitbox02Session(() => command.promise, vi.fn())

    expect(isBitbox02SessionPending()).toBe(true)
    command.resolve('done')

    await expect(session).resolves.toBe('done')
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should not be pending after the command rejects', async () => {
    const command = deferred<string>()
    const session = runBitbox02Session(() => command.promise, vi.fn())
    command.reject({ error_type: 'Bitbox02Error(busy)', message: 'x' })

    await expect(session).rejects.toStrictEqual({ error_type: 'Bitbox02Error(busy)', message: 'x' })
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should not be pending when the command throws at once', async () => {
    await expect(
      runBitbox02Session(() => {
        throw new Error('boom')
      }, vi.fn())
    ).rejects.toThrow('boom')
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should keep the first session pending when a second run ends first', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const firstSession = runBitbox02Session(() => first.promise, vi.fn())
    const secondSession = runBitbox02Session(() => second.promise, vi.fn())

    second.reject({ error_type: 'Bitbox02Error(busy)', message: 'x' })
    await expect(secondSession).rejects.toBeDefined()
    expect(isBitbox02SessionPending()).toBe(true)

    first.resolve('done')
    await firstSession
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should show each update once, and the register update once per name', async () => {
    const command = deferred<string>()
    const show = vi.fn()
    let channel!: Channel
    const session = runBitbox02Session((onProgress) => {
      channel = onProgress
      return command.promise
    }, show)

    channel.onmessage({ step: 'connecting' })
    channel.onmessage({ step: 'connecting' })
    channel.onmessage({ step: 'register', name: 'swan_vault' })
    channel.onmessage({ step: 'register', name: 'swan_vault' })
    channel.onmessage({ step: 'register', name: 'swan_vault_1a2b3c4d' })
    channel.onmessage({ step: 'sign' })

    expect(show.mock.calls.map(([update]) => update)).toStrictEqual([
      { step: 'connecting' },
      { step: 'register', name: 'swan_vault' },
      { step: 'register', name: 'swan_vault_1a2b3c4d' },
      { step: 'sign' },
    ])

    command.resolve('done')
    await session
  })

  it('should ignore an update that arrives after the command resolved', async () => {
    const show = vi.fn()
    let channel!: Channel
    await runBitbox02Session((onProgress) => {
      channel = onProgress
      return Promise.resolve('done')
    }, show)

    channel.onmessage({ step: 'sign' })
    expect(show).not.toHaveBeenCalled()
  })

  it('should ignore an update that arrives after the command rejected', async () => {
    const show = vi.fn()
    let channel!: Channel
    await expect(
      runBitbox02Session((onProgress) => {
        channel = onProgress
        return Promise.reject(new Error('x'))
      }, show)
    ).rejects.toThrow('x')

    channel.onmessage({ step: 'unlock' })
    expect(show).not.toHaveBeenCalled()
  })
})
