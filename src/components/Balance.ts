type Balance = {
  confirmed: string
  unconfirmed: string
}

export const Balance = ({ confirmed, unconfirmed }: Balance) => {
  return `
      <h1>Your Balance</h1>
      <div class="stat">
        <div class="stat-value">${confirmed} sats</div>
        <div class="stat-desc">Confirmed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${unconfirmed} sats</div>
        <div class="stat-desc">Unconfirmed</div>
      </div>
    `
}
