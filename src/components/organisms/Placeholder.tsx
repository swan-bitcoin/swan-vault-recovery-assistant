import { GetStartedMachineContext } from '@/context'
import { Button } from '../ui/button'

export const Placeholder = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'NEXT' })
  }

  return (
    <>
      <div>Configure something else</div>
      <Button variant="secondary" onClick={handleTestMachineClick}>
        Testing
      </Button>
    </>
  )
}
