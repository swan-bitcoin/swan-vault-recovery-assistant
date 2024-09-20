import { setup, assign } from 'xstate'

const initialContext = {
  someValue: 21, // TODO: for developing
}

export const getStartedMachine = setup({
  types: {
    context: {} as { someValue: number },
    events: {} as
      | {
          type: 'NEXT'
        }
      | {
          type: 'RESET'
        },
  },
  actions: {
    resetContext: assign(() => {
      return { ...initialContext }
    }),
  },
}).createMachine({
  id: 'getStarted',
  context: initialContext,
  initial: 'descriptorInput',
  // TODO: Remove, just for developing
  entry: () => {
    const randomNumber = Math.floor(Math.random() * 1000)
    console.log(`Machine instantiated with random Number: ${randomNumber}`)
  },
  on: {
    RESET: {
      target: '.descriptorInput',
      actions: 'resetContext',
    },
  },
  states: {
    descriptorInput: {
      on: {
        NEXT: 'electrumServerConfig',
      },
    },
    electrumServerConfig: {
      on: {
        NEXT: 'somethingElse',
      },
    },
    somethingElse: {
      on: {
        NEXT: 'success',
      },
    },
    success: {},
  },
})
