import type { UseMutationResult } from '@tanstack/react-query'

const DEFAULT_ERROR_MESSAGE = 'Oops, something went wrong.'

export const useMutationErrorMessage = (mutation: UseMutationResult) => {
  const { error, isError } = mutation

  if (!isError) {
    return null
  }

  if (!error) {
    return DEFAULT_ERROR_MESSAGE
  }

  const { message } = error
  return message
}
