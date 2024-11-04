import { Transaction } from '../bindings'
import { CopyButtonXs, Sats } from '.'

const TxRow = (transaction: Transaction) => {
  return `
      <tr>
        <td>${CopyButtonXs(transaction.txid)}${transaction.txid}</td>
        <td>${Sats(transaction.sent)}</td>
        <td class="${Number(transaction.received) > 0 ? 'text-success' : ''}">${Sats(transaction.received)}</td>
        <td>${Sats(transaction.fee)}</td>
        <td>${transaction.confirmation_height || 'Unconfirmed'}</td>
      </tr>
    `
}
export const Transactions = (transactions: Transaction[]) => transactions.map(TxRow).join('\n')
