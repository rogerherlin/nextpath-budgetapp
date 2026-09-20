import { useState, type FormEvent } from "react";
import {
  notifyProfileReady,
  registerWithPassword,
  signInWithPassword,
} from "../authClient";
import { clientFetch } from "../clientFetch";

function errorFromBody(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  async function onSignIn(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await signInWithPassword(email, password);
    } catch {
      setError("Could not sign in.");
    }
  }

  async function onRegister() {
    setError("");
    try {
      const user = await registerWithPassword(email, password);
      const token = await user.getIdToken();
      const response = await clientFetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(errorFromBody(data, "Could not sign in."));
        return;
      }
      notifyProfileReady();
    } catch {
      setError("Could not sign in.");
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={onSignIn}>
        <p className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="text"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </p>
        <p className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </p>
        <p className="field">
          <label htmlFor="login-display-name">Display name</label>
          <input
            id="login-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </p>
        {error ? <span className="field-error">{error}</span> : null}
        <p className="form-actions">
          <button className="button button--primary" type="submit">
            Sign in
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void onRegister()}
          >
            Register
          </button>
        </p>
      </form>
    </>
  );
}
