import assert from "node:assert/strict";
import test from "node:test";
import { auditNmiScope, buildNmiRefundDryRun } from "./nmi-refund-dry-run.ts";
import { failedRefundFixture, partialRefundFixture } from "./nmi-refunds.fixtures.ts";

test("scope audit requires a consistent exact four-dimension join", () => {
  const resolved = auditNmiScope({
    platform: "nmi:test",
    platformOrderScopes: [{ accountId: "account-1", organizationId: "org-1", connectionId: "connection-1", providerAccountId: "provider-1" }],
    exactConnections: [{ id: "connection-1", accountId: "account-1", organizationId: "org-1" }],
    exactProviderAccounts: [{ id: "provider-1", connectionId: "connection-1", organizationId: "org-1" }],
  });
  assert.equal(resolved.classification, "SCOPE_RESOLVED");

  const missing = auditNmiScope({ platform: "nmi:legacy", platformOrderScopes: [{ accountId: null, organizationId: null, connectionId: null, providerAccountId: null }], exactConnections: [], exactProviderAccounts: [] });
  assert.equal(missing.classification, "SCOPE_MISSING");

  const pendingOnboarding = auditNmiScope({ platform: "nmi:approved-client", clientTenantOnboardingPending: true, platformOrderScopes: [{ accountId: null, organizationId: null, connectionId: null, providerAccountId: null }], exactConnections: [], exactProviderAccounts: [] });
  assert.equal(pendingOnboarding.classification, "BLOCKED_PENDING_CLIENT_TENANT_ONBOARDING");
  assert.deepEqual(pendingOnboarding.evidence.slice(-2), ["operator_approved_exact_platform_assignment", "client_tenant_not_onboarded"]);

  const ambiguous = auditNmiScope({ platform: "nmi:ambiguous", platformOrderScopes: [{ accountId: "a", organizationId: null, connectionId: null, providerAccountId: null }, { accountId: "b", organizationId: null, connectionId: null, providerAccountId: null }], exactConnections: [], exactProviderAccounts: [] });
  assert.equal(ambiguous.classification, "SCOPE_AMBIGUOUS");
});

test("dry-run is deterministic, read-only, parent-aware, and scope-gated", async () => {
  const rows = [
    { platform: "nmi:test", platformOrderId: "nmi:test:sale-1", transactionId: "sale-1", orderId: "sale-1", canonicalOrderId: "canonical-1", transactionXml: "<transaction><transaction_id>sale-1</transaction_id><condition>complete</condition><currency>USD</currency><actions><action><action_type>sale</action_type></action></actions></transaction>" },
    { platform: "nmi:test", platformOrderId: "nmi:test:refund-partial-001", transactionId: "refund-partial-001", orderId: "refund-partial-001", canonicalOrderId: null, transactionXml: partialRefundFixture({ originalTransactionId: "sale-1" }) },
    { platform: "nmi:test", platformOrderId: "nmi:test:refund-failed-001", transactionId: "refund-failed-001", orderId: "refund-failed-001", canonicalOrderId: null, transactionXml: failedRefundFixture({ originalTransactionId: "absent-sale" }) },
  ];
  const scope = { classification: "SCOPE_RESOLVED" as const, accountId: "account-1", organizationId: "org-1", connectionId: "connection-1", providerAccountId: "provider-1", evidence: ["test"] };
  const first = await buildNmiRefundDryRun({ rows, scopes: { "nmi:test": scope } });
  const second = await buildNmiRefundDryRun({ rows: [...rows].reverse(), scopes: { "nmi:test": scope } });
  assert.equal(first.manifestHash, second.manifestHash);
  assert.equal(first.counts.records_scanned, 2);
  assert.equal(first.counts.succeeded, 1);
  assert.equal(first.counts.failed, 1);
  assert.equal(first.counts.parent_resolved, 1);
  assert.equal(first.counts.parent_unresolved, 1);
  assert.equal(first.counts.economic_inserts_proposed, 1);
  assert.equal(first.counts.evidence_only_proposed, 1);
  assert.equal(first.manifest.items[0].canonical_parent_order_id, null);
  assert.equal(first.manifest.items[1].canonical_parent_order_id, "canonical-1");
});

test("missing scope blocks otherwise valid future actions without creating writes", async () => {
  const report = await buildNmiRefundDryRun({
    rows: [{ platform: "nmi:legacy", platformOrderId: "nmi:legacy:refund-partial-001", transactionId: "refund-partial-001", orderId: null, canonicalOrderId: null, transactionXml: partialRefundFixture() }],
    scopes: { "nmi:legacy": { classification: "SCOPE_MISSING", accountId: null, organizationId: null, connectionId: null, providerAccountId: null, evidence: ["none"] } },
  });
  assert.equal(report.manifest.items[0].proposed_future_action, "BLOCKED_SCOPE");
  assert.equal(report.counts.blocked_by_scope, 1);
  assert.equal(report.counts.economic_inserts_proposed, 0);
});

test("approved client ownership remains blocked until its tenant is onboarded", async () => {
  const report = await buildNmiRefundDryRun({
    rows: [{ platform: "nmi:approved-client", platformOrderId: "nmi:approved-client:refund-partial-001", transactionId: "refund-partial-001", orderId: null, canonicalOrderId: null, transactionXml: partialRefundFixture() }],
    scopes: { "nmi:approved-client": { classification: "BLOCKED_PENDING_CLIENT_TENANT_ONBOARDING", accountId: null, organizationId: null, connectionId: null, providerAccountId: null, evidence: ["operator_approved_exact_platform_assignment", "client_tenant_not_onboarded"] } },
  });
  assert.equal(report.manifest.items[0].scope_classification, "BLOCKED_PENDING_CLIENT_TENANT_ONBOARDING");
  assert.equal(report.manifest.items[0].proposed_future_action, "BLOCKED_SCOPE");
  assert.equal(report.counts.blocked_pending_client_tenant_onboarding, 1);
  assert.equal(report.counts.blocked_by_scope, 1);
  assert.equal(report.counts.economic_inserts_proposed, 0);
});
