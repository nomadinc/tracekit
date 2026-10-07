"use client";
import Link from "next/link";
import { useState } from "react";
import type { Row } from "@/lib/platform/admin-repository";
function Search({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="mb-5 grid max-w-md gap-2 text-xs">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        type="search"
      />
    </label>
  );
}
export function ClientsList({
  accounts,
  organizations,
}: {
  accounts: Row[];
  organizations: Row[];
}) {
  const [query, setQuery] = useState("");
  const visible = accounts.filter((row) =>
    [
      row.name,
      ...organizations
        .filter((org) => org.owning_account_id === row.id)
        .map((org) => org.name),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <Search label="Search clients" value={query} onChange={setQuery} />
      <div className="divide-y divide-white/10">
        {visible.map((row) => (
          <Link
            key={String(row.id)}
            href={`/platform/clients/${row.id}`}
            className="flex flex-wrap justify-between gap-3 py-4 hover:text-blue-300"
          >
            <strong>{String(row.name)}</strong>
            <span className="text-sm">
              {row.account_type === "client" ? "Advertiser" : "Agency"} ·{" "}
              {String(row.status)}
            </span>
          </Link>
        ))}
      </div>
      {!visible.length ? (
        <p className="text-sm text-slate-400">No clients match this search.</p>
      ) : null}
    </>
  );
}
export function UsersList({
  users,
  memberships,
}: {
  users: Row[];
  memberships: Row[];
}) {
  const [query, setQuery] = useState("");
  const visible = users.filter((row) =>
    `${row.display_name} ${row.primary_email}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <Search
        label="Search users by name or email"
        value={query}
        onChange={setQuery}
      />
      <div className="divide-y divide-white/10">
        {visible.map((user) => (
          <article key={String(user.id)} className="py-4">
            <strong>{String(user.display_name)}</strong>
            <p className="mt-1 text-xs text-slate-400">
              {String(user.primary_email)} · {String(user.status)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {memberships
                .filter((membership) => membership.user_id === user.id)
                .map((membership) => {
                  const organization =
                      membership.tracekit_organizations as Row | null,
                    account = membership.tracekit_accounts as Row | null,
                    role = membership.tracekit_roles as Row | null;
                  const accountId =
                    organization?.owning_account_id || account?.id;
                  const text = `${organization?.name || account?.name || "Unresolved account"} · ${role?.role_key || "Unknown role"} · ${membership.status}`;
                  return accountId &&
                    !String(role?.role_key).startsWith("platform-") &&
                    organization ? (
                    <Link
                      key={String(membership.id)}
                      href={`/platform/clients/${accountId}`}
                      className="text-xs text-blue-300"
                    >
                      {text}
                    </Link>
                  ) : (
                    <span
                      key={String(membership.id)}
                      className="text-xs text-slate-300"
                    >
                      {text}
                      {accountId &&
                      account &&
                      ![
                        "platform-owner",
                        "platform-admin",
                        "support",
                        "billing",
                        "read-only-operations",
                      ].includes(String(role?.role_key)) ? (
                        <Link
                          href={`/platform/clients/${accountId}`}
                          className="ml-2 text-blue-300"
                        >
                          Open account
                        </Link>
                      ) : null}
                    </span>
                  );
                })}
            </div>
            {!memberships.some(
              (membership) => membership.user_id === user.id,
            ) ? (
              <p className="mt-2 text-xs text-amber-200">No memberships</p>
            ) : null}
          </article>
        ))}
      </div>
      {!visible.length ? (
        <p className="text-sm text-slate-400">No users match this search.</p>
      ) : null}
    </>
  );
}
export function ConnectionsList({
  connections,
  organizations,
}: {
  connections: Row[];
  organizations: Row[];
}) {
  const [query, setQuery] = useState("");
  const visible = connections.filter((row) =>
    `${row.display_name} ${row.provider} ${organizations.find((org) => org.id === row.organization_id)?.name || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <Search
        label="Search connections by client or provider"
        value={query}
        onChange={setQuery}
      />
      <div className="divide-y divide-white/10">
        {visible.map((row) => {
          const organization = organizations.find(
            (org) => org.id === row.organization_id,
          );
          return (
            <article key={String(row.id)} className="py-4">
              <strong>
                {String(row.display_name)} · {String(row.provider)}
              </strong>
              <p className="mt-1 text-xs text-slate-400">
                {String(row.status)} · Last success:{" "}
                {row.last_success_at
                  ? new Date(String(row.last_success_at)).toLocaleString()
                  : "Unverified"}
              </p>
              {row.last_error_code ? (
                <p className="mt-1 text-xs text-amber-200">
                  {String(row.last_error_code)}
                </p>
              ) : null}
              {organization ? (
                <Link
                  href={`/platform/clients/${organization.owning_account_id}`}
                  className="mt-2 inline-block text-xs text-blue-300"
                >
                  {String(organization.name)} → Client detail
                </Link>
              ) : (
                <p className="text-xs text-slate-400">Client unavailable</p>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length ? (
        <p className="text-sm text-slate-400">
          No connections match this search.
        </p>
      ) : null}
    </>
  );
}
