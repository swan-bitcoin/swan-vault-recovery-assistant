import type { AddressInfo, Balance as BalanceType, Transaction } from '@/bindings'
import { countTransactions, getFirstTransaction } from '../utilities'
import { Address } from './Address'
import { Balance } from './Balance'

const generateRandomString = (length = 8) => {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
}

type WalletInfoProps = {
  balance: BalanceType
  transactions: Transaction[]
  addressInfo: AddressInfo
}

export const WalletInfo = ({ balance, transactions, addressInfo }: WalletInfoProps) => {
  const { unconfirmedCount, confirmedCount } = countTransactions(transactions)
  const firstTransaction = getFirstTransaction(transactions)
  const tabId = generateRandomString() // without this we get bugs if the user fetches the wallet info more than once

  return `
      <div class="wallet-info">
        <div role="tablist" class="tabs tabs-bordered">  
          <!-- Balance Tab -->
          <input
            type="radio"
            name="wallet_info_tabs_${tabId}"
            role="tab"
            class="tab"
            aria-label="Balance"
            checked="checked"
          />
          <div role="tabpanel" class="tab-content rounded-box mt-4">
            ${Balance({
              confirmed: balance.confirmed,
              unconfirmed: balance.untrusted_pending,
            })}
          </div>

          <!-- Transactions Tab -->
          <input
            type="radio"
            name="wallet_info_tabs_${tabId}"
            role="tab"
            class="tab"
            aria-label="Transactions"
          />
          <div role="tabpanel" class="tab-content rounded-box mt-4">
            <div class="flex flex-col gap-4 items-center">
              <div class="flex gap-2">
                <span class="badge badge-neutral">Total ${transactions.length}</span>
                <span class="badge badge-warning">Unconfirmed ${unconfirmedCount}</span>
                <span class="badge badge-success">Confirmed ${confirmedCount}</span>
              </div>
              ${
                firstTransaction?.confirmation_height
                  ? `<div class="flex gap-1">
                  <span>First Transaction in Block:</span>
                  <span>${firstTransaction.confirmation_height}</span>
                </div>`
                  : '<span>No transactions yet</span>'
              }
              <button class="btn btn-outline btn-ghost btn-sm mt-4 mb-2" id="show-transactions-btn">
                Show Full List
              </button>
            </div>
          </div>

          <!-- Receive Tab -->
          <input
            type="radio"
            name="wallet_info_tabs_${tabId}"
            role="tab"
            class="tab"
            aria-label="Receive"
          />
          <div role="tabpanel" class="tab-content rounded-box mt-6 mb-4">
            <div class="indicator w-60">
              <span class="indicator-item badge badge-primary">Next Unused</span>
              <span class="indicator-item indicator-bottom badge badge-neutral">#${addressInfo.index}</span>
              <div class="bg-base-100 flex justify-center rounded-box px-4 py-2">
                ${Address({ address: addressInfo.address })}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
}
