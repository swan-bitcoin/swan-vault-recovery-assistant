import { getStartedMachine } from '@/machines'
import { createActorContext } from '@xstate/react'

export const GetStartedMachineContext = createActorContext(getStartedMachine)
