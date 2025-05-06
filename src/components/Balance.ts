import { Sats } from '.'

type Balance = {
  confirmed: string
  unconfirmed: string
}

export const Balance = ({ confirmed, unconfirmed }: Balance) => {
  return `
    <div class="flex flex-col gap-4 py-4">
      <div class="stat p-0">
        <div class="stat-value font-normal">${Sats(confirmed)}</div>
        <div class="stat-desc">Confirmed</div>
      </div>
      <div class="stat p-0">
        <div class="stat-value font-normal">${Sats(unconfirmed)}</div>
        <div class="stat-desc">Unconfirmed</div>
      </div>
    </div>
  `
}
