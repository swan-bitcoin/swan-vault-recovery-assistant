import { Transaction } from '@/bindings'

/**
 * Finds the first confirmed transaction.
 */
export const getFirstTransaction = (transactions: Transaction[]): Transaction | null => {
  const confirmedTransactions = transactions.filter((tx) => tx.confirmation_height !== null)

  if (confirmedTransactions.length === 0) {
    return null
  }

  return confirmedTransactions.reduce((firstTx, currentTx) => {
    return currentTx.confirmation_height! < firstTx.confirmation_height! ? currentTx : firstTx
  })
}
