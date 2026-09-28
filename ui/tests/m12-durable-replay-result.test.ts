import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const repo=readFileSync(new URL("../lib/mcp/action-execution-result-repository.ts",import.meta.url),"utf8");
test("M12 execution result persistence is service-role and immutable-envelope scoped",()=>{assert.ok(repo.includes("SUPABASE_SERVICE_ROLE_KEY"));for(const token of["organization_id","envelope_identity","idempotency_key","audit_correlation_id","consumption_id"])assert.ok(repo.includes(token));});
test("M12 replay repository only reads exact envelope result",()=>{assert.ok(repo.includes("readMcpExecutionResult"));for(const token of["input.envelope.organizationId","input.envelope.envelopeIdentity","input.envelope.idempotencyKey","input.envelope.auditCorrelationId"])assert.ok(repo.includes(token));});
test("M12 result store has no provider mutation surface",()=>{assert.doesNotMatch(repo,/providerWrite|patchProvider|deleteProvider|admin_graphql/i);});
