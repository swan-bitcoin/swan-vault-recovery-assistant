// The backend rejects with a plain object, not an Error, so this checks the shape.
export function parseBitbox02Error(e: unknown): { message: string } | null {
  if (typeof e !== 'object' || e === null) return null

  const { error_type: errorType, message } = e as Record<string, unknown>
  if (errorType !== 'Bitbox02Error' || typeof message !== 'string' || message === '') return null

  return { message }
}
