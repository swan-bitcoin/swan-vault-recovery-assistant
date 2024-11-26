import { Transaction } from '../bindings'
import { CopyButtonXs, Sats } from '.'
import { receivedIcon, sentIcon, selfTransferIcon } from '../icons'

const TxRow = (transaction: Transaction) => {
  // Determine the type of transaction
  const transactionType =
    transaction.sent === transaction.fee ? 'selfTransfer' : Number(transaction.received) > 0 ? 'received' : 'sent'

  return `
      <tr>
        <td>
          ${transactionType === 'selfTransfer' ? selfTransferIcon : transactionType === 'sent' ? sentIcon : receivedIcon}
        </td>
        <td>${transaction.txid}</td>
        <td>${CopyButtonXs(transaction.txid)}</td>
        <td>
          ${transactionType === 'selfTransfer' ? '' : transactionType === 'sent' ? Sats(transaction.sent) : Sats(transaction.received)}
        </td>
        <td>${Sats(transaction.fee)}</td>
        <td>${transaction.confirmation_height || 'Unconfirmed'}</td>
      </tr>
    `
}

export const Transactions = (transactions: Transaction[]) => {
  // Sort transactions: unconfirmed first, then by descending block height
  const sortedTransactions = transactions.sort((a, b) => {
    const isAUnconfirmed = a.confirmation_height === null
    const isBUnconfirmed = b.confirmation_height === null

    // Unconfirmed transactions come first
    if (isAUnconfirmed && !isBUnconfirmed) return -1
    if (!isAUnconfirmed && isBUnconfirmed) return 1

    // If both are confirmed, sort by descending block height
    const heightA = a.confirmation_height ?? 0
    const heightB = b.confirmation_height ?? 0
    return heightB - heightA
  })

  return sortedTransactions.map(TxRow).join('\n')
}
