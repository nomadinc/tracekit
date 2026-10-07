"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded-lg border border-white/15 bg-[#10131a] px-3 py-2 text-sm text-slate-100";
const buttonClass =
  "tk-primary-action rounded-lg px-4 py-2 text-sm disabled:opacity-40";
export function AdminForm({
  action,
  accountId,
  organizationId,
  membershipId,
  roles = [],
  currentRole,
}: {
  action: "create" | "role" | "remove";
  accountId?: string;
  organizationId?: string | null;
  membershipId?: string;
  roles?: Array<{ role_key: string; name: string }>;
  currentRole?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (action === "remove" && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/platform/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          accountId,
          organizationId,
          membershipId,
                  ...Object.fromEntries(form),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Operation unavailable.");
      setMessage("Saved.");
      setConfirming(false);
      if (action === "create")
        router.push(`/platform/clients/${body.accountId}`);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operation unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      {action === "create" ? (
        <>
          <label className="grid gap-1 text-xs">
            Client name
            <input
              name="name"
              required
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Account type
            <select name="accountType" className={inputClass}>
              <option value="client">Advertiser</option>
              <option value="agency">Agency</option>
            </select>
          </label>
        </>
      ) : null}
      {action === "role" ? (
        <label className="grid gap-1 text-xs">
          Role
          <select
            name="role"
            defaultValue={
              currentRole ||
              (roles.some((role) => role.role_key === "client-read-only")
                ? "client-read-only"
                : "agency-read-only")
            }
            className={inputClass}
          >
            {roles.map((role) => (
              <option key={role.role_key} value={role.role_key}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button disabled={busy} className={buttonClass}>
        {busy
          ? "Saving…"
          : confirming
            ? "Confirm"
            : {
                create: "Create client",
                role: "Update role",
                remove: "Remove access",
              }[action]}
      </button>
      {confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-sm"
        >
          Cancel
        </button>
      ) : null}
      {message ? (
        <p role="status" className="w-full text-xs text-slate-300">
          {message}
        </p>
      ) : null}
    </form>
  );
}
export function ClientViewButton({
  organizationId,
  canEnter,
}: {
  organizationId: string;
  canEnter: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !canEnter}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/session/admin-view", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ organizationId }),
            });
            if (!response.ok) throw new Error("Client view unavailable.");
            window.location.assign("/connections");
          } catch {
            setError("Client view unavailable.");
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Opening…"
          : canEnter
            ? "View as Client"
            : "Owner access required"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
