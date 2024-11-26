import type { Transaction, Balance as BalanceType } from '@/bindings'
import { countTransactions, getFirstTransaction } from '../utilities'
import { Balance } from './Balance'

const generateRandomString = (length = 8) => {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
}

type WalletInfoProps = {
  balance: BalanceType
  transactions: Transaction[]
}

export const WalletInfo = ({ balance, transactions }: WalletInfoProps) => {
  const { unconfirmedCount, confirmedCount } = countTransactions(transactions)
  const firstTransaction = getFirstTransaction(transactions)
  const tabId = generateRandomString() // without this we get bugs if the user fetches the wallet info more than once

  return `
      <div class="flex flex-col justify-center items-center wallet-info">
        <div role="tablist" class="tabs tabs-bordered">
          <!-- Invisible inputs to push the tabs to the center -->
          <input type="radio" name="wallet_info_tabs_${tabId}" class="tab opacity-0 pointer-events-none" aria-hidden="true" />
          <input type="radio" name="wallet_info_tabs_${tabId}" class="tab opacity-0 pointer-events-none" aria-hidden="true" />
  
          <!-- Balance Tab -->
          <input
            type="radio"
            name="wallet_info_tabs_${tabId}"
            role="tab"
            class="tab"
            aria-label="Balance"
            checked="checked"
          />
          <div role="tabpanel" class="tab-content rounded-box mt-4 w-80">
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
          <div role="tabpanel" class="tab-content rounded-box mt-6 w-80">
            <div class="flex flex-col gap-4 items-start">
              <div class="flex items-center gap-2">
                <span class="badge badge-neutral">Total ${transactions.length}</span>
                <span class="badge badge-warning">Unconfirmed ${unconfirmedCount}</span>
                <span class="badge badge-success">Confirmed ${confirmedCount}</span>
              </div>
              ${
                firstTransaction?.confirmation_height
                  ? `<div class="flex gap-1">
                <p class="text-md flex-grow-0">First Transaction in Block:</p>
                <span>${firstTransaction.confirmation_height}</span>
              </div>`
                  : '<span>No transactions yet</span>'
              }
              <button class="btn btn-outline btn-ghost btn-sm self-center mt-4 mb-2" id="show-transactions-btn">
                Show Full List
              </button>
            </div>
          </div>
        </div>
      </div>
    `
}
