import { Transaction } from '@/bindings'

export const countTransactions = (transactions: Transaction[]) => {
  let unconfirmedCount = 0
  let confirmedCount = 0

  for (const transaction of transactions) {
    if (transaction.confirmation_height === null) {
      unconfirmedCount++
    } else {
      confirmedCount++
    }
  }

  return {
    unconfirmedCount,
    confirmedCount,
  }
}
