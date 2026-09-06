import { useState, type FormEvent } from "react";
import { parseMoney } from "../money";

export function EntriesTab() {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseMoney(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
  }

  return (
    <form onSubmit={onSubmit}>
      <p>
        <label htmlFor="entry-amount">Amount</label>
        <input
          id="entry-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <span>EUR</span>
      </p>
      {error ? <p>{error}</p> : null}
      <button type="submit">Add</button>
    </form>
  );
}
