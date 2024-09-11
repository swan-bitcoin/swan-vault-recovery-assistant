import { setup } from 'xstate'

export const getStartedMachine = setup({
  types: {
    events: {} as
      | {
          type: 'descriptor.done'
        }
      | {
          type: 'electrum.done'
        }
      | {
          type: 'something.done'
        },
  },
  actions: {
    log: () => {
      console.log('hi from the log action in state electrumServerConfig!')
    },
  },
}).createMachine({
  id: 'getStarted',
  initial: 'descriptorInput',
  entry: () => {
    const randomNumber = Math.floor(Math.random() * 1000)
    console.log(`Machine instantiated with random Number: ${randomNumber}`)
  },
  states: {
    descriptorInput: {
      on: {
        'descriptor.done': 'electrumServerConfig',
      },
    },
    electrumServerConfig: {
      on: {
        'electrum.done': 'somethingElse',
      },
    },
    somethingElse: {
      on: {
        'something.done': 'success',
      },
    },
    success: {},
  },
})
