"use client";

import * as React from "react";
import {
  Check,
  Clock3,
  MailPlus,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  UserMinus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { AccessBoundary } from "./access-control";
import { useIdentity } from "./identity-provider";
import { authorize } from "@/lib/identity/authorization";
import { TEAM_ROLES_BY_ACCOUNT_TYPE } from "@/lib/identity/team-management";
import type { Role } from "@/lib/identity/permissions";
import type { AccountType } from "@/lib/identity/types";
import type { TeamInvitationRecord, TeamMemberRecord } from "@/lib/identity/team-repository";

const ROLE_LABELS: Record<Role, string> = {
  "platform-owner": "Platform Owner",
  "platform-admin": "Platform Admin",
  support: "Support",
  billing: "Billing",
  "read-only-operations": "Read-only Operations",
  "agency-owner": "Agency Owner",
  "agency-admin": "Agency Admin",
  "team-member": "Team Member",
  "agency-read-only": "Agency Read-only",
  "organization-owner": "Organization Owner",
  "organization-admin": "Organization Admin",
  "analyst-operator": "Analyst / Operator",
  finance: "Finance",
  "customer-support": "Customer Support",
  "client-read-only": "Client Read-only",
};

function accountTypeFromSession(value: unknown): AccountType {
  return value === "platform" || value === "agency" ? value : "client";
}

function statusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (status === "suspended") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300";
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function TeamWorkspace() {
  return (
    <AccessBoundary permission="users.view">
      <TeamWorkspaceContent />
    </AccessBoundary>
  );
}

function TeamWorkspaceContent() {
  const { session } = useIdentity();
  const accountType = accountTypeFromSession(session.identity.membership.accountType);
  const canInvite = authorize(session.identity, "users.invite", session.activeOrganizationId).allowed;
  const canManage = authorize(session.identity, "users.manage_permissions", session.activeOrganizationId).allowed;
  const canRemove = authorize(session.identity, "users.remove", session.activeOrganizationId).allowed;
  const roles = TEAM_ROLES_BY_ACCOUNT_TYPE[accountType] as readonly Role[];

  const [members, setMembers] = React.useState<TeamMemberRecord[]>([]);
  const [invitations, setInvitations] = React.useState<TeamInvitationRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>(roles[0]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/team/members", { cache: "no-store" }),
        fetch("/api/team/invitations", { cache: "no-store" }),
      ]);
      if (!membersResponse.ok || !invitationsResponse.ok) throw new Error("Team data is unavailable.");
      const memberPayload = await membersResponse.json() as { members?: TeamMemberRecord[] };
      const invitationPayload = await invitationsResponse.json() as { invitations?: TeamInvitationRecord[] };
      setMembers(memberPayload.members || []);
      setInvitations(invitationPayload.invitations || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Team data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load, session.activeOrganizationId]);
  React.useEffect(() => { setRole(roles[0]); }, [accountType]);

  async function createInvitation(event: React.FormEvent) {
    event.preventDefault();
    if (!canInvite || busy) return;
    setBusy("invite");
    setNotice(null);
    try {
      const response = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Invitation could not be sent.");
      setEmail("");
      setInviteOpen(false);
      setNotice("Invitation sent.");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Invitation could not be sent.");
    } finally {
      setBusy(null);
    }
  }

  async function mutateMember(member: TeamMemberRecord, patch: { role?: Role; status?: "active" | "suspended" | "removed" }) {
    if (busy) return;
    setBusy(member.membershipId);
    setNotice(null);
    try {
      const response = await fetch(`/api/team/members/${member.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Member update failed.");
      setNotice("Team member updated.");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Member update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function invitationAction(invitation: TeamInvitationRecord, action: "resend" | "revoke") {
    if (busy) return;
    setBusy(invitation.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/team/invitations/${invitation.id}/${action}`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Invitation ${action} failed.`);
      setNotice(action === "resend" ? "Invitation resent." : "Invitation revoked.");
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : `Invitation ${action} failed.`);
    } finally {
      setBusy(null);
    }
  }

  const activeCount = members.filter((member) => member.status === "active").length;
  const pendingCount = invitations.filter((invitation) => invitation.status === "pending").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-white/10 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Identity & Access
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Team</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Manage membership, roles and invitations for the current {accountType === "client" ? "organization" : `${accountType} account`}.
          </p>
        </div>
        {canInvite && (
          <button onClick={() => setInviteOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
            <MailPlus className="h-4 w-4" /> Invite member
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<UsersRound className="h-4 w-4" />} label="Active members" value={String(activeCount)} />
        <Metric icon={<Clock3 className="h-4 w-4" />} label="Pending invitations" value={String(pendingCount)} />
        <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Available roles" value={String(roles.length)} />
      </section>

      {notice && <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-ink dark:text-slate-200">{notice}</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}

      {inviteOpen && canInvite && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-ink">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">New invitation</p>
              <h2 className="mt-1 text-lg font-semibold">Invite a team member</h2>
              <p className="mt-1 text-sm text-slate-500">WorkOS will deliver the invitation. TraceKit controls the resulting role and tenancy access.</p>
            </div>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5" aria-label="Close invitation form"><X className="h-4 w-4" /></button>
          </div>
          <form onSubmit={createInvitation} className="mt-5 grid gap-3 md:grid-cols-[1fr_240px_auto]">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="name@company.com" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-400 dark:border-white/10 dark:bg-black/10" />
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-ink">
              {roles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
            </select>
            <button disabled={busy === "invite"} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">
              {busy === "invite" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />} Send invite
            </button>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Membership</p>
            <h2 className="mt-1 font-semibold">Team members</h2>
          </div>
          <button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5" aria-label="Refresh team"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
        {loading ? <State text="Loading team members…" /> : members.length === 0 ? <State text="No team members are visible in this scope." /> : (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {members.map((member) => (
              <div key={member.membershipId} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_220px_130px_170px] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"><UserRound className="h-4 w-4 text-slate-500" /></span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{member.displayName || member.primaryEmail}</div>
                    <div className="truncate text-xs text-slate-500">{member.primaryEmail}</div>
                    <div className="mt-1 text-[10px] text-slate-400">Last sign in: {formatDate(member.lastSignInAt)}</div>
                  </div>
                </div>
                <div>
                  {canManage && member.status !== "removed" ? (
                    <select disabled={busy === member.membershipId} value={member.role} onChange={(event) => void mutateMember(member, { role: event.target.value as Role })} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs dark:border-white/10 dark:bg-ink">
                      {roles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                    </select>
                  ) : <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{ROLE_LABELS[member.role]}</span>}
                </div>
                <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone(member.status)}`}>{member.status}</span></div>
                <div className="flex items-center justify-end gap-2">
                  {member.status === "suspended" && canManage && <ActionButton title="Reactivate" onClick={() => void mutateMember(member, { status: "active" })} disabled={busy === member.membershipId}><Check className="h-4 w-4" /></ActionButton>}
                  {member.status === "active" && canManage && <ActionButton title="Suspend" onClick={() => void mutateMember(member, { status: "suspended" })} disabled={busy === member.membershipId}><Clock3 className="h-4 w-4" /></ActionButton>}
                  {member.status !== "removed" && canRemove && <ActionButton title="Remove" onClick={() => { if (window.confirm(`Remove ${member.displayName || member.primaryEmail} from this team?`)) void mutateMember(member, { status: "removed" }); }} disabled={busy === member.membershipId}><UserMinus className="h-4 w-4" /></ActionButton>}
                  {!canManage && !canRemove && <MoreHorizontal className="h-4 w-4 text-slate-300" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-ink">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Invitation history</p>
          <h2 className="mt-1 font-semibold">Invitations</h2>
        </div>
        {invitations.length === 0 ? <State text="No invitations have been created in this scope." /> : (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_200px_120px_180px] md:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{invitation.intendedEmail}</div>
                  <div className="mt-1 text-xs text-slate-500">{ROLE_LABELS[invitation.role]} · Expires {formatDate(invitation.expiresAt)}</div>
                </div>
                <div className="text-xs text-slate-500">Created {formatDate(invitation.createdAt)}</div>
                <div><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusTone(invitation.status)}`}>{invitation.status}</span></div>
                <div className="flex justify-end gap-2">
                  {canInvite && (invitation.status === "pending" || invitation.status === "expired") && <ActionButton title="Resend" onClick={() => void invitationAction(invitation, "resend")} disabled={busy === invitation.id}><RefreshCw className="h-4 w-4" /></ActionButton>}
                  {canInvite && invitation.status === "pending" && <ActionButton title="Revoke" onClick={() => void invitationAction(invitation, "revoke")} disabled={busy === invitation.id}><X className="h-4 w-4" /></ActionButton>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{icon}{label}</div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div></div>;
}

function State({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{text}</div>;
}

function ActionButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white">{children}</button>;
}
