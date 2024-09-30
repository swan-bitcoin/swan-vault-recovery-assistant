import { commands } from '@/bindings'
import { useQuery } from '@tanstack/react-query'

export const useFetchBalanceQuery = () => {
  return useQuery({
    queryKey: ['fetchBalance'], // TODO: Better query key logic?
    queryFn: () => commands.fetchBalance(),
    // TODO: Select the balance from the result (handling of `Result` type)
    // select: (result) => result.data,
    // TOOD: always enable?
    // enabled: ...
  })
}
