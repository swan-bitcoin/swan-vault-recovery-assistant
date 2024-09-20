import { useNavigate } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { GetStartedMachineContext } from '@/context'

export const GetStartedSuccess = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const navigate = useNavigate()
  const handleGoToHome = () => {
    navigate({ to: '/' })
  }

  const handleReload = () => {
    getStartedActorRef.send({ type: 'RESET' })
  }

  return (
    <>
      <div>Success! 🎉</div>
      <Button variant={'outline'} onClick={handleGoToHome}>
        Go to Home
      </Button>
      <Button variant={'destructive'} onClick={handleReload}>
        Restart
      </Button>
    </>
  )
}
