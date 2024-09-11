import { GetStartedMachineContext } from '@/context'
import { Button } from '../ui/button'

export const Placeholder = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'something.done' })
  }

  return (
    <>
      <div>Configure something else</div>
      <Button variant={'ghost'} onClick={handleTestMachineClick}>
        Testing
      </Button>
    </>
  )
}
