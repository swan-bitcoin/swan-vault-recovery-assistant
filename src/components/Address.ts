type Address = {
  address: string
}

export const Address = ({ address }: Address) => {
  return `<span class="break-all">${address}</span>`
}
