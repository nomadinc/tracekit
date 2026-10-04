import type { TraceKitMcpReadService } from "./read-service";
import type { TraceKitMcpActionService } from "./action-service";
import{assessIntelligenceAction,type IntelligenceRuntimeEnvironment}from"./production-v1-policy";

export const TRACEKIT_MCP_TOOLS = [
  {
    name:"tracekit.inspect_remediation_signals",title:"Inspect TraceKit remediation signals",description:"Read-only active-Organization view of normalized provider remediation signals. Reports whether any currently observed condition actually requires governed action; never prepares or executes remediation.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.inspect_everflow_sync_remediation",title:"Inspect Everflow sync remediation",description:"Read-only inspection of active-Organization Everflow connections for evidence-backed bounded manual-sync remediation eligibility. Does not start a sync.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.inspect_shopify_webhook_remediation",title:"Inspect Shopify ingestion webhook remediation",description:"Read-only inspection of the active Organization's exact approved Shopify ingestion webhook state. Reports required, present, missing, and duplicate TraceKit topics and whether bounded remediation is available. Does not mutate Shopify.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },
  {
    name:"tracekit.discover_provider_actions",title:"Discover governed provider actions",description:"Read-only discovery of explicitly registered provider actions that are currently available for the active Organization. Availability requires matching governance contracts, action permission, and an exact server-resolved provider target; discovery never prepares, confirms, or executes an action.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name: "tracekit.list_customers",
    title: "List TraceKit customers",
    description: "List customers visible in the authenticated TraceKit Organization. Sensitive fields are permission-projected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.get_customer",
    title: "Get TraceKit customer",
    description: "Get one authorized customer workspace with retained journey, order, offer, and tracking evidence.",
    inputSchema: {
      type: "object",
      properties: { customer_id: { type: "string", minLength: 1, maxLength: 512 } },
      required: ["customer_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.explain_journey",
    title: "Explain TraceKit journey",
    description: "Return the authorized canonical Journey as structured chronology, attribution evidence, commerce relationships, provenance, and explicit evidence limits. Conclusions remain evidence-backed.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", minLength: 1, maxLength: 512 },
        journey_id: { type: "string", minLength: 1, maxLength: 512 },
      },
      required: ["customer_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name:"tracekit.inspect_action_eligibility",title:"Inspect TraceKit action eligibility",description:"Read-only inspection of governed action-plan eligibility gates. Shows what blocks future execution without granting permission, confirming, enabling execution, or mutating anything.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512}},required:["customer_id"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.plan_actions",title:"Plan TraceKit actions",description:"Convert evidence-backed advisory recommendations into non-mutating governed action plans with eligibility state, target, permission, confirmation, prerequisites, expected postconditions, verification, rollback applicability, audit requirements, and evidence.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512}},required:["customer_id"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.recommend_actions",title:"Recommend TraceKit actions",description:"Return bounded advisory next steps derived from one authorized Journey investigation. Recommendations expose evidence, prerequisites, success evidence, affected boundaries, and uncertainty; they do not execute repairs.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512}},required:["customer_id"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.accept_evidence_limit",title:"Accept TraceKit evidence limit",description:"Durably acknowledge one currently observed retained-evidence limitation for an exact customer Journey. This does not resolve, delete, or rewrite evidence; it permits dependent non-mutating diagnostic planning to proceed to human confirmation.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512},evidence_limit:{type:"string",minLength:1,maxLength:1000}},required:["customer_id","journey_id","evidence_limit"],additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.investigate_deviation",title:"Investigate TraceKit deviation",description:"Revalidate one observed cross-Journey deviation and return bounded Journey-level tracking investigations for its supporting evidence cohort.",
    inputSchema:{type:"object",properties:{dimension:{type:"string",enum:["affiliate","offer","source_platform","connector"]},value:{type:"string",minLength:1,maxLength:512},metric:{type:"string",enum:["attribution_established","commerce_linked","deterministic_identity_bridge","evidence_limited"]},customer_limit:{type:"integer",minimum:1,maximum:50,default:25},journey_limit:{type:"integer",minimum:1,maximum:100,default:50}},required:["dimension","value","metric"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.investigate_tracking",title:"Investigate TraceKit tracking",description:"Investigate one authorized Journey using retained evidence. Returns observed conditions, present and missing evidence, source/connector boundaries, and deterministic inspection targets without asserting unsupported root cause.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512}},required:["customer_id"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name: "tracekit.analyze_journeys",
    title: "Analyze TraceKit journeys",
    description: "Aggregate bounded, authorized Journey evidence across customers. Returns denominated conclusion coverage, retained source/connector/affiliate/offer breakdowns, evidence limits, and bounded supporting samples without causal or quality scoring.",
    inputSchema: {type:"object",properties:{customer_limit:{type:"integer",minimum:1,maximum:50,default:25},journey_limit:{type:"integer",minimum:1,maximum:100,default:50},customer_cursor:{type:"string",minLength:1,maxLength:2048}},additionalProperties:false},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.list_orders",
    title: "List TraceKit orders",
    description: "List orders visible in the authenticated TraceKit Organization. Financial and customer-sensitive fields are permission-projected.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        customer_id: { type: "string", maxLength: 512 },
        offer_id: { type: "string", maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.get_order",
    title: "Get TraceKit order",
    description: "Get one authorized order workspace with available attribution, evidence, relationships, and permission-projected financial detail.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", minLength: 1, maxLength: 512 } },
      required: ["order_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "tracekit.search",
    title: "Search TraceKit",
    description: "Search authorized customer and order read models. Inaccessible entity classes are omitted.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 12 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name:"tracekit.inspect_commas_test_delivery_readiness",title:"Inspect Commas test-delivery readiness",description:"Read-only diagnostic for the active Organization's bounded Commas test-delivery prerequisites. Reports only safe boundary states and counts; it does not expose credentials or subscription payloads, create an intent, confirm an action, or send a provider request.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name:"tracekit.inspect_shopify_controlled_proof_readiness",title:"Inspect Shopify controlled proof readiness",description:"Read-only readiness inspection for the exact Stem Labs Shopify controlled create/read-back/delete/absence proof. Does not mutate Shopify.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},
  },
  {
    name:"tracekit.execute_shopify_controlled_proof",title:"Execute controlled Shopify reversible proof",description:"Execute the exact server-resolved, freshly confirmed Stem Labs Shopify proof. Creates one disposable APP_UNINSTALLED webhook, verifies it, deletes that exact webhook, verifies absence, and retains durable recovery evidence.",inputSchema:{type:"object",properties:{confirmation_id:{type:"string",minLength:1,maxLength:512},requested_at:{type:"string",minLength:1,maxLength:128},consumption_id:{type:"string",minLength:1,maxLength:512},idempotency_key:{type:"string",minLength:1,maxLength:512}},required:["confirmation_id","requested_at","consumption_id","idempotency_key"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true},
  },
  {
    name:"tracekit.prepare_shopify_controlled_proof",title:"Prepare controlled Shopify webhook proof",description:"Prepare an opaque, server-targeted reversible Shopify webhook proof intent. Does not mutate Shopify.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  },
  {
    name:"tracekit.confirm_shopify_controlled_proof",title:"Confirm controlled Shopify webhook proof",description:"Record fresh human confirmation for one opaque prepared Shopify proof intent. Does not mutate Shopify.",inputSchema:{type:"object",properties:{intent_id:{type:"string",minLength:1,maxLength:512}},required:["intent_id"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
  },
  {
    name:"tracekit.prepare_m12_acceptance_fixture",title:"Prepare M12 synthetic acceptance fixture",description:"Staging-only acceptance tool. Runs a clearly synthetic Journey through the unchanged recommendation and governed-plan pipeline, then persists the resulting inspect_evidence plan as an opaque intent. Unavailable without the server-only M12 proof flag.",
    inputSchema:{type:"object",properties:{},additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
  },
  {
    name:"tracekit.prepare_inspect_evidence",title:"Prepare bounded TraceKit evidence inspection",description:"Persist one current server-generated inspect_evidence plan as an opaque, expiring action intent. This does not confirm or execute the action.",
    inputSchema:{type:"object",properties:{customer_id:{type:"string",minLength:1,maxLength:512},journey_id:{type:"string",minLength:1,maxLength:512},recommendation_id:{type:"string",minLength:1,maxLength:512}},required:["customer_id","recommendation_id"],additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
  },
  {
    name:"tracekit.confirm_inspect_evidence",title:"Confirm bounded TraceKit evidence inspection",description:"Record fresh human confirmation for one opaque prepared inspect_evidence intent. This does not execute the action.",
    inputSchema:{type:"object",properties:{intent_id:{type:"string",minLength:1,maxLength:512}},required:["intent_id"],additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
  },
  {
    name:"tracekit.execute_inspect_evidence",title:"Execute bounded TraceKit evidence inspection",description:"Execute only the named non-provider-mutating inspect_evidence capability after exact plan binding, actions.execute permission, fresh human confirmation, durable authorization, atomic consumption, verification, audit, and idempotent replay gates. Currently unavailable while registry execution exposure is disabled.",
    inputSchema:{type:"object",properties:{confirmation_id:{type:"string",minLength:1,maxLength:512},authorization_id:{type:"string",minLength:1,maxLength:512},requested_at:{type:"string",minLength:1,maxLength:64},consumption_id:{type:"string",minLength:1,maxLength:512},idempotency_key:{type:"string",minLength:1,maxLength:512},verification_evidence:{type:"array",maxItems:50}},required:["confirmation_id","requested_at","consumption_id","idempotency_key","verification_evidence"],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
] as const;

const SHOPIFY_CONTROLLED_PROOF_TOOLS=new Set([
  "tracekit.prepare_shopify_controlled_proof",
  "tracekit.confirm_shopify_controlled_proof",
  "tracekit.execute_shopify_controlled_proof",
]);
export function listTraceKitMcpTools(env:IntelligenceRuntimeEnvironment=process.env){
  const shopifyAllowed=assessIntelligenceAction("shopify.controlled_webhook_create_delete_proof",env).allowed;
  return TRACEKIT_MCP_TOOLS.filter(tool=>shopifyAllowed||!SHOPIFY_CONTROLLED_PROOF_TOOLS.has(tool.name));
}

export type TraceKitMcpToolName = (typeof TRACEKIT_MCP_TOOLS)[number]["name"];

function objectArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_arguments");
  return value as Record<string, unknown>;
}
function text(value: unknown, key: string, required = false) {
  const raw = value == null ? "" : String(value).trim();
  if (required && !raw) throw new Error("invalid_arguments");
  return raw || undefined;
}
function limit(value: unknown, max: number, fallback: number) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error("invalid_arguments");
  return n;
}
function assertKeys(args: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(args).some((key) => !allowed.includes(key))) throw new Error("invalid_arguments");
}

export async function callTraceKitMcpTool(
  service: TraceKitMcpReadService,
  name: string,
  rawArguments: unknown,
  actionService?: TraceKitMcpActionService,
) {
  const args = objectArgs(rawArguments ?? {});
  switch (name as TraceKitMcpToolName) {
    case "tracekit.discover_provider_actions": assertKeys(args,[]);return service.discoverProviderActions();
    case "tracekit.inspect_commas_test_delivery_readiness":
      assertKeys(args,[]);return service.inspectCommasTestDeliveryReadiness();
    case "tracekit.inspect_remediation_signals": assertKeys(args,[]);return service.inspectRemediationSignals();
    case "tracekit.inspect_everflow_sync_remediation": assertKeys(args,[]);return service.inspectEverflowSyncRemediation();
    case "tracekit.inspect_shopify_webhook_remediation": assertKeys(args,[]);return service.inspectShopifyWebhookRemediation();
    case "tracekit.inspect_shopify_controlled_proof_readiness":
      assertKeys(args,[]);return service.inspectShopifyControlledProofReadiness();
    case "tracekit.prepare_shopify_controlled_proof":
      assertKeys(args,[]);if(!actionService)throw new Error("action_service_unavailable");return actionService.prepareApprovedShopifyControlledProof();
    case "tracekit.confirm_shopify_controlled_proof":
      assertKeys(args,["intent_id"]);if(!actionService)throw new Error("action_service_unavailable");return actionService.confirmShopifyControlledProof(text(args.intent_id,"intent_id",true)!);
    case "tracekit.execute_shopify_controlled_proof":
      assertKeys(args,["confirmation_id","requested_at","consumption_id","idempotency_key"]);if(!actionService)throw new Error("action_service_unavailable");return actionService.executeShopifyControlledProof({confirmationId:text(args.confirmation_id,"confirmation_id",true)!,requestedAt:text(args.requested_at,"requested_at",true)!,consumptionId:text(args.consumption_id,"consumption_id",true)!,idempotencyKey:text(args.idempotency_key,"idempotency_key",true)!});
    case "tracekit.prepare_m12_acceptance_fixture": assertKeys(args,[]);if(!actionService)throw new Error("action_service_unavailable");return actionService.prepareSyntheticAcceptanceFixture();
    case "tracekit.prepare_inspect_evidence": {
      assertKeys(args,["customer_id","journey_id","recommendation_id"]);if(!actionService)throw new Error("action_service_unavailable");
      const customerId=text(args.customer_id,"customer_id",true)!,journeyId=text(args.journey_id,"journey_id"),recommendationId=text(args.recommendation_id,"recommendation_id",true)!,planning=await service.planActions(customerId,journeyId),plan=planning?.plans.find((p:any)=>p.recommendationId===recommendationId);
      if(!plan||plan.proposedOperation?.type!=="inspect_evidence")throw new Error("action_plan_unavailable");
      return actionService.prepareInspectEvidence(plan,`plan:${plan.recommendationId}:${customerId}:${journeyId||""}`);
    }
    case "tracekit.confirm_inspect_evidence":
      assertKeys(args,["intent_id"]);if(!actionService)throw new Error("action_service_unavailable");return actionService.confirmInspectEvidence(text(args.intent_id,"intent_id",true)!);
    case "tracekit.execute_inspect_evidence": {
      assertKeys(args,["confirmation_id","authorization_id","requested_at","consumption_id","idempotency_key","verification_evidence"]);
      if(!actionService)throw new Error("action_service_unavailable");
      return actionService.inspectEvidence({confirmationId:text(args.confirmation_id,"confirmation_id",true)!,authorizationId:text(args.authorization_id,"authorization_id"),requestedAt:text(args.requested_at,"requested_at",true)!,consumptionId:text(args.consumption_id,"consumption_id",true)!,idempotencyKey:text(args.idempotency_key,"idempotency_key",true)!,verificationEvidence:Array.isArray(args.verification_evidence)?args.verification_evidence as any:[]});
    }
    case "tracekit.list_customers":
      assertKeys(args, ["query", "limit"]);
      return service.listCustomers({ query: text(args.query, "query"), limit: limit(args.limit, 50, 25) });
    case "tracekit.get_customer":
      assertKeys(args, ["customer_id"]);
      return service.getCustomer(text(args.customer_id, "customer_id", true)!);
    case "tracekit.explain_journey":
      assertKeys(args, ["customer_id", "journey_id"]);
      return service.explainJourney(text(args.customer_id, "customer_id", true)!, text(args.journey_id, "journey_id"));
    case "tracekit.inspect_action_eligibility":
      assertKeys(args, ["customer_id","journey_id"]);
      return service.inspectActionEligibility(text(args.customer_id,"customer_id",true)!,text(args.journey_id,"journey_id"));
    case "tracekit.plan_actions":
      assertKeys(args, ["customer_id","journey_id"]);
      return service.planActions(text(args.customer_id,"customer_id",true)!,text(args.journey_id,"journey_id"));
    case "tracekit.recommend_actions":
      assertKeys(args, ["customer_id","journey_id"]);
      return service.recommendActions(text(args.customer_id,"customer_id",true)!,text(args.journey_id,"journey_id"));
    case "tracekit.accept_evidence_limit":
      assertKeys(args,["customer_id","journey_id","evidence_limit"]);
      return service.acceptEvidenceLimit(text(args.customer_id,"customer_id",true)!,text(args.journey_id,"journey_id",true)!,text(args.evidence_limit,"evidence_limit",true)!);
    case "tracekit.investigate_deviation":
      assertKeys(args, ["dimension","value","metric","customer_limit","journey_limit"]);
      return service.investigateDeviation({dimension:text(args.dimension,"dimension",true)! as "affiliate"|"offer"|"source_platform"|"connector",value:text(args.value,"value",true)!,metric:text(args.metric,"metric",true)! as "attribution_established"|"commerce_linked"|"deterministic_identity_bridge"|"evidence_limited",customerLimit:limit(args.customer_limit,50,25),journeyLimit:limit(args.journey_limit,100,50)});
    case "tracekit.investigate_tracking":
      assertKeys(args, ["customer_id","journey_id"]);
      return service.investigateTracking(text(args.customer_id,"customer_id",true)!,text(args.journey_id,"journey_id"));
    case "tracekit.analyze_journeys":
      assertKeys(args, ["customer_limit", "journey_limit","customer_cursor"]);
      return service.analyzeJourneys({customerLimit:limit(args.customer_limit,50,25),journeyLimit:limit(args.journey_limit,100,50),customerCursor:text(args.customer_cursor,"customer_cursor")});
    case "tracekit.list_orders":
      assertKeys(args, ["query", "customer_id", "offer_id", "limit"]);
      return service.listOrders({
        query: text(args.query, "query"),
        customerId: text(args.customer_id, "customer_id"),
        offerId: text(args.offer_id, "offer_id"),
        limit: limit(args.limit, 50, 25),
      });
    case "tracekit.get_order":
      assertKeys(args, ["order_id"]);
      return service.getOrder(text(args.order_id, "order_id", true)!);
    case "tracekit.search":
      assertKeys(args, ["query", "limit"]);
      return service.search(text(args.query, "query", true)!, { limit: limit(args.limit, 25, 12) });
    default:
      throw new Error("tool_not_found");
  }
}

export function mcpToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
    isError: false,
  };
}
