import { CopyButton } from './'

type Address = {
  address: string
}

export const Address = ({ address }: Address) => {
  return `
    <div class="flex items-center space-x-2 relative">
      <span id="wallet-address" class="break-all">${address}</span>
      ${CopyButton(address)}
    </div>
  `
}
