"use client";
import { useState } from "react";
export function InvitationAcceptance({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function accept() {
    setPending(true);
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "accept", invitationId: id }) });
      if (!response.ok) { setMessage("Invitation unavailable. Confirm you signed in with the intended verified email and the invitation is still pending."); return; }
      window.location.assign("/");
    } catch { setMessage("Invitation processing is unavailable. Try again later."); }
    finally { setPending(false); }
  }
  return <div className="mt-6"><button disabled={pending} onClick={accept} className="rounded border px-4 py-2">{pending ? "Accepting…" : "Accept invitation"}</button><p role="status">{message}</p></div>;
}
