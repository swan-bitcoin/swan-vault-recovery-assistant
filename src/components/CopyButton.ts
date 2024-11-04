const innerPaths = `
<!-- Clipboard Icon Path -->
<path d="M 16 3 C 14.742188 3 13.847656 3.890625 13.40625 5 L 6 5 L 6 28 L 26 28 L 26 5 L 18.59375 5 C 18.152344 3.890625 17.257813 3 16 3 Z M 16 5 C 16.554688 5 17 5.445313 17 6 L 17 7 L 20 7 L 20 9 L 12 9 L 12 7 L 15 7 L 15 6 C 15 5.445313 15.445313 5 16 5 Z M 8 7 L 10 7 L 10 11 L 22 11 L 22 7 L 24 7 L 24 26 L 8 26 Z" />
<!-- Checkmark Path inside Clipboard -->
<path d="M 12.5 17.5 l 3 3 l 5 -5" stroke="white" stroke-width="2" fill="none" class="hidden" id="checkmark"/>
`
export const CopyButton = (value: string) => `
    <div class="tooltip tooltip-accent" data-tip="Copy">
      <button class="btn btn-square btn-sm btn-info" name="copy", value="${value}">
        <svg class="h-6 w-6 fill-current transition-transform duration-300 ease-in-out" id="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
          ${innerPaths}
        </svg>
      </button>
    </div>
  </div>
`

export const CopyButtonXs = (value: string) => `
    <div class="tooltip tooltip-accent" data-tip="Copy">
      <button class="btn btn-square btn-xs btn-info" name="copy", value="${value}">
        <svg class="h-3 w-3 fill-current transition-transform duration-300 ease-in-out" id="copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
          <g transform="scale(0.5)">${innerPaths}</g>
        </svg>
      </button>
    </div>
  </div>
`
