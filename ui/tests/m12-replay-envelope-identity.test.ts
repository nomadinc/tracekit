import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const repo=readFileSync(new URL("../lib/mcp/action-authorization-repository.ts",import.meta.url),"utf8"),orch=readFileSync(new URL("../lib/mcp/action-orchestration.ts",import.meta.url),"utf8");
test("M12 authorization persists exact envelope createdAt for deterministic replay identity",()=>{assert.ok(repo.includes("envelope_created_at:envelope.createdAt"));assert.ok(repo.includes("envelopeCreatedAt:r.envelope_created_at"));});
test("M12 replay reads authorization by id and org before rebuilding envelope",()=>{assert.ok(repo.includes("readMcpActionAuthorizationById"));const read=orch.indexOf("readMcpActionAuthorizationById"),created=orch.indexOf("envelopeCreatedAt=replayCandidate");const build=orch.indexOf("buildExecutionEnvelope");assert.ok(read>0&&created>read&&build>created);});
test("M12 consumed replay may outlive original confirmation freshness but must retain exact confirmation binding",()=>{assert.ok(orch.includes("confirmationMatches"));assert.ok(orch.includes("confirmationMatches&&(replayCandidate||confirmationFresh)"));});
test("M12 new execution still requires fresh confirmation",()=>{assert.ok(orch.includes('replayAuthorization?.state==="consumed"&&Boolean(replayAuthorization.envelopeCreatedAt)'));assert.ok(orch.includes("replayCandidate||confirmationFresh"));});

test("M12 legacy authorizations are not given fabricated envelope timestamps",()=>{assert.doesNotMatch(repo,/envelopeCreatedAt:r\.consumed_at/);});
