import { Sats } from '../components'

export type TransactionOverviewProps = {
  address: string
  outbound: string
  fee: string | null
}

export const populateTransactionOverview = ({ address, outbound, fee }: TransactionOverviewProps) => {
  const transactionRowTds = document.querySelectorAll('#transaction-overview-body tr td')
  transactionRowTds[0].textContent = address
  transactionRowTds[1].innerHTML = Sats(outbound)
  transactionRowTds[2].innerHTML = Sats(fee || '')
}
