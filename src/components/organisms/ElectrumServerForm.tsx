import { GetStartedMachineContext } from '@/context'
import { Button } from '../ui/button'

export const ElectrumServerForm = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'electrum.done' })
  }

  return (
    <>
      <div>Configure your Electrum Server</div>
      <Button variant={'ghost'} onClick={handleTestMachineClick}>
        Testing
      </Button>
    </>
  )
}
