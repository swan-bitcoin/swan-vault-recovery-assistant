import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

enum DescriptorResponse {
  None = "None",
  Testnet = "Testnet",
  Mainnet = "Mainnet",
}

enum DescriptorType {
  Receive = "Receive",
  Change = "Change",
}

function App() {
  const [message, setMessage] = useState(
    "Hello, enter some descriptors to begin."
  );
  const [receive, setReceive] = useState("");
  const [isReceiveValid, setIsReceiveValid] = useState(false);
  const [change, setChange] = useState("");
  const [isChangeValid, setIsChangeValid] = useState(false);
  const receiveForm = useRef<HTMLFormElement>(null);
  const changeForm = useRef<HTMLFormElement>(null);
  const [receiveNetwork, setReceiveNetwork] = useState<DescriptorResponse>(
    DescriptorResponse.None
  );
  const [isLockedIn, setIsLockedIn] = useState(false);

  async function fetchBalance() {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    setMessage(await invoke("fetch_balance"));
  }

  async function reset() {
    await invoke("reset");
    setIsReceiveValid(false);
    setIsChangeValid(false);
    setIsLockedIn(false);
    if (receiveForm.current) {
      receiveForm.current.reset();
    }
    if (changeForm.current) {
      changeForm.current.reset();
    }
    setMessage("Sometimes you gotta go back to go forward");
  }

  async function setWallet() {
    await invoke("set_wallet", { receive, change }).catch(() => {
      setIsLockedIn(false);
      setMessage("Something went wrong while locking in your wallet.");
    });
    setMessage(
      "Your wallet is locked in. You may now fetch your balance or transactions..."
    );
    setIsLockedIn(true);
  }

  async function validateReceive() {
    const res = await invoke("verify_descriptor", {
      descriptor: receive,
    }).catch(() => {
      setIsReceiveValid(false);
      setMessage(
        `The receive descriptor you've entered is not valid, verify the value and try again.`
      );
      return;
    });

    let msg: string | undefined = undefined;
    switch (res) {
      case DescriptorResponse.None:
        setIsReceiveValid(false);
        setMessage(
          "Something unexpected went wrong with the receive descriptor, verify the value and try again."
        );
        break;

      // @ts-ignore(7029) - intentional fallthrough
      case DescriptorResponse.Testnet:
        msg =
          "The receive descriptor you've entered valid for the test network.";
      case DescriptorResponse.Mainnet:
        msg = msg || "The receive descriptor you've entered is valid!";
        setReceiveNetwork(res);
        setMessage(msg);
        setIsReceiveValid(true);
        break;
    }
  }

  async function validateChange() {
    console.log("change", change);
    const res = await invoke("verify_descriptor", { descriptor: change }).catch(
      () => {
        setIsChangeValid(false);
        setMessage(
          "The change descriptor you've entered is not valid, verify the value and try again."
        );
        return;
      }
    );

    let msg: string | undefined = undefined;
    switch (res) {
      case DescriptorResponse.None:
        setIsChangeValid(false);
        setMessage(
          "Something unexpected went wrong with the change descriptor, verify the value and try again."
        );
        break;

      // @ts-ignore(7029) - intentional fallthrough
      case DescriptorResponse.Testnet:
      case DescriptorResponse.Mainnet:
        console.log(receiveNetwork, res);
        if (res !== receiveNetwork) {
          setIsChangeValid(false);
          setMessage(
            "The change descriptor you've provided is valid but incompatible with the receive descriptor, verify the value and try again."
          );
          break;
        }

        msg = msg || "The descriptors you've entered are both valid!";
        setMessage(msg);
        setIsChangeValid(true);
        break;
    }
  }

  return (
    <div className="container">
      <h1>Temporal Wallet Kit</h1>
      <p>
        This is a native desktop application with a React frontend that uses
        Tauri to interact with a Rust backend. It persists no data. You can
        easily check balances with this app. It could be easily extended to list
        transactions, and a simple sweep recovery feature that could require
        users to type their mnemonics for simple empergency recovery,
        potentially adding hardware device support. This took me about 2 hours
        to implement.
      </p>

      <div className="row">
        <img src="/bitcoin.png" className="logo bitcoin" alt="bitcoin" />
      </div>

      <p>{message}</p>

      {!isLockedIn ? (
        <>
          <form
            ref={receiveForm}
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              validateReceive();
            }}
          >
            <input
              id="receive-input"
              onChange={(e) => setReceive(e.currentTarget.value)}
              placeholder="Receive descriptor:"
            />
            <button type="submit" disabled={isReceiveValid}>
              {isReceiveValid ? "Locked In" : "Check"}
            </button>
          </form>

          {isReceiveValid ? (
            <form
              ref={changeForm}
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                validateChange();
              }}
            >
              <input
                id="change-input"
                onChange={(e) => setChange(e.currentTarget.value)}
                placeholder="Change descriptor (optional):"
              />
              <button type="submit" disabled={isChangeValid}>
                {isChangeValid ? "Locked In" : "Check"}
              </button>
            </form>
          ) : null}
        </>
      ) : null}

      {isReceiveValid && !isLockedIn ? (
        <div>
          <button className="action" type="button" onClick={reset}>
            Start Over
          </button>

          <button className="action" type="button" onClick={setWallet}>
            I'm Ready!
          </button>
        </div>
      ) : null}

      {isLockedIn ? (
        <div>
          <button className="action" type="button" onClick={reset}>
            Start Over
          </button>

          <button className="action" type="button" onClick={fetchBalance}>
            Get Balance
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
