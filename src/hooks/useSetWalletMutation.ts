import { commands } from '@/bindings'
import { useMutation } from '@tanstack/react-query'

type MutationFnProps = {
  receiveDescriptor: string
  changeDescriptor: string
}

// TODO: Remove if not longer neeeded for development
// async function simulateSetWallet(ms?: number) {
//   await new Promise((resolve) => setTimeout(resolve, ms || 800))
//   //throw new Error('THE WORLD IS BAD')
//   return { status: 'ok' } // Simulate successful response
// }

export const useSetWalletMutation = () => {
  return useMutation({
    mutationFn: async ({ receiveDescriptor, changeDescriptor }: MutationFnProps) => {
      return await commands.setWallet(receiveDescriptor, changeDescriptor)
      // TODO: Remove if not longer neeeded for development
      //   return await simulateSetWallet()
    },
  })
}
