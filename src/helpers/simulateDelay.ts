export const simulateDelay = async (ms?: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms || 800))
}
