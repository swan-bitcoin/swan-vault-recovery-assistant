const DECIMAL_SEP = Number(1.1).toLocaleString().slice(1, 2)

export const Sats = (sats: number | string) => {
  const satsStr = Math.round(Number(sats)).toString().padStart(9, '0')
  const btcStr = Number.parseInt(satsStr.slice(0, -8)).toLocaleString() + DECIMAL_SEP
  const combinedStr = btcStr + satsStr.slice(-8, -6) + ' ' + satsStr.slice(-6, -3) + ' ' + satsStr.slice(-3)
  const firstNonZeroIndex = combinedStr.search(/[1-9]/)
  const splitIndex = firstNonZeroIndex === -1 ? combinedStr.length : firstNonZeroIndex
  const leading = combinedStr.slice(0, splitIndex)
  const trailing = combinedStr.slice(splitIndex)
  return `₿<span class="opacity-70">${leading}</span>${trailing}`
}
