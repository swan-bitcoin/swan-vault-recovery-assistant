import { Transaction } from '../bindings'
import { CopyButtonXs, Sats } from '.'
import { receivedIcon, sentIcon, selfTransferIcon } from '../icons'

const TxRow = (transaction: Transaction) => {
  // Determine the type of transaction
  let transactionType: 'selfTransfer' | 'sent' | 'received'
  if (Number(transaction.sent) === Number(transaction.received) + Number(transaction.fee)) {
    // Self-transfer: Everything that's being sent goes to fees and change
    transactionType = 'selfTransfer'
  } else if (Number(transaction.sent) > 0 && Number(transaction.received) > 0) {
    // Sent transaction with change output
    transactionType = 'sent'
  } else if (Number(transaction.received) > 0) {
    transactionType = 'received'
  } else {
    // Sent transaction without change output
    transactionType = 'sent'
  }

  const amount =
    transactionType === 'sent'
      ? `-${Sats(Number(transaction.sent) - Number(transaction.received))}`
      : transactionType === 'received'
        ? `+${Sats(Number(transaction.received))}`
        : `-${Sats(Number(transaction.fee))}` // selfTransfer reduces balance amount just by the fee

  return `
      <tr>
        <td>
          ${transactionType === 'selfTransfer' ? selfTransferIcon : transactionType === 'sent' ? sentIcon : receivedIcon}
        </td>
        <td>${transaction.txid}</td>
        <td>${CopyButtonXs(transaction.txid)}</td>
        <td>${amount}</td>
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
