"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function deliveryMessage(state?: string) {
  switch (state) {
    case "sign-in-required": return "This email already has a WorkOS account. Share the invitation link below; the recipient can sign in with email and accept it. No invitation email was sent.";
    case "sent": return "WorkOS accepted the email for sending; mailbox delivery is unconfirmed.";
    case "failed": return "WorkOS rejected the send. Review the server diagnostics before retrying this invitation.";
    case "sending": return "The send is in progress. Check delivery again; do not create another invitation.";
    case "prepared": return "The invitation exists, but no email send has started.";
    default: return "The send outcome is unknown. Review provider activity before retrying to avoid duplicate emails.";
  }
}

type Context = { id: string; name: string };
const fieldClass = "rounded-lg border border-white/15 bg-[#10131a] px-3 py-2 text-sm text-slate-100";

export function InviteClientUser({ organizationId, accountId, contexts }: { organizationId?: string; accountId?: string; contexts: Context[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [acceptancePath, setAcceptancePath] = useState<string | null>(null);
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
      setAcceptancePath(null);
      try {
        const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "issue", ...(accountId ? { accountId } : { organizationId }), role: accountId ? "agency-read-only" : "client-read-only", intendedEmail: String(data.get("email") || ""), businessContextIds }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error();
        setAcceptancePath(result.delivery?.state === "sign-in-required" ? result.acceptancePath : null);
        setMessage(`Invitation created. ${deliveryMessage(result.delivery?.state)}`);
        form.reset();
        router.refresh();
      } catch {
        setMessage("Invitation could not be confirmed. Refresh the invitation list before trying again.");
      } finally { setBusy(false); }
    }}>
      <h4 className="font-medium">Invite user</h4>
      <p className="text-xs text-slate-400">{accountId ? "Read-only agency access to the selected assigned-client workspaces." : "Read-only customer access to the selected offer workspaces."} Invitation expires after seven days.</p>
      <label className="grid gap-1 text-xs">Email<input type="email" name="email" required maxLength={254} className={fieldClass} disabled={busy} /></label>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm">Offer workspaces</legend>
        {contexts.map(context => <label key={context.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="businessContextIds" value={context.id} />{context.name}</label>)}
      </fieldset>
      {!contexts.length ? <p className="text-sm text-amber-200">No active offer workspace is available. Set up a workspace before inviting a customer.</p> : null}
      <button disabled={busy || !contexts.length} className="tk-primary-action rounded-lg px-4 py-2 text-sm disabled:opacity-40">{busy ? "Creating invitation…" : "Send invitation"}</button>
      {message ? <p role="status" className="text-sm text-slate-300">{message}</p> : null}
      {acceptancePath ? <InvitationLink path={acceptancePath} /> : null}
    </form>
  );
}

export function PendingInvitationActions({ organizationId, accountId, invitationId }: { organizationId?: string; accountId?: string; invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [deliveryState, setDeliveryState] = useState<string | null>(null);
  async function request(operation: "delivery-status" | "deliver" | "revoke") {
    if (busy || (operation === "deliver" && !canRetry)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, ...(accountId ? { accountId } : { organizationId }), invitationId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error();
      setCanRetry(result.delivery?.canRetry === true);
      setDeliveryState(operation === "revoke" ? null : result.delivery?.state || null);
      setMessage(operation === "revoke" ? "Invitation revoked." : deliveryMessage(result.delivery?.state));
      setConfirming(false);
      router.refresh();
    } catch { setCanRetry(false); setDeliveryState(null); setMessage("Operation unavailable. Refresh to check the current invitation state."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-3 text-sm">
      <button type="button" disabled={busy} onClick={() => request("delivery-status")} className="text-blue-300">Check delivery</button>
      <button type="button" disabled={busy || !canRetry} onClick={() => request("deliver")} className="text-blue-300 disabled:opacity-40" title={deliveryState === null ? "Check delivery first" : undefined}>Resend invitation</button>
      <button type="button" disabled={busy} onClick={() => confirming ? request("revoke") : setConfirming(true)} className="text-rose-300">{confirming ? "Confirm revoke" : "Revoke invitation"}</button>
      {confirming ? <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button> : null}
    </div>
    {message ? <p role="status" className="text-xs text-slate-300">{message}</p> : null}
    {deliveryState === "sign-in-required" ? <InvitationLink path={`/invitations/${invitationId}`} /> : null}
  </div>;
}

function InvitationLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="space-y-2 text-sm"><p>Share this invitation with its intended recipient.</p><button type="button" className="text-blue-300" onClick={async () => { try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Invitation link copied" : "Copy invitation link"}</button><p className="break-all text-xs text-slate-400">{path}</p></div>;
}

export function AgencyClientAssignments({ accountId, organizations, assignedIds }: { accountId: string; organizations: Array<{id: string; name: string}>; assignedIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function update(organizationId: string, remove: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/platform/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({action: "agency-assignment", accountId, organizationId, remove}) });
      if (!response.ok) throw new Error();
      setMessage(remove ? "Client assignment and agency workspace grants removed." : "Client assigned. Select workspaces when inviting agency members."); router.refresh();
    } catch { setMessage("Assignment could not be confirmed. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Assigned clients</h2><p className="text-sm text-slate-400">Assign clients before inviting agency members. Removing a client removes agency workspace grants and revokes affected pending invitations.</p>{organizations.map(org => <div key={org.id} className="flex items-center justify-between gap-3 text-sm"><span>{org.name}</span><button type="button" disabled={busy} className="text-blue-300 disabled:opacity-40" onClick={() => update(org.id, assignedIds.includes(org.id))}>{assignedIds.includes(org.id) ? "Remove assignment" : "Assign client"}</button></div>)}{message ? <p role="status" className="text-sm">{message}</p> : null}</section>;
}
