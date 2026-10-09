import Link from "next/link";
import { notFound } from "next/navigation";
import { platformSession } from "@/lib/platform/admin-server";
import { loadClientDetail, type Row } from "@/lib/platform/admin-repository";
import { InviteClientUser, PendingInvitationActions } from "@/components/platform/client-invitations";
import {
  AdminForm,
  ClientViewButton,
} from "@/components/platform/admin-actions";
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const session = await platformSession(),
    { accountId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) notFound();
  const detail = await loadClientDetail(session, accountId);
  if (!detail) notFound();
  const roles = detail.roles.map((role) => ({
    role_key: String(role.role_key),
    name: String(role.name),
  }));
  const writable =
    ["platform-owner", "platform-admin"].includes(session.role) &&
    detail.account.status === "active";
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Link href="/platform/clients" className="text-sm text-blue-300">
        ← All Clients
      </Link>
      <header>
        <h1 className="mt-4 text-3xl font-semibold">
          {String(detail.account.name)}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {detail.account.account_type === "client" ? "Advertiser" : "Agency"} ·{" "}
          {String(detail.account.status)}
        </p>
      </header>
      {detail.groups.map((group) => {
        const orgActive =
          !group.organizationId ||
          detail.organizations.find((org) => org.id === group.organizationId)
            ?.status === "active";
        return (
          <section
            key={group.organizationId || accountId}
            className="space-y-6 rounded-xl border border-white/10 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">{group.name}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {writable && orgActive && group.organizationId && group.invitationContexts !== null ? (
                  <a href={`#invitations-${group.organizationId}`} className="tk-primary-action rounded-lg px-4 py-2 text-sm">Invite user</a>
                ) : <p className="text-xs text-slate-400">{!group.organizationId ? "Agency invitations are not supported yet." : !orgActive || !writable ? "Invitations require an active client and platform administrator." : "Invitation permission required."}</p>}
              {group.organizationId && orgActive ? (
                <ClientViewButton
                  organizationId={group.organizationId}
                  canEnter={session.effectivePermissions.includes(
                    "admin.impersonate",
                  )}
                />
              ) : null}
              </div>
            </div>
            <nav aria-label={`${group.name} account sections`} className="flex flex-wrap gap-4 border-b border-white/10 pb-4 text-sm text-blue-300">
              <a href={`#users-${group.organizationId || accountId}`}>Users{group.memberships ? ` (${group.memberships.length})` : ""}</a>
              <a href={`#invitations-${group.organizationId || accountId}`}>Invitations{group.invitations ? ` (${group.invitations.length})` : ""}</a>
              {group.organizationId ? <><a href={`#workspaces-${group.organizationId}`}>Workspaces & offers</a><a href={`#connections-${group.organizationId}`}>Connections{group.connections ? ` (${group.connections.length})` : ""}</a></> : null}
            </nav>
            <div className="grid items-start gap-6 lg:grid-cols-2">
            <section id={`users-${group.organizationId || accountId}`} className="scroll-mt-24 rounded-xl border border-white/10 p-5">
              <h3 className="mb-1 text-lg font-semibold">Users</h3>
              <p className="mb-4 text-sm text-slate-400">Existing client memberships and roles.</p>
              {group.memberships === null ? (
                <p>Access required.</p>
              ) : group.memberships.length ? (
                group.memberships.map((row) => {
                  const user = row.tracekit_users as Row,
                    role = row.tracekit_roles as Row;
                  return (
                    <article
                      key={String(row.id)}
                      className="space-y-3 border-t border-white/10 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><p className="font-medium">{String(user?.display_name || "Unavailable user")}</p><p className="mt-1 break-all text-sm text-slate-400">{String(user?.primary_email || "")}</p></div>
                        <span className="rounded-full border border-white/15 px-2 py-1 text-xs">{String(row.status)}</span>
                      </div>
                      <p className="text-xs text-slate-400">{roles.find(candidate => candidate.role_key === role?.role_key)?.name || String(role?.role_key)}</p>
                      {writable && orgActive && row.status === "active" ? (
                        <div className="flex flex-wrap gap-4">
                          {session.effectivePermissions.includes(
                            "users.manage_permissions",
                          ) ? (
                            <AdminForm
                              action="role"
                              accountId={accountId}
                              organizationId={group.organizationId}
                              membershipId={String(row.id)}
                              roles={roles}
                              currentRole={String(role?.role_key)}
                            />
                          ) : null}
                          {session.effectivePermissions.includes(
                            "users.remove",
                          ) ? (
                            <AdminForm
                              action="remove"
                              accountId={accountId}
                              organizationId={group.organizationId}
                              membershipId={String(row.id)}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-slate-400">No memberships.</p>
              )}
            </section>
            <section id={`invitations-${group.organizationId || accountId}`} className="scroll-mt-24 rounded-xl border border-white/10 p-5">
              <h3 className="mb-1 text-lg font-semibold">Invitations</h3>
              <p className="mb-4 text-sm text-slate-400">Invite new users and review invitation history.</p>
              {writable && orgActive && group.organizationId && group.invitationContexts !== null ? (
                <InviteClientUser organizationId={group.organizationId} contexts={group.invitationContexts} />
              ) : null}
              {group.invitations === null ? (
                <p>Access required.</p>
              ) : !group.invitations.length ? <p className="text-sm text-slate-400">No invitations yet.</p> : (
                group.invitations.map((row) => (
                  <article
                    key={String(row.id)}
                    className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"
                  >
                    <p className="text-sm">
                      {String(row.intended_email)} ·{" "}
                      {String((row.tracekit_roles as Row)?.role_key)} ·{" "}
                      {row.status === "pending" &&
                      new Date(String(row.expires_at)).getTime() <= Date.now()
                        ? "expired"
                        : String(row.status)}{" "}
                      {row.status === "pending" ? ` · Expires ${new Date(String(row.expires_at)).toLocaleDateString()}` : ""}
                    </p>
                    {writable && orgActive && group.organizationId && group.invitationContexts !== null && row.status === "pending" && Date.parse(String(row.expires_at)) > Date.now() ? (
                      <PendingInvitationActions organizationId={group.organizationId} invitationId={String(row.id)} />
                    ) : null}
                  </article>
                ))
              )}
            </section>
            {group.organizationId ? (
              <>
                <section id={`workspaces-${group.organizationId}`} className="scroll-mt-24 rounded-xl border border-white/10 p-5">
                  <h3 className="mb-2 font-semibold">
                    Offer workspaces and offers
                  </h3>
                  {group.contexts === null ? (
                    <p>Access required.</p>
                  ) : (
                    <p className="text-sm text-slate-400">
                      {group.contexts
                        .map((row) => `${row.name} (${row.status})`)
                        .join(", ") || "No offer workspaces."}
                    </p>
                  )}
                  {group.offers ? (
                    <p className="mt-2 text-sm text-slate-400">
                      {group.offers
                        .map((row) => `${row.name} (${row.status})`)
                        .join(", ") || "No canonical offers."}
                    </p>
                  ) : null}
                </section>
                <section id={`connections-${group.organizationId}`} className="scroll-mt-24 rounded-xl border border-white/10 p-5">
                  <h3 className="mb-2 font-semibold">Connections</h3>
                  {group.connections === null ? (
                    <p>Access required.</p>
                  ) : group.connections.length ? (
                    group.connections.map((row) => (
                      <article key={String(row.id)} className="py-2 text-sm">
                        <p>
                          {String(row.display_name)} · {String(row.provider)} ·{" "}
                          {String(row.status)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Last success:{" "}
                          {row.last_success_at
                            ? new Date(
                                String(row.last_success_at),
                              ).toLocaleString()
                            : "Unverified"}
                          {row.last_error_code
                            ? ` · ${row.last_error_code}`
                            : ""}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No connections.</p>
                  )}
                </section>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Agency team access is account-scoped. Client connections remain
                owned by assigned advertiser organizations.
              </p>
            )}
            </div>
          </section>
        );
      })}
      {!detail.groups.length ? (
        <p className="text-sm text-amber-200">
          No client organizations are linked to this account.
        </p>
      ) : null}
    </div>
  );
}
