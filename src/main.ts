// import { invoke } from "@tauri-apps/api/core";
import { commands, TempuraError } from "./bindings";

let receiveInput: HTMLInputElement | null;
let changeInput: HTMLInputElement | null;
let balanceMessage: HTMLElement | null;

// async function setWallet() {
//   if (balanceMessage && receiveInput) {
//     const change = changeInput?.value;
//     await commands.setWallet(receiveInput.value, change).catch((e) => {
//       if (balanceMessage) {
//         balanceMessage.textContent = e.message;
//       }
//     });
//     balanceMessage.textContent = "Wallet set!";
//   }
// }

async function fetchBalance() {
  const recv = receiveInput?.value;
  if (!recv) {
    if (balanceMessage) {
      balanceMessage.textContent = "A valid receive descriptor is required";
    }
    return;
  }

  if (balanceMessage) {
    const change = changeInput?.value ?? null;
    balanceMessage.textContent = "Please wait...";
    try {
      const balance = await commands.fetchBalance(recv, change);
      balanceMessage.textContent = balance.confirmed + " sats";
    } catch (e: unknown) {
      // TODO: this error strategy is causing the shape to change depending on the error.
      console.log(e);
      if (e instanceof Error) {
        balanceMessage!.textContent = e.message;
      } else {
        balanceMessage!.textContent = "An unknown error occurred";
      }
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  receiveInput = document.querySelector("#receive-input");
  changeInput = document.querySelector("#change-input");
  balanceMessage = document.querySelector("#balance-msg");
  document
    .querySelector("#descriptor-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      fetchBalance();
    });
});
