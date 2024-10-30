import { Transaction } from '../bindings'

const TxRow = (transaction: Transaction) => {
  return `
      <tr>
        <td>${transaction.txid}</td>
        <td>${transaction.sent}</td>
        <td>${transaction.received}</td>
        <td>${transaction.fee}</td>
      </tr>
    `
}
export const Transactions = (transactions: Transaction[]) => transactions.map(TxRow).join('\n')
