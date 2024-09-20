import { GetStartedMachineContext } from '@/context'
import { Button } from '../ui/button'

export const ElectrumServerForm = () => {
  const getStartedActorRef = GetStartedMachineContext.useActorRef()

  const handleTestMachineClick = () => {
    getStartedActorRef.send({ type: 'NEXT' })
  }

  return (
    <>
      <div>Configure your Electrum Server</div>
      <Button variant="secondary" onClick={handleTestMachineClick}>
        Testing
      </Button>
    </>
  )
}
