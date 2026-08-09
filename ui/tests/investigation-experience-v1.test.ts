import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ACCUFY_PRESENTATION, ACCUFY_WARNINGS } from "../lib/investigations/accufy-reference";
import { assertClientSafePresentation } from "../lib/investigations/presentation";
import { investigationRunKey, type InvestigationRunRequest } from "../lib/investigations/runtime-contract";
import { authorizeInvestigationAccess } from "../lib/investigations/authorization";
import { buildEverflowV2EvidenceWindow, classifyOrderAttribution, coveragePercent } from "../lib/investigations/attribution-evidence-window";
import { OTO2_CHILD_INVESTIGATION_ID, OTO2_CHILD_PRESENTATION, OTO2_CHILD_WARNINGS, OTO2_PARENT_VERSION_ID } from "../lib/investigations/oto2-selective-reference";

const baseRun: InvestigationRunRequest={accountId:"account-a",organizationId:"org-a",investigationId:"investigation-a",requestedByUserId:"user-a",algorithmVersion:"v2",commerceVersion:"commerce-v1",journeyVersion:"everflow-v2",disputeVersion:"dispute-v1",reasonVersion:"reason-v1",cohortVersion:"cohort-v2",sourceSnapshot:{orders:74493},evidenceCutoffAt:"2026-08-08T00:00:00Z"};
const session=(role:"platform-admin"|"organization-admin",organizationId="org-a")=>({user:{id:"user-a",status:"active"},membership:{status:"active"},effectivePermissions:role==="platform-admin"?["admin.manage_feature_access"]:[],availableOrganizations:[{id:organizationId,accountId:"account-a",name:"A"}],assurance:{impersonated:false},correlationId:"correlation-a"}) as never;

test("Accufy presentation preserves approved findings and typed uncertainty",()=>{
  assert.match(ACCUFY_PRESENTATION.executiveFinding,/8\.28%/); assert.match(ACCUFY_PRESENTATION.executiveFinding,/9\.70%/); assert.match(ACCUFY_PRESENTATION.executiveFinding,/24\.73%/);
  assert.deepEqual(ACCUFY_PRESENTATION.multiCharge.map(item=>item.rate),["11.29%","17.43%","21.38%"]);
  assert.deepEqual(new Set(ACCUFY_PRESENTATION.findings.map(item=>item.kind)),new Set(["observation","correlation","negative_finding","hypothesis"]));
  assert.equal(ACCUFY_WARNINGS.length,6);
  assert.ok(ACCUFY_PRESENTATION.evidenceGaps.includes("24,390 all-time Orders outside the available Everflow attribution Evidence window"));
  assert.ok(ACCUFY_PRESENTATION.evidenceGaps.includes("9,875 eligible Orders without defensible acquisition attribution"));
});
test("Evidence-window eligibility uses calibrated timestamps and persisted rule tolerances",()=>{
  const window=buildEverflowV2EvidenceWindow("2026-04-01T07:06:16Z","2026-08-08T00:20:53Z");
  assert.equal(window.eligibleOrderStart,"2026-04-01T04:04:16.000Z");
  assert.equal(window.eligibleOrderEnd,"2026-08-07T21:30:53.000Z");
  assert.equal(classifyOrderAttribution({orderTimestamp:window.eligibleOrderStart,window,direct:true,propagated:false}),"attributed_direct");
  assert.equal(classifyOrderAttribution({orderTimestamp:window.eligibleOrderEnd,window,direct:false,propagated:true}),"attributed_propagated_within_journey");
  assert.equal(classifyOrderAttribution({orderTimestamp:"2026-04-01T04:04:15.999Z",window,direct:false,propagated:false}),"outside_attribution_evidence_window");
  assert.equal(classifyOrderAttribution({orderTimestamp:"2026-08-07T21:30:53.001Z",window,direct:false,propagated:false}),"outside_attribution_evidence_window");
  assert.equal(classifyOrderAttribution({orderTimestamp:"2026-06-01T00:00:00Z",window,direct:false,propagated:false}),"unattributed_eligible");
  assert.equal(classifyOrderAttribution({orderTimestamp:"2026-06-01T00:00:00Z",window,direct:false,propagated:false,needsReview:true}),"needs_review");
});
test("eligible attribution denominator excludes all-time Orders without source coverage",()=>{
  assert.equal(coveragePercent(40228,50103),"80.29%");
  assert.equal(coveragePercent(213,1727),"12.33%");
  const orderMetric=ACCUFY_PRESENTATION.evidenceQuality.find(item=>item.label==="Eligible Order attribution");
  assert.deepEqual(orderMetric,{label:"Eligible Order attribution",value:"80.29%",detail:"40,228 / 50,103 eligible Orders",warning:"9,875 eligible Orders remain unattributed"});
  const oto2Metric=ACCUFY_PRESENTATION.evidenceQuality.find(item=>item.label==="Eligible OTO2 attribution");
  assert.match(oto2Metric?.detail||"",/213 \/ 1,727/);
  assert.doesNotMatch(JSON.stringify(ACCUFY_PRESENTATION),/46% remains unattributed|213 \/ 2,968 OTO2 Orders have consensus affiliate attribution/);
});
test("Version 3 corrects methodology while Version 2 remains immutable",()=>{
  const materializer=readFileSync(new URL("../scripts/materialize-accufy-investigation.ts",import.meta.url),"utf8");
  assert.match(materializer,/version_number: 3/);
  assert.match(materializer,/accufy-evidence-window-audit-v3/);
  assert.doesNotMatch(materializer,/version_number: 2/);
  const migration=readFileSync(new URL("../../supabase/migrations/048_investigation_runtime_v1.sql",import.meta.url),"utf8");
  assert.match(migration,/Investigation versions are immutable/);
});
test("Journey rendering distinguishes observed, propagated, and missing evidence",()=>assert.deepEqual(new Set(ACCUFY_PRESENTATION.journey.map(step=>step.state)),new Set(["observed","propagated","missing"])));
test("Nandi comparison emphasizes control delta rather than an isolated characteristic",()=>{const incidence=ACCUFY_PRESENTATION.comparison.find(row=>row.metric==="Dispute incidence");assert.deepEqual(incidence,{metric:"Dispute incidence",subject:"8.28%",control:"9.70%",delta:"−1.42 pp",finding:"Nandi is not elevated versus comparable other Pear traffic."});});
test("client presentation excludes PII, raw Evidence, and storage fields",()=>{assert.doesNotThrow(()=>assertClientSafePresentation(ACCUFY_PRESENTATION));assert.throws(()=>assertClientSafePresentation({customer_email:"synthetic@example.invalid"}));const serialized=JSON.stringify(ACCUFY_PRESENTATION);assert.doesNotMatch(serialized,/customer_email|phone|storage_reference|ciphertext|api_key|raw_payload/i);});
test("Investigation authorization requires Product/Admin capability and Organization scope",()=>{assert.equal(authorizeInvestigationAccess(session("platform-admin"),"org-a").organizationId,"org-a");assert.throws(()=>authorizeInvestigationAccess(session("organization-admin"),"org-a"));assert.throws(()=>authorizeInvestigationAccess(session("platform-admin"),"org-b"));});
test("Investigation run identity is replay deterministic and version-sensitive",()=>{assert.equal(investigationRunKey(baseRun),investigationRunKey(baseRun));assert.notEqual(investigationRunKey(baseRun),investigationRunKey({...baseRun,algorithmVersion:"v3"}));});
test("navigation exposes canonical Investigation URL only when Product/Admin capability is effective",()=>{const policy=readFileSync(new URL("../lib/identity/navigation-policy.ts",import.meta.url),"utf8");assert.match(policy,/"product-admin"[\s\S]*Investigations[\s\S]*\/investigations/);const client=policy.slice(policy.indexOf("client:"),policy.indexOf("agency:"));assert.match(client,/Investigations[\s\S]*admin\.manage_feature_access/);assert.doesNotMatch(policy,/dev_identity/);});
test("server read model and runtime remain server-only",()=>{for(const name of ["server-repository.ts","runtime.ts"]){const source=readFileSync(new URL(`../lib/investigations/${name}`,import.meta.url),"utf8");assert.match(source,/import "server-only"/);}const component=readFileSync(new URL("../components/investigations/investigation-experience.tsx",import.meta.url),"utf8");assert.doesNotMatch(component,/commerce_evidence_records|everflow_conversion_events|service_role|SUPABASE/);});
test("Investigation UI contains no Phase 3 dispute operation",()=>{const source=readFileSync(new URL("../components/investigations/investigation-experience.tsx",import.meta.url),"utf8");assert.doesNotMatch(source,/representment|automatic refund|submit dispute|accept dispute|fight dispute/i);});
test("browser request queues only durable work and cannot supply tenant or algorithm scope",()=>{const route=readFileSync(new URL("../app/api/investigations/[...investigationPath]/route.ts",import.meta.url),"utf8");assert.match(route,/enqueueInvestigationRun/);assert.match(route,/sameOrigin/);assert.match(route,/authorizeInvestigationAccess/);assert.doesNotMatch(route,/body\.organizationId|body\.algorithmVersion|body\.sourceSnapshot/);});
test("expected Investigation denial renders a safe access-required state",()=>{const index=readFileSync(new URL("../app/(app)/investigations/page.tsx",import.meta.url),"utf8"),detail=readFileSync(new URL("../app/(app)/investigations/[investigationId]/page.tsx",import.meta.url),"utf8"),component=readFileSync(new URL("../components/investigations/investigation-experience.tsx",import.meta.url),"utf8");for(const source of[index,detail]){assert.match(source,/AuthorizationDeniedError/);assert.match(source,/InvestigationAccessRequired/);}assert.match(component,/Product\/Admin access required/);assert.doesNotMatch(component,/Organization's Investigation|resource exists/i);});
test("OTO2 child materialization preserves the reviewed branch result",()=>{
  assert.equal(OTO2_CHILD_INVESTIGATION_ID,"a2200e00-0000-4000-8000-000000000101");
  assert.equal(OTO2_PARENT_VERSION_ID,"a2200e00-0000-4000-8000-000000000005");
  assert.match(OTO2_CHILD_PRESENTATION.question,/Why do some Main \+ OTO2 buyers/);
  assert.match(OTO2_CHILD_PRESENTATION.executiveFinding,/affected population is small/);
  assert.deepEqual(OTO2_CHILD_PRESENTATION.outcome.statuses.map(item=>item.count),[12,156,40,2]);
  assert.match(OTO2_CHILD_PRESENTATION.findings.find(item=>item.id==="reason-mix")?.statement||"",/approximately p=0\.036/);
  assert.equal(OTO2_CHILD_WARNINGS.length,4);
});
test("child Evidence Quality is cohort-specific and preserves uncertainty",()=>{
  const serialized=JSON.stringify(OTO2_CHILD_PRESENTATION);
  for(const expected of ["210","12","156","40","2","12.33%","12 / 12"]){assert.match(serialized,new RegExp(expected.replace("/","\\/")));}
  assert.doesNotMatch(serialized,/94\.91%|94\.66%|80\.29%/);
  assert.match(serialized,/Small sample|Insufficient sample for inference/);
  assert.match(serialized,/Historical Evidence ceiling reached/);
});
test("child reuses typed findings without introducing causal claims",()=>{
  assert.deepEqual(new Set(OTO2_CHILD_PRESENTATION.findings.map(item=>item.kind)),new Set(["observation","correlation","negative_finding","hypothesis"]));
  assert.doesNotMatch(JSON.stringify(OTO2_CHILD_PRESENTATION),/root cause|\bproves\b|\bcaused\b/i);
  assert.doesNotThrow(()=>assertClientSafePresentation(OTO2_CHILD_PRESENTATION));
});
test("branch migration enforces same-tenant acyclic immutable provenance",()=>{
  const migration=readFileSync(new URL("../../supabase/migrations/049_investigation_branches_v1.sql",import.meta.url),"utf8");
  assert.match(migration,/foreign key \(organization_id, parent_investigation_id\)/i);
  assert.match(migration,/parent_investigation_version_id[\s\S]*tracekit_investigation_versions/i);
  assert.match(migration,/with recursive ancestors/i);
  assert.match(migration,/branch provenance is immutable/i);
  assert.match(migration,/on delete restrict/gi);
});
test("child runtime references exact parent Version 3 and remains idempotent",()=>{
  const materializer=readFileSync(new URL("../scripts/materialize-oto2-child-investigation.ts",import.meta.url),"utf8");
  assert.match(materializer,/OTO2_PARENT_VERSION_ID/);
  assert.match(materializer,/version_number:1/);
  assert.match(materializer,/completed_with_warnings/);
  assert.match(materializer,/investigation\.child_created/);
  assert.match(materializer,/const existing=/);
  assert.doesNotMatch(materializer,/update\([^)]*tracekit_investigation_versions/i);
});
test("Investigation UI exposes branch navigation without weakening authorization",()=>{
  const component=readFileSync(new URL("../components/investigations/investigation-experience.tsx",import.meta.url),"utf8");
  const repository=readFileSync(new URL("../lib/investigations/server-repository.ts",import.meta.url),"utf8");
  assert.match(component,/Deeper Investigations/);
  assert.match(component,/Version \{investigation\.parent\.version\}/);
  assert.match(component,/Child Investigation/);
  assert.match(repository,/organization_id=eq\.\$\{encodeURIComponent\(scope\.organizationId\)\}/);
  assert.match(repository,/parent_investigation_id=eq\.\$\{encodeURIComponent\(id\)\}/);
  assert.doesNotMatch(component,/commerce_evidence_records|storage_reference|customer_email|api_key/i);
});
