import { useState, type FormEvent } from "react";
import { changePassword, reauthenticateCurrentPassword } from "../authClient";
import { clientFetch } from "../clientFetch";
import type { MeProfile } from "../types";

const DELETE_CONFIRM = "Delete your account? Your budgets will also be deleted.";

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

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isMeProfile(value: unknown): value is MeProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    "canUseFromText" in value &&
    typeof value.canUseFromText === "boolean" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "isModerator" in value &&
    typeof value.isModerator === "boolean"
  );
}

export function AccountScreen({
  me,
  getIdToken,
  onBack,
  onProfile,
  onDeleted,
}: {
  me: MeProfile;
  getIdToken: () => Promise<string>;
  onBack: () => void;
  onProfile: (me: MeProfile) => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [nameError, setNameError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  async function onSaveName(event: FormEvent) {
    event.preventDefault();
    setNameError("");
    const token = await getIdToken();
    const response = await clientFetch("/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ displayName }),
    });
    const data: unknown = await response.json();
    if (!response.ok || !isMeProfile(data)) {
      setNameError(errorFromBody(data, "Display name is required."));
      return;
    }
    setDisplayName(data.displayName);
    onProfile(data);
  }

  async function onUpdatePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
    } catch (error: unknown) {
      setPasswordError(messageFrom(error, "Current password is wrong."));
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("Password updated.");
  }

  async function onDelete(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm(DELETE_CONFIRM)) {
      return;
    }
    setDeleteError("");
    try {
      await reauthenticateCurrentPassword(deletePassword);
    } catch (error: unknown) {
      setDeleteError(messageFrom(error, "Current password is wrong."));
      return;
    }
    const token = await getIdToken();
    const response = await clientFetch("/api/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      setDeleteError(errorFromBody(data, "Not allowed."));
      return;
    }
    await onDeleted();
  }

  return (
    <>
      <h1>Account</h1>
      <p className="form-actions">
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back
        </button>
      </p>
      <form onSubmit={(event) => void onSaveName(event)}>
        <p className="field">
          <label htmlFor="account-display-name">Display name</label>
          <input
            id="account-display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {nameError ? <span className="field-error">{nameError}</span> : null}
        </p>
        <p className="form-actions">
          <button className="button button--primary" type="submit">
            Save
          </button>
        </p>
      </form>
      <form onSubmit={(event) => void onUpdatePassword(event)}>
        <p className="field">
          <label htmlFor="account-current-password">Current password</label>
          <input
            id="account-current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </p>
        <p className="field">
          <label htmlFor="account-new-password">New password</label>
          <input
            id="account-new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </p>
        <p className="field">
          <label htmlFor="account-confirm-password">Confirm new password</label>
          <input
            id="account-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </p>
        {passwordError ? <span className="field-error">{passwordError}</span> : null}
        {passwordMessage ? <p>{passwordMessage}</p> : null}
        <p className="form-actions">
          <button className="button button--primary" type="submit">
            Update password
          </button>
        </p>
      </form>
      {me.isModerator ? null : (
        <section>
          <h2>Delete account</h2>
          <form onSubmit={(event) => void onDelete(event)}>
            <p className="field">
              <label htmlFor="account-delete-password">Current password</label>
              <input
                id="account-delete-password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
              {deleteError ? <span className="field-error">{deleteError}</span> : null}
            </p>
            <p className="form-actions">
              <button className="button button--danger" type="submit">
                Delete account
              </button>
            </p>
          </form>
        </section>
      )}
    </>
  );
}
