"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function deliveryMessage(state?: string) {
  switch (state) {
    case "sent": return "WorkOS accepted the email for sending; mailbox delivery is unconfirmed.";
    case "failed": return "WorkOS rejected the send. Review the server diagnostics before retrying this invitation.";
    case "sending": return "The send is in progress. Check delivery again; do not create another invitation.";
    case "prepared": return "The invitation exists, but no email send has started.";
    default: return "The send outcome is unknown. Review provider activity before retrying to avoid duplicate emails.";
  }
}

type Context = { id: string; name: string };
const fieldClass = "rounded-lg border border-white/15 bg-[#10131a] px-3 py-2 text-sm text-slate-100";

export function InviteClientUser({ organizationId, contexts }: { organizationId: string; contexts: Context[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form className="mb-5 space-y-3 rounded-lg border border-white/10 p-4" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const businessContextIds = data.getAll("businessContextIds").map(String);
      if (!businessContextIds.length) { setMessage("Select at least one offer workspace."); return; }
      setBusy(true);
      setMessage("");
      try {
        const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "issue", organizationId, role: "client-read-only", intendedEmail: String(data.get("email") || ""), businessContextIds }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error();
        setMessage(`Invitation created. ${deliveryMessage(result.delivery?.state)}`);
        form.reset();
        router.refresh();
      } catch {
        setMessage("Invitation could not be confirmed. Refresh the invitation list before trying again.");
      } finally { setBusy(false); }
    }}>
      <h4 className="font-medium">Invite user</h4>
      <p className="text-xs text-slate-400">Read-only customer access to the selected offer workspaces. Invitation expires after seven days.</p>
      <label className="grid gap-1 text-xs">Email<input type="email" name="email" required maxLength={254} className={fieldClass} disabled={busy} /></label>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm">Offer workspaces</legend>
        {contexts.map(context => <label key={context.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="businessContextIds" value={context.id} />{context.name}</label>)}
      </fieldset>
      {!contexts.length ? <p className="text-sm text-amber-200">No active offer workspace is available. Set up a workspace before inviting a customer.</p> : null}
      <button disabled={busy || !contexts.length} className="tk-primary-action rounded-lg px-4 py-2 text-sm disabled:opacity-40">{busy ? "Creating invitation…" : "Send invitation"}</button>
      {message ? <p role="status" className="text-sm text-slate-300">{message}</p> : null}
    </form>
  );
}

export function PendingInvitationActions({ organizationId, invitationId }: { organizationId: string; invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [deliveryState, setDeliveryState] = useState<string | null>(null);
  async function request(operation: "delivery-status" | "deliver" | "revoke") {
    if (busy || (operation === "deliver" && !["failed", "prepared"].includes(deliveryState || ""))) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, organizationId, invitationId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error();
      setDeliveryState(operation === "revoke" ? null : result.delivery?.state || null);
      setMessage(operation === "revoke" ? "Invitation revoked." : deliveryMessage(result.delivery?.state));
      setConfirming(false);
      router.refresh();
    } catch { setDeliveryState(null); setMessage("Operation unavailable. Refresh to check the current invitation state."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" disabled={busy} onClick={() => request("delivery-status")} className="text-blue-300">Check delivery</button>
      <button type="button" disabled={busy || !["failed", "prepared"].includes(deliveryState || "")} onClick={() => request("deliver")} className="text-blue-300 disabled:opacity-40" title={deliveryState === null ? "Check delivery first" : undefined}>Resend invitation</button>
      <button type="button" disabled={busy} onClick={() => confirming ? request("revoke") : setConfirming(true)} className="text-rose-300">{confirming ? "Confirm revoke" : "Revoke invitation"}</button>
      {confirming ? <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button> : null}
    </div>
    {message ? <p role="status" className="text-xs text-slate-300">{message}</p> : null}
  </div>;
}
