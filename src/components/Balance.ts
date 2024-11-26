import { Sats } from '.'

type Balance = {
  confirmed: string
  unconfirmed: string
}

export const Balance = ({ confirmed, unconfirmed }: Balance) => {
  return `
      <div class="stat">
        <div class="stat-value">${Sats(confirmed)}</div>
        <div class="stat-desc">Confirmed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${Sats(unconfirmed)}</div>
        <div class="stat-desc">Unconfirmed</div>
      </div>
    `
}
