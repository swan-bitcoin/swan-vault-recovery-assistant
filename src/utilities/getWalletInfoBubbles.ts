import type { AddressInfo, Balance as BalanceType, Transaction } from '@/bindings'
import { Address } from '../components/Address'
import type { ConversationBubbleProps } from './createConversationBubble'
import { Sats } from '../components'

type GetWalletInfoBubblesProps = {
  balance: BalanceType
  transactions: Transaction[]
  addressInfo: AddressInfo
}

type GetWalletInfoBubblesReturn = {
  messages: Array<ConversationBubbleProps & { type: 'bubble' | 'actions' }>
  isRecoverable: boolean
}

const getTransactionsButtonBubble = (): GetWalletInfoBubblesReturn['messages'][number] => ({
  content: `<button id="show-transactions-btn" class="btn btn-outline btn-sm">View Transactions</button>`,
  dangerouslySetInnerHTML: true,
  footer: new Date().toLocaleString(),
  type: 'actions',
})

function getUnfundedWalletMessages({ receiveAddress }: { receiveAddress: string }): GetWalletInfoBubblesReturn['messages'] {
  return [
    {
      content: 'The wallet seems to be unused. Are you sure you have the right wallet configuration?',
      type: 'bubble',
    },
    {
      content: 'If you want to deposit funds, you can do so by sending Bitcoin to the following wallet address.',
      type: 'bubble',
    },
    {
      dangerouslySetInnerHTML: true,
      content: Address({ address: receiveAddress }),
      type: 'bubble',
    },
  ]
}

function getUsedButEmptyWalletMessages({
  transactions,
}: {
  transactions: Transaction[]
}): GetWalletInfoBubblesReturn['messages'] {
  return [
    {
      content: `The wallet is currently empty but has ${transactions.length} transactions.`,
      type: 'bubble',
    },
    getTransactionsButtonBubble(),
  ]
}

export function getWalletInfoBubbles({
  balance,
  transactions,
  addressInfo,
}: GetWalletInfoBubblesProps): GetWalletInfoBubblesReturn {
  const confirmed = Number(balance.confirmed)
  const unconfirmed = Number(balance.untrusted_pending) + Number(balance.trusted_pending)

  const hasBalance = confirmed > 0 || unconfirmed > 0
  const hasUnconfirmedBalance = unconfirmed > 0

  const hasTransactions = transactions.length > 0

  // unused wallet
  if (!hasBalance && !hasTransactions) {
    return {
      messages: getUnfundedWalletMessages({ receiveAddress: addressInfo.address }),
      isRecoverable: false,
    }
  }

  // used, but empty wallet
  if (!hasBalance && hasTransactions) {
    return {
      messages: getUsedButEmptyWalletMessages({ transactions }),
      isRecoverable: false,
    }
  }

  const balanceMessage = hasUnconfirmedBalance
    ? `Your wallet has a balance of ${Sats(confirmed)}. <br/>${Sats(unconfirmed)} is still unconfirmed.`
    : `Your wallet has a confirmed balance of <br/>${Sats(confirmed)}.`

  return {
    messages: [
      {
        content: 'I was able to find the following information about your wallet.',
        type: 'bubble',
      },
      {
        content: balanceMessage,
        dangerouslySetInnerHTML: true,
        type: 'bubble',
      },
      {
        content: `Your wallet was involved in ${transactions.length} transactions.`,
        type: 'bubble',
      },
      {
        content: 'You can start recovering your wallet now, or view the transactions the wallet was involved in.',
        type: 'bubble',
      },
      {
        content: [
          `<button id="begin-recovery-btn" class="btn btn-primary btn-sm">Start Recovery</button>`,
          getTransactionsButtonBubble().content,
        ].join(''),
        dangerouslySetInnerHTML: true,
        footer: new Date().toLocaleString(),
        type: 'actions',
      },
    ],
    isRecoverable: true,
  }
}
