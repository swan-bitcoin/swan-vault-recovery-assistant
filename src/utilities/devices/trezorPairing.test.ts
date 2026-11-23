import { describe, it, expect, vi } from 'vitest'
import {
  cancelOpenPairingEntry,
  cancelOrphanedPairing,
  createPairingCodeEntry,
  isPairingCodeComplete,
  normalizePairingCode,
} from './trezorPairing'

describe('normalizePairingCode()', () => {
  it.each([
    ['123456', '123456'],
    ['12', '12'],
    ['', ''],
    ['123 456', '123456'],
    ['123-456', '123456'],
    ['  123456\n', '123456'],
    ['12a3b4', '1234'],
    ['abc', ''],
    ['1234567890', '123456'],
    // other digits around the code are not told apart from the code: the first six digits stay
    ['1. 088 626', '108862'],
    // the Arabic-Indic digits are not digits for the device
    ['١٢٣٤٥٦', ''],
  ])('should turn %j into %j', (raw, code) => {
    expect(normalizePairingCode(raw)).toBe(code)
  })
})

describe('isPairingCodeComplete()', () => {
  it.each(['123456', '000000'])('should accept %j', (code) => {
    expect(isPairingCodeComplete(code)).toBe(true)
  })

  it.each(['', '12345', '1234567', '12345a', '123 56', '12345\n'])('should refuse %j', (code) => {
    expect(isPairingCodeComplete(code)).toBe(false)
  })
})

function setup({ submit = vi.fn().mockResolvedValue(null), cancel = vi.fn().mockResolvedValue(null) } = {}) {
  const onClosed = vi.fn()
  const onRefused = vi.fn()
  const entry = createPairingCodeEntry({ submit, cancel }, { onClosed, onRefused })
  return { entry, submit, cancel, onClosed, onRefused }
}

describe('createPairingCodeEntry()', () => {
  it('should send a complete code once and close the controls', async () => {
    const { entry, submit, cancel, onClosed } = setup()

    await entry.submit('123456')

    expect(submit.mock.calls).toStrictEqual([['123456']])
    expect(cancel).not.toHaveBeenCalled()
    expect(onClosed.mock.calls).toStrictEqual([['submitted']])
    expect(entry.isOpen()).toBe(false)
  })

  it('should send the digits of a pasted code', async () => {
    const { entry, submit } = setup()

    await entry.submit('123 456\n')

    expect(submit.mock.calls).toStrictEqual([['123456']])
  })

  it.each(['', '12345', 'abcdef'])('should not send %j and should stay open', async (raw) => {
    const { entry, submit, onClosed } = setup()

    await entry.submit(raw)

    expect(submit).not.toHaveBeenCalled()
    expect(onClosed).not.toHaveBeenCalled()
    expect(entry.isOpen()).toBe(true)
  })

  it('should stay open after an incomplete code, so that the user can finish it', async () => {
    const { entry, submit } = setup()

    await entry.submit('123')
    await entry.submit('123456')

    expect(submit.mock.calls).toStrictEqual([['123456']])
  })

  it('should send only once when the user presses Continue twice at once', async () => {
    const { entry, submit } = setup()

    await Promise.all([entry.submit('123456'), entry.submit('123456')])

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('should send only once when the user presses Enter and then Continue', async () => {
    const { entry, submit, onClosed } = setup()

    await entry.submit('123456')
    await entry.submit('123456')

    expect(submit).toHaveBeenCalledTimes(1)
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('should close the controls before the backend answers', () => {
    const { entry, onClosed } = setup({ submit: vi.fn(() => new Promise<null>(() => {})) })

    void entry.submit('123456')

    expect(onClosed.mock.calls).toStrictEqual([['submitted']])
  })

  it('should cancel once and close the controls', async () => {
    const { entry, submit, cancel, onClosed } = setup()

    await entry.cancel()
    await entry.cancel()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
    expect(onClosed.mock.calls).toStrictEqual([['cancelled']])
  })

  it('should allow no submit after a cancel, and no cancel after a submit', async () => {
    const first = setup()
    await first.entry.cancel()
    await first.entry.submit('123456')
    expect(first.submit).not.toHaveBeenCalled()

    const second = setup()
    await second.entry.submit('123456')
    await second.entry.cancel()
    expect(second.cancel).not.toHaveBeenCalled()
  })

  it('should close the controls when the session ends, and then send nothing', async () => {
    const { entry, submit, cancel, onClosed } = setup()

    entry.end()
    await entry.submit('123456')
    await entry.cancel()

    expect(onClosed.mock.calls).toStrictEqual([['ended']])
    expect(submit).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    expect(entry.isOpen()).toBe(false)
  })

  it('should not close the controls twice when the session ends after a submit', async () => {
    const { entry, onClosed } = setup()

    await entry.submit('123456')
    entry.end()

    expect(onClosed.mock.calls).toStrictEqual([['submitted']])
  })

  it('should tell the user when the backend refuses the code, and leave the controls closed', async () => {
    const refusal = { error_type: 'TrezorError', message: 'SVRA is not waiting for a code.' }
    const { entry, onClosed, onRefused } = setup({ submit: vi.fn().mockRejectedValue(refusal) })

    await entry.submit('123456')

    expect(onRefused.mock.calls).toStrictEqual([['SVRA is not waiting for a code.']])
    expect(onClosed.mock.calls).toStrictEqual([['submitted']])
    expect(entry.isOpen()).toBe(false)
  })

  it('should tell the user when the backend refuses the cancel', async () => {
    const refusal = { error_type: 'TrezorError', message: 'SVRA is not waiting for a code.' }
    const { entry, onRefused } = setup({ cancel: vi.fn().mockRejectedValue(refusal) })

    await entry.cancel()

    expect(onRefused.mock.calls).toStrictEqual([['SVRA is not waiting for a code.']])
  })

  it('should use its own words when the refusal is not a TrezorError, and never repeat the code', async () => {
    const { entry, onRefused } = setup({ submit: vi.fn().mockRejectedValue(new Error('boom 123456')) })

    await entry.submit('123456')

    expect(onRefused).toHaveBeenCalledTimes(1)
    const [message] = onRefused.mock.calls[0]
    expect(message).toContain('Unplug the Trezor')
    expect(message).not.toContain('123456')
  })

  it('should stay silent about a refusal when the session has ended, because its own error is on screen', async () => {
    let refuse!: (reason: unknown) => void
    const submit = vi.fn(() => new Promise<null>((_resolve, reject) => (refuse = reject)))
    const { entry, onRefused } = setup({ submit })

    const sending = entry.submit('123456')
    entry.end()
    refuse({ error_type: 'TrezorError', message: 'SVRA is not waiting for a code.' })
    await sending

    expect(onRefused).not.toHaveBeenCalled()
  })
})

describe('cancelOpenPairingEntry()', () => {
  it('should cancel the entry that is open', async () => {
    const { cancel, onClosed } = setup()

    await cancelOpenPairingEntry()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onClosed.mock.calls).toStrictEqual([['cancelled']])
  })

  it('should do nothing when the entry already sent its code', async () => {
    const { entry, cancel } = setup()
    await entry.submit('123456')

    await cancelOpenPairingEntry()

    expect(cancel).not.toHaveBeenCalled()
  })

  it('should do nothing when the entry was cancelled before', async () => {
    const { entry, cancel } = setup()
    await entry.cancel()

    await cancelOpenPairingEntry()

    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('should do nothing when the session ended', async () => {
    const { entry, cancel } = setup()
    entry.end()

    await cancelOpenPairingEntry()

    expect(cancel).not.toHaveBeenCalled()
  })

  it('should cancel only the newest entry', async () => {
    const first = setup()
    const second = setup()

    await cancelOpenPairingEntry()

    expect(first.cancel).not.toHaveBeenCalled()
    expect(second.cancel).toHaveBeenCalledTimes(1)
  })
})

describe('cancelOrphanedPairing()', () => {
  it('should ask the backend to cancel', async () => {
    const cancel = vi.fn().mockResolvedValue(null)

    await cancelOrphanedPairing(cancel)

    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('should ignore the refusal of a backend that has no session waiting for a code', async () => {
    const cancel = vi.fn().mockRejectedValue({ error_type: 'TrezorError', message: 'No Trezor waits for a code.' })

    await expect(cancelOrphanedPairing(cancel)).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
