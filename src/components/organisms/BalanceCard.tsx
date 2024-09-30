import { useFetchBalanceQuery } from '@/hooks'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Alert, AlertDescription } from '../ui/alert'

const Header = () => {
  return (
    <CardHeader>
      <CardTitle>Balance</CardTitle>
      <CardDescription>This is your confirmed balance</CardDescription>
    </CardHeader>
  )
}

export const BalanceCard = () => {
  const { data, isLoading, isError } = useFetchBalanceQuery()

  if (isLoading) {
    return (
      <Card>
        <Header />
        <CardFooter className="flex justify-center">
          <Skeleton className="h-4 w-24" />
        </CardFooter>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <Header />
        <CardFooter className="flex justify-center">
          <Alert variant="destructive">
            <AlertDescription>Failed to load your balance</AlertDescription>
          </Alert>
        </CardFooter>
      </Card>
    )
  }

  // @ts-expect-error until we have fixed the BE and thus the types ...
  const balance = data.data as string

  return (
    <Card>
      <Header />
      <CardFooter className="flex justify-center">{balance} sats</CardFooter>
    </Card>
  )
}
