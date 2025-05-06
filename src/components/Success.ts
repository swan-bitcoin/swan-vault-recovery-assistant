import { CircularTickIcon } from '../icons/circularTick'

export const Success = (text: string) => `
<div class="flex gap-1 items-center">
  ${CircularTickIcon}
  <span>${text}</span>
</div>
`
