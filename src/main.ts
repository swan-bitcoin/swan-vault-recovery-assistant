// import { invoke } from "@tauri-apps/api/core";
import { commands, type TempuraError } from "./bindings";

let DOM: {
  changeInput: HTMLInputElement;
  electrumInput: HTMLInputElement;
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

async function fetchBalance() {
  const recv = DOM.receiveInput.value.trim();
  if (!recv) {
    DOM.message.textContent = "A valid receive descriptor is required";
    return;
  }

  const change = DOM.changeInput?.value.trim() || null;
  const electrum = DOM.electrumInput?.value.trim() || null;
  const network = Array.from(DOM.networkRadios).find(
    (radio) => radio.checked
  )!.value;

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

window.addEventListener("DOMContentLoaded", () => {
  const changeInput = document.querySelector<HTMLInputElement>("#change-input");
  const electrumInput =
    document.querySelector<HTMLInputElement>("#electrum-input");
  const message = document.querySelector<HTMLElement>("#balance-msg");
  const receiveInput =
    document.querySelector<HTMLInputElement>("#receive-input");
  const networkRadios = document.querySelectorAll<HTMLInputElement>(
    'input[name="network"]'
  );

  if (
    !(
      changeInput &&
      electrumInput &&
      message &&
      receiveInput &&
      networkRadios.length > 0
    )
  ) {
    throw new Error("Failed to initialize: missing required DOM elements");
  }

  DOM = {
    changeInput,
    electrumInput,
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
});
