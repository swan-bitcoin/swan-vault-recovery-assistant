// import { invoke } from "@tauri-apps/api/core";
import { commands, type TempuraError } from "./bindings";

let DOM: {
  addressInput: HTMLInputElement;
  changeInput: HTMLInputElement;
  electrumInput: HTMLInputElement;
  feeRateInput: HTMLInputElement;
  message: HTMLElement;
  receiveInput: HTMLInputElement;
  networkRadios: NodeListOf<HTMLInputElement>;
};

function isTempuraError(e: unknown): e is TempuraError {
  const tempuraError = e as TempuraError;
  return !!(tempuraError.error_type && tempuraError.message);
}

function handleError(e: unknown) {
  if (!isTempuraError(e)) {
    DOM.message.textContent = "An unknown error occurred";
    return;
  }

  // TODO: we may not want to show the actual message directly to the user
  // but instead log it show a generic message based on the type
  console.log(e.error_type, e.message);
  DOM.message.textContent = e.error_type.concat(": ").concat(e.message);
}

type Inputs = {
  address: string;
  recv: string;
  change: string | null;
  electrum: string | null;
  feeRate: number;
  network: string;
};

function getInputs(): Inputs {
  const address = DOM.addressInput.value.trim();
  const recv = DOM.receiveInput.value.trim();
  const change = DOM.changeInput?.value.trim() || null;
  const electrum = DOM.electrumInput?.value.trim() || null;
  const feeRate = Number(DOM.feeRateInput?.value.trim());
  const network = Array.from(DOM.networkRadios).find(
    (radio) => radio.checked
  )!.value;

  return { address, recv, change, electrum, feeRate, network };
}

function require(value: unknown, itemName: string) {
  if (!value) {
    const message = itemName.concat(" is required");
    DOM.message.textContent = message;
    throw new Error(message);
  }
}

async function fetchBalance() {
  const { recv, change, electrum, network } = getInputs();
  require(recv, "Receive Descriptor");

  DOM.message.textContent = "Please wait...";
  try {
    const balance = await commands.fetchBalance(
      network,
      recv,
      change,
      electrum
    );
    DOM.message.textContent = balance.confirmed + " sats";
  } catch (e: unknown) {
    handleError(e);
  }
}

async function sweep() {
  const { address, recv, change, electrum, feeRate, network } = getInputs();
  require(recv, "Receive Descriptor");
  require(address, "Address");
  require(feeRate, "Fee Rate");

  DOM.message.textContent = "Please wait...";
  try {
    const psbt = await commands.sweep(
      address,
      feeRate,
      network,
      recv,
      change,
      electrum
    );
    console.log(psbt);
    DOM.message.textContent = psbt.psbt;
  } catch (e: unknown) {
    handleError(e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const addressInput =
    document.querySelector<HTMLInputElement>("#address-input");
  const changeInput = document.querySelector<HTMLInputElement>("#change-input");
  const electrumInput =
    document.querySelector<HTMLInputElement>("#electrum-input");
  const feeRateInput =
    document.querySelector<HTMLInputElement>("#feerate-input");
  const message = document.querySelector<HTMLElement>("#message");
  const receiveInput =
    document.querySelector<HTMLInputElement>("#receive-input");
  const networkRadios = document.querySelectorAll<HTMLInputElement>(
    'input[name="network"]'
  );

  if (
    !(
      addressInput &&
      changeInput &&
      electrumInput &&
      feeRateInput &&
      message &&
      receiveInput &&
      networkRadios.length > 0
    )
  ) {
    const error = "Failed to initialize: missing required DOM elements";
    if (message) {
      message.textContent = error;
    }
    throw new Error("Failed to initialize: missing required DOM elements");
  }

  DOM = {
    addressInput,
    changeInput,
    electrumInput,
    feeRateInput,
    message,
    receiveInput,
    networkRadios,
  };

  document
    .querySelector("#descriptor-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      fetchBalance();
    });

  document.querySelector("#sweep-button")?.addEventListener("click", (e) => {
    e.preventDefault();
    sweep();
  });
});
