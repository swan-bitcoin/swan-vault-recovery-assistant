import { sanitize } from '../parsing'
import { Sats } from '../components'
import { ConversationBubbleProps } from './createConversationBubble'

type TransactionCreateBubblesBaseProps = {
  address: string
  hasUserFeeRate: boolean
  feeRate: string | null
}

type TransactionCreateBubblesSentProps = TransactionCreateBubblesBaseProps & {
  outbound?: never
  sent: string
}

type TransactionCreateBubblesOutboundProps = TransactionCreateBubblesBaseProps & {
  outbound: string
  sent?: never
}

type TransactionCreateBubblesProps = TransactionCreateBubblesSentProps | TransactionCreateBubblesOutboundProps

type Messages = Array<ConversationBubbleProps & { type: 'bubble' | 'actions' }>

type TransactionCreateBubblesReturn = {
  messages: Messages
}

export function getTransactionCreatedBubbles({
  address,
  sent,
  outbound,
  hasUserFeeRate,
  feeRate,
}: TransactionCreateBubblesProps): TransactionCreateBubblesReturn {
  if (!hasUserFeeRate) {
    const amount = outbound || sent
    return {
      messages: [
        ...(amount
          ? [
              {
                content: `Created a transaction to send <span class="font-bold">${Sats(amount)}</span> to <br/><span class="break-all font-bold">${sanitize(address)}</span>.`,
                type: 'bubble' as const,
                dangerouslySetInnerHTML: true,
              },
            ]
          : []),
        ...(feeRate
          ? [
              {
                content: `Applied a network fee of <span class="font-bold">${Sats(feeRate)}</span> to get that transaction confirmed swiftly.`,
                type: 'bubble' as const,
                dangerouslySetInnerHTML: true,
              },
            ]
          : []),
        {
          type: 'bubble',
          content: 'Verify the transaction details on the right carefully before proceeding with signing.',
        },
      ] satisfies Messages,
    }
  }

  return {
    messages: [
      {
        content: 'Transaction (PSBT) created!',
        type: 'bubble',
      },
    ],
  }
}
