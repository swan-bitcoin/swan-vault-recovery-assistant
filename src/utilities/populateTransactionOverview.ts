import { Sats } from '../components'

export type TransactionOverviewProps = {
  address: string
  outbound: string
  fee: string | null
}

export const populateTransactionOverview = ({ address, outbound, fee }: TransactionOverviewProps) => {
  const overviewAmount = document.getElementById('transaction-overview-amount')
  if (overviewAmount) {
    overviewAmount.innerHTML = Sats(outbound)
  }

  const overviewFee = document.getElementById('transaction-overview-fee')
  if (overviewFee) {
    overviewFee.innerHTML = Sats(fee || '')
  }

  const overviewAddress = document.getElementById('transaction-overview-address')
  if (overviewAddress) {
    overviewAddress.textContent = address
  }
}
