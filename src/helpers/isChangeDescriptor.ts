/**
 * Checks if the provided descriptor is a change descriptor based on the presence of the pattern /1/*
 */
export const isChangeDescriptor = (descriptor: string) => {
  const changePattern = /\/1\/\*\)+(?:#\w+)?$/
  return changePattern.test(descriptor)
}
