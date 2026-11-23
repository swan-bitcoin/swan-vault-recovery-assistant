export type Bitbox02ErrorInfo = {
  code: string
  message: string
}

const ERROR_TYPE = /^Bitbox02Error\((.+)\)$/

// The backend rejects with a plain object, not an Error, so this checks the shape.
export function parseBitbox02Error(e: unknown): Bitbox02ErrorInfo | null {
  if (typeof e !== 'object' || e === null) return null

  const { error_type: errorType, message } = e as Record<string, unknown>
  if (typeof errorType !== 'string' || typeof message !== 'string' || message === '') return null

  const match = ERROR_TYPE.exec(errorType)
  return match ? { code: match[1], message } : null
}

export function getBitbox02ErrorText({ code, message }: Bitbox02ErrorInfo): string {
  switch (code) {
    case 'user-abort':
      return 'Looks like you refused to sign this transaction on your BitBox02. If this was a mistake, you can try again.'
    case 'pairing-rejected':
      return 'Looks like you rejected the pairing code on your BitBox02. If this was a mistake, you can try again.'
    default:
      return message
  }
}
