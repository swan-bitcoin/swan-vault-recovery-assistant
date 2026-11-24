// The backend rejects with a plain object, not an Error, so this checks the shape.
export function parseDeviceError(e: unknown, errorType: string): { message: string } | null {
  if (typeof e !== 'object' || e === null) return null

  const { error_type: type, message } = e as Record<string, unknown>
  if (type !== errorType || typeof message !== 'string' || message === '') return null

  return { message }
}
