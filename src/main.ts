// import { invoke } from "@tauri-apps/api/core";
import { commands, type TempuraError } from "./bindings";

let DOM: {
  receiveInput: HTMLInputElement;
  changeInput: HTMLInputElement;
  message: HTMLElement;
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
  const change = DOM.changeInput?.value.trim() || null;
  if (!recv) {
    DOM.message.textContent = "A valid receive descriptor is required";
    return;
  }

  DOM.message.textContent = "Please wait...";
  try {
    const balance = await commands.fetchBalance(recv, change);
    DOM.message.textContent = balance.confirmed + " sats";
  } catch (e: unknown) {
    handleError(e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const receiveInput =
    document.querySelector<HTMLInputElement>("#receive-input");
  const changeInput = document.querySelector<HTMLInputElement>("#change-input");
  const message = document.querySelector<HTMLElement>("#balance-msg");

  if (!(message && receiveInput && changeInput)) {
    throw new Error("Failed to initialize: missing required DOM elements");
  }

  DOM = {
    receiveInput,
    changeInput,
    message,
  };

  document
    .querySelector("#descriptor-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      fetchBalance();
    });
});
