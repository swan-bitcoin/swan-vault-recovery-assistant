import { afterEach, describe, it, expect, vi } from 'vitest'
import type { Bitbox02Progress } from '../../bindings'
import { isBitbox02SessionPending, runBitbox02Session, startSignRun, type SignRun } from './bitbox02Session'

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage: (update: Bitbox02Progress) => void = () => {}
  },
}))

type Channel = Parameters<Parameters<typeof runBitbox02Session>[1]>[0]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const runs: SignRun[] = []

// every test gives its runs back, so that the guard does not leak into the next test
function tryStart() {
  const run = startSignRun()
  if (run) runs.push(run)
  return run
}

function start() {
  const run = tryStart()
  if (!run) throw new Error('a run is already in flight')
  return run
}

afterEach(() => {
  runs.splice(0).forEach((run) => run.release())
})

describe('startSignRun()', () => {
  it('should not start a second run while one is in flight', () => {
    start()
    expect(tryStart()).toBeNull()
  })

  it('should start a new run after the first one is released', () => {
    start().release()
    expect(tryStart()).not.toBeNull()
  })

  it('should keep the guard for a run whose device is not known yet', () => {
    start()
    expect(tryStart()).toBeNull()
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should release the guard at once when the device is not a BitBox02', () => {
    start().deviceFound('jade')
    expect(isBitbox02SessionPending()).toBe(false)
    expect(tryStart()).not.toBeNull()
  })

  it('should release the guard for a device type that HWI reports and SVRA does not know', () => {
    start().deviceFound('trezor')
    expect(tryStart()).not.toBeNull()
  })

  it('should hold the guard for a BitBox02 until the run ends', () => {
    const run = start()
    run.deviceFound('bitbox02')

    expect(isBitbox02SessionPending()).toBe(true)
    expect(tryStart()).toBeNull()

    run.release()
    expect(isBitbox02SessionPending()).toBe(false)
    expect(tryStart()).not.toBeNull()
  })

  it('should keep the guard after the session ended, so the run can show its result alone', () => {
    const run = start()
    run.deviceFound('bitbox02')
    run.sessionEnded()

    expect(isBitbox02SessionPending()).toBe(false)
    expect(tryStart()).toBeNull()
  })

  it('should not let a run that released early release the guard of the next run', () => {
    const first = start()
    first.deviceFound('jade')
    const second = start()
    second.deviceFound('bitbox02')

    first.release()

    expect(isBitbox02SessionPending()).toBe(true)
    expect(tryStart()).toBeNull()
  })

  it('should allow release to be called twice', () => {
    const run = start()
    run.release()
    run.release()
    expect(tryStart()).not.toBeNull()
  })
})

describe('runBitbox02Session()', () => {
  it('should return the result of the command and end the session', async () => {
    const run = start()
    run.deviceFound('bitbox02')
    const command = deferred<string>()
    const session = runBitbox02Session(run, () => command.promise, vi.fn())

    expect(isBitbox02SessionPending()).toBe(true)
    command.resolve('done')

    await expect(session).resolves.toBe('done')
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should end the session when the command rejects, and pass the rejection on', async () => {
    const run = start()
    run.deviceFound('bitbox02')
    const command = deferred<string>()
    const session = runBitbox02Session(run, () => command.promise, vi.fn())
    command.reject({ error_type: 'Bitbox02Error', message: 'x' })

    await expect(session).rejects.toStrictEqual({ error_type: 'Bitbox02Error', message: 'x' })
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should end the session when the command throws at once', async () => {
    const run = start()
    run.deviceFound('bitbox02')
    await expect(
      runBitbox02Session(
        run,
        () => {
          throw new Error('boom')
        },
        vi.fn()
      )
    ).rejects.toThrow('boom')
    expect(isBitbox02SessionPending()).toBe(false)
  })

  it('should show each update once, and the register update once per name', async () => {
    const command = deferred<string>()
    const show = vi.fn()
    let channel!: Channel
    const session = runBitbox02Session(
      start(),
      (onProgress) => {
        channel = onProgress
        return command.promise
      },
      show
    )

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
    await runBitbox02Session(
      start(),
      (onProgress) => {
        channel = onProgress
        return Promise.resolve('done')
      },
      show
    )

    channel.onmessage({ step: 'sign' })
    expect(show).not.toHaveBeenCalled()
  })

  it('should ignore an update that arrives after the command rejected', async () => {
    const show = vi.fn()
    let channel!: Channel
    await expect(
      runBitbox02Session(
        start(),
        (onProgress) => {
          channel = onProgress
          return Promise.reject(new Error('x'))
        },
        show
      )
    ).rejects.toThrow('x')

    channel.onmessage({ step: 'unlock' })
    expect(show).not.toHaveBeenCalled()
  })
})
