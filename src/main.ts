import { invoke } from "@tauri-apps/api/core";

let descriptorInput: HTMLInputElement | null;
let balanceMessage: HTMLElement | null;

async function setWallet() {
  if (balanceMessage && descriptorInput) {
    console.log(descriptorInput.value);
    await invoke("set_wallet", {
      receive: descriptorInput.value,
      change: "",
    }).catch(() => {
      if (balanceMessage) {
        balanceMessage.textContent = "Invalid descriptor!";
      }
    });
    balanceMessage.textContent = "Wallet set!";
  }
}

async function fetchBalance() {
  if (balanceMessage && descriptorInput) {
    const balance = (await invoke("fetch_balance")) as { confirmed: number };
    balanceMessage.textContent = balance.confirmed + " sats";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  descriptorInput = document.querySelector("#desciptor-input");
  balanceMessage = document.querySelector("#balance-msg");
  document
    .querySelector("#descriptor-form")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      setWallet();
    });
  document.querySelector("#balance-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchBalance();
  });
});
