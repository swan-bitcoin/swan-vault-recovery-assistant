const MODEL_NAMES: Record<string, string> = {
  bitbox02_nova_btconly: 'BitBox02 Nova Bitcoin-only',
  bitbox02_nova_multi: 'BitBox02 Nova Multi',
  bitbox02_btconly: 'BitBox02 Bitcoin-only',
  bitbox02_multi: 'BitBox02 Multi',
}

// Unknown models get the plain family name, so a value from the backend never reaches the page unchecked.
export function getBitbox02ModelName(model: string): string {
  return Object.hasOwn(MODEL_NAMES, model) ? MODEL_NAMES[model] : 'BitBox02'
}
