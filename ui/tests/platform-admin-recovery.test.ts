import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { shouldBlockLegacyRealDataProxy } from "../lib/identity/route-security";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type Role,
} from "../lib/identity/permissions";
import type { TraceKitSessionContext } from "../lib/identity/persistent-types";
import {
  platformMembershipWindowIsActive,
  requirePlatformAdmin,
  canReadPlatformCatalog,
  requireSameOrigin,
  validateClientInput,
} from "../lib/platform/admin-policy";

function session(role: Role): TraceKitSessionContext {
  const platform = ["platform-owner", "platform-admin", "support"].includes(
    role,
  );
  return {
    user: {
      id: "user",
      workosUserId: "workos",
      primaryEmail: "user@example.test",
      displayName: "User",
      avatarUrl: null,
      status: "active",
    },
    externalWorkosUserId: "workos",
    activeAccount: {
      id: "account",
      accountType: platform ? "platform" : "client",
      name: "Account",
      status: "active",
    },
    activeAgency: null,
    activeOrganization: null,
    availableOrganizations: [],
    membership: {
      id: "membership",
      userId: "user",
      accountId: platform ? "account" : null,
      organizationId: platform ? null : "organization",
      role,
      status: "active",
    },
    role,
    effectivePermissions: [...ROLE_PERMISSIONS[role]],
    permissionOverrides: [],
    accessibleBusinessContexts: [],
    activeBusinessContextId: null,
    assurance: { authenticationMethod: null, impersonated: false },
    correlationId: "test",
  };
}
test("advertiser and agency users cannot read platform catalog even with injected admin grants", () => {
  for (const role of [
    "organization-owner",
    "organization-admin",
    "agency-owner",
    "client-read-only",
  ] as Role[]) {
    const value = session(role);
    value.effectivePermissions = [...PERMISSIONS];
    assert.equal(canReadPlatformCatalog(value), false);
    assert.throws(() => requirePlatformAdmin(value, "users.view"));
  }
});
test("platform support can inspect but cannot provision or invite", () => {
  const value = session("support");
  assert.equal(canReadPlatformCatalog(value), true);
  assert.throws(() => requirePlatformAdmin(value, "organizations.manage"));
  assert.throws(() => requirePlatformAdmin(value, "users.invite"));
});
test("suspended membership and explicit permission denial fail closed", () => {
  const value = session("platform-owner");
  value.membership.status = "suspended";
  assert.equal(canReadPlatformCatalog(value), false);
  value.membership.status = "active";
  value.effectivePermissions = value.effectivePermissions.filter(
    (p) => p !== "admin.manage_tenants",
  );
  assert.equal(canReadPlatformCatalog(value), false);
});
test("privileged mutations require same origin", () => {
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request("https://app.test/api/platform/admin", {
        headers: { origin: "https://app.test" },
      }),
    ),
  );
  assert.throws(() =>
    requireSameOrigin(
      new Request("https://app.test/api/platform/admin", {
        headers: { origin: "https://evil.test" },
      }),
    ),
  );
  assert.throws(() =>
    requireSameOrigin(new Request("https://app.test/api/platform/admin")),
  );
});
test("client provisioning cannot create platform accounts", () => {
  assert.deepEqual(
    validateClientInput({ name: " Stem Labs ", accountType: "client" }),
    { name: "Stem Labs", accountType: "client" },
  );
  assert.throws(() =>
    validateClientInput({ name: "Fake platform", accountType: "platform" }),
  );
});
test("only the governed admin endpoint bypasses the legacy real-data proxy block", () => {
  assert.equal(shouldBlockLegacyRealDataProxy("/api/platform/admin", true), false);
  assert.equal(shouldBlockLegacyRealDataProxy("/api/platform/admin/other", true), true);
  assert.equal(shouldBlockLegacyRealDataProxy("/api/orders", true), true);
});
test("canonical provisioning transactions and tenant-safe membership administration", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls;",
    );
    // Use the real tenancy migration. UUID generation is built into this Postgres;
    // the extension-only declaration is unnecessary in the WASM test runtime.
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/038_persistent_identity_and_tenancy.sql",
          import.meta.url,
        ),
        "utf8",
      ).replace("create extension if not exists pgcrypto;", ""),
    );
    const commerce = readFileSync(
      new URL(
        "../../supabase/migrations/039_commerce_persistence_v1.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      "create function public.financial_reconciliation_metadata_is_safe(jsonb) returns boolean language sql as $$select true$$;",
    );
    await db.exec(
      commerce.slice(
        commerce.indexOf(
          "create unique index if not exists tracekit_organizations_account_id_uidx",
        ),
        commerce.indexOf(
          "create unique index tracekit_business_contexts_org_id_uidx",
        ),
      ),
    );
    await db.exec(
      "grant select,insert,update on public.tracekit_business_contexts to service_role;",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261007055158_ws021_platform_admin_provisioning.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const actor = randomUUID(),
      clientUser = randomUUID(),
      otherUser = randomUUID(),
      platform = randomUUID();
    await db.query(
      "insert into tracekit_users(id,workos_user_id,primary_email,display_name) values($1,'operator','operator@example.test','Operator'),($2,'customer','customer@example.test','Customer'),($3,'other','other@example.test','Other')",
      [actor, clientUser, otherUser],
    );
    await db.query(
      "insert into tracekit_accounts(id,account_type,name) values($1,'platform','TraceKit')",
      [platform],
    );
    await db.query(
      "insert into tracekit_memberships(user_id,account_id,role_id) select $1,$2,id from tracekit_roles where role_key='platform-owner'",
      [actor, platform],
    );
    const scalar = async (sql: string, args: unknown[]) => {
      const result = await db.query<{ value: string }>(sql, args);
      return result.rows[0].value;
    };
    const create = async (name: string, type = "client") =>
      scalar(
        "select ws021_create_client($1,'operator',$2,$3,'test') as value",
        [actor, name, type],
      );
    const account = await create("Stem Labs"),
      foreignAccount = await create("Other advertiser"),
      agency = await create("Agency", "agency");
    const org = await scalar(
      "select id as value from tracekit_organizations where owning_account_id=$1",
      [account],
    );
    const foreignOrg = await scalar(
      "select id as value from tracekit_organizations where owning_account_id=$1",
      [foreignAccount],
    );
    await db.query(
      "insert into tracekit_business_contexts(id,account_id,organization_id,name) values('stem-context',$1,$2,'Stem Labs')",
      [account, org],
    );
    await t.test(
      "advertiser creates account plus organization; agency creates account plus agency",
      async () => {
        assert.equal(
          (
            await db.query(
              "select id from tracekit_agencies where account_id=$1",
              [agency],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select id from tracekit_organizations where owning_account_id=$1",
              [agency],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "authenticated browser role cannot execute server provisioning RPC",
      async () => {
        await db.exec("set role authenticated");
        try {
          await assert.rejects(create("Forbidden"), /permission denied/);
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.test("service role can execute with authorized actor", async () => {
      await db.exec("set role service_role");
      try {
        await create("Service provisioned");
      } finally {
        await db.exec("reset role");
      }
    });
    await t.test("normal customer actor cannot create clients", async () => {
      await assert.rejects(
        db.query(
          "select ws021_create_client($1,'customer','Forbidden','client','test')",
          [clientUser],
        ),
        /Resource unavailable/,
      );
    });
    await t.test(
      "invalid account type and actor identity cannot provision",
      async () => {
        await assert.rejects(
          create("Privilege escalation", "platform"),
          /Invalid client/,
        );
        await assert.rejects(
          db.query(
            "select ws021_create_client($1,'other','Forbidden','client','test')",
            [actor],
          ),
          /Resource unavailable/,
        );
      },
    );
    const member = await scalar("insert into tracekit_memberships(user_id,organization_id,role_id) select $1,$2,id from tracekit_roles where role_key='client-read-only' returning id as value", [clientUser,org]);
    const change = (targetOrg: string, role: string, remove = false) =>
      db.query(
        "select ws021_change_membership($1,'operator',$2,$3,$4,$5,$6,'test')",
        [actor, account, targetOrg, member, role, remove],
      );
    await t.test(
      "membership change rejects foreign tenant and platform role",
      async () => {
        await assert.rejects(
          change(foreignOrg, "organization-admin"),
          /Resource unavailable/,
        );
        await assert.rejects(change(org, "platform-owner"), /Invalid role/);
      },
    );
    await change(org, "organization-owner");
    await t.test("final owner cannot be removed or demoted", async () => {
      await assert.rejects(change(org, "client-read-only"), /final owner/);
      await assert.rejects(change(org, "", true), /final owner/);
    });
    await t.test("explicit permission denial fails in database", async () => {
      await db.query(
        "insert into tracekit_permission_overrides(membership_id,capability,effect,reason) select id,'organizations.manage','deny','test' from tracekit_memberships where user_id=$1 and account_id=$2",
        [actor, platform],
      );
      await assert.rejects(create("Denied"), /Resource unavailable/);
      await db.query(
        "delete from tracekit_permission_overrides where reason='test'",
      );
    });
    await t.test(
      "audit failure rolls back account and organization creation",
      async () => {
        await db.exec(
          "create function reject_test_audit() returns trigger language plpgsql as $$begin raise exception 'Audit unavailable'; end$$; create trigger reject_test_audit before insert on tracekit_audit_events for each row execute function reject_test_audit();",
        );
        await assert.rejects(create("Must roll back"), /Audit unavailable/);
        assert.equal(
          (
            await db.query(
              "select id from tracekit_accounts where name='Must roll back'",
            )
          ).rows.length,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("canonical platform membership periods reject expired, future and malformed dates", () => {
 const now=Date.now(), past=new Date(now-1000).toISOString(),future=new Date(now+60000).toISOString();
 assert.equal(platformMembershipWindowIsActive({effective_from:past,effective_until:null},now),true);
 assert.equal(platformMembershipWindowIsActive({effective_from:past,effective_until:past},now),false);
 assert.equal(platformMembershipWindowIsActive({effective_from:future,effective_until:null},now),false);
 assert.equal(platformMembershipWindowIsActive({effective_from:"invalid",effective_until:null},now),false);
});
