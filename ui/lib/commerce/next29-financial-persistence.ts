import { createHash } from "node:crypto";
import { expandNext29Order, type Next29CanonicalExpansion, type Next29CanonicalRefund } from "../../../api/src/connectors/next29/expansion.ts";
import { SupabaseCommerceEvidenceStore } from "./supabase-evidence-store-core";

type Row = Record<string, unknown>;
export type FinancialRequest = ((path: string, init?: RequestInit) => Promise<Row[]>) & {
  // Injectable read-only storage transport; production uses the existing authorized evidence store.
  readEvidence?: (input: {organizationId:string;storageReference:string}) => Promise<Uint8Array|null>;
};
export type Next29FinancialInput = {
  organizationId: string; connectionId: string; providerAccountId: string;
  canonicalOrderId: string; evidenceId: string; sourceMappingId: string;
  expansion: Next29CanonicalExpansion;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = () => new Error("29Next financial persistence: evidence, ownership or identity conflict.");
const eq = (key: string, value: unknown) => `${key}=eq.${encodeURIComponent(String(value))}`;
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
function opaque(v: unknown): asserts v is string { if (typeof v !== "string" || !v.trim() || v.length > 200 || /[\x00-\x1f]/.test(v)) throw failure(); }
function exactly(rows: Row[]) { if (rows.length !== 1) throw failure(); return rows[0]; }
function scope(input: Next29FinancialInput, accountId: string) {
  for (const value of [accountId,input.organizationId,input.connectionId,input.providerAccountId,input.canonicalOrderId,input.evidenceId,input.sourceMappingId]) if (!uuid.test(value)) throw failure();
  return { account_id: accountId, organization_id: input.organizationId, connection_id: input.connectionId, provider_account_id: input.providerAccountId };
}
function filters(fields: Row) { return Object.entries(fields).map(([k,v]) => v === null ? `${k}=is.null` : eq(k,v)).join("&"); }

async function lineage(request: FinancialRequest, input: Next29FinancialInput, accountId: string) {
  const identity = scope(input,accountId);
  const orderIdentity = {...identity,workspace_id:input.organizationId,canonical_order_id:input.canonicalOrderId,source_mapping_id:input.sourceMappingId,evidence_id:input.evidenceId};
  const order = exactly(await request(`platform_orders?${filters(orderIdentity)}&select=platform,platform_order_id,provider_order_id,order_id,account_id,organization_id,workspace_id,connection_id,provider_account_id,canonical_order_id,source_mapping_id,evidence_id&limit=2`));
  for (const [key,value] of Object.entries(orderIdentity)) if (order[key] !== value) throw failure();
  if (order.platform !== "next29") throw failure();
  opaque(order.platform_order_id); opaque(order.provider_order_id);
  const providerScope = {organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId};
  const mapping = exactly(await request(`commerce_source_mappings?${filters({...providerScope,id:input.sourceMappingId,canonical_object_id:input.canonicalOrderId,canonical_object_type:"order",source_object_type:"next29_order",source_object_id:order.provider_order_id})}&select=id,organization_id,connection_id,provider_account_id,canonical_object_id,canonical_object_type,source_object_type,source_object_id,payload_hash&limit=2`));
  const evidence = exactly(await request(`commerce_evidence_records?${filters({...providerScope,id:input.evidenceId,source_object_type:"next29_order",source_object_id:order.provider_order_id})}&deleted_at=is.null&select=id,organization_id,connection_id,provider_account_id,source_object_type,source_object_id,payload_hash,storage_reference,deleted_at&limit=2`));
  for (const row of [mapping,evidence]) for (const [key,value] of Object.entries(providerScope)) if (row[key] !== value) throw failure();
  if (mapping.id !== input.sourceMappingId || mapping.canonical_object_id !== input.canonicalOrderId || mapping.canonical_object_type !== "order" || mapping.source_object_type !== "next29_order" || evidence.id !== input.evidenceId || evidence.source_object_type !== "next29_order" || evidence.deleted_at || mapping.source_object_id !== order.provider_order_id || evidence.source_object_id !== order.provider_order_id || !/^[0-9a-f]{64}$/i.test(String(evidence.payload_hash)) || evidence.payload_hash !== mapping.payload_hash) throw failure();
  return {identity,order,evidence};
}

/** No merge-upsert: both unique indexes must agree on an already scoped identity.
 * A single insert race may be reconciled by an exact read; no blind retry occurs.
 */
async function persist(request: FinancialRequest, table: string, identity: Row, body: Row, validate: (row: Row) => void | Promise<void>, replay?: (row: Row) => {body:Row;guards:Row}|null) {
  const path = `${table}?${filters(identity)}`;
  const lookup = async () => {
    const rows = await request(`${path}&select=*&limit=2`);
    if (rows.length > 1) throw failure();
    if (rows[0]) await validate(rows[0]);
    return rows[0];
  };
  let existing = await lookup();
  if (!existing) {
    try {
      const inserted = exactly(await request(table,{method:"POST",body:JSON.stringify(body)}));
      await validate(inserted);
      return;
    } catch (error) {
      if (object(error).databaseCode !== "23505") throw error;
      existing = await lookup();
      if (!existing) throw failure(); // external-record collision, foreign scope, or legacy provenance
    }
  }
  const plan = replay ? replay(existing) : {body,guards:{}};
  if (plan === null) return; // immutable, already verified projection: no mutation is needed
  // platform_orders retains its legacy bigint PK; financial tables use UUIDs.
  if (typeof existing.id !== "string" && !(typeof existing.id === "number" && Number.isSafeInteger(existing.id) && existing.id > 0)) throw failure();
  opaque(String(existing.id));
  // Never update ownership/primary identity. Preserve historical scoped refund IDs.
  const {id: _newId,...update} = plan.body;
  const patchPath = `${path}&${eq("id",existing.id)}${Object.keys(plan.guards).length ? `&${filters(plan.guards)}` : ""}`;
  if (patchPath.length > 6000) throw failure(); // do not replace a bounded native CAS with an unguarded update
  const updated = exactly(await request(patchPath,{method:"PATCH",body:JSON.stringify(update)}));
  if (updated.id !== existing.id) throw failure();
  await validate(updated);
}

async function priorEvidence(request: FinancialRequest, input: Next29FinancialInput, order: Row, evidenceId: unknown) {
  if (!uuid.test(String(evidenceId))) throw failure();
  if (evidenceId === input.evidenceId) return; // already verified with the current mapping
  const key = {id:evidenceId,organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,source_object_type:"next29_order",source_object_id:order.provider_order_id};
  const row = exactly(await request(`commerce_evidence_records?${filters(key)}&deleted_at=is.null&select=id,organization_id,connection_id,provider_account_id,source_object_type,source_object_id,deleted_at,payload_hash,storage_reference&limit=2`));
  for (const [k,v] of Object.entries(key)) if (row[k] !== v) throw failure();
  if (row.deleted_at || !/^[0-9a-f]{64}$/i.test(String(row.payload_hash))) throw failure();
  return row;
}

// Decimal equality without rounding database NUMERIC strings through JavaScript Number.
function decimal(value: unknown): string|null {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && !Number.isFinite(value))) return null;
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!m) return null;
  let digits = (m[2]+(m[3]||"")).replace(/^0+/,"");
  if (!digits) return "0";
  let exponent = Number(m[4]||0)-(m[3]||"").length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent)>1000) return null;
  while (digits.endsWith("0")) { digits=digits.slice(0,-1); exponent++; }
  return `${m[1]==="-"?"-":""}${digits}e${exponent}`;
}
function time(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw failure();
  return new Date(value).toISOString();
}
function refundTuple(refund: Next29CanonicalRefund) {
  const amount=decimal(refund.amount);
  if (amount===null) throw failure();
  return JSON.stringify([amount,refund.currency,time(refund.occurredAt),Array.from(new Set(refund.transactionIds)).sort()]);
}
async function retainedRefund(request: FinancialRequest, input: Next29FinancialInput, order: Row, evidence: Row, refundId: string) {
  const reference = `commerce-evidence/${input.organizationId}/${input.connectionId}/${input.providerAccountId}/next29_order/${evidence.payload_hash}`;
  if (evidence.storage_reference !== reference) throw failure();
  const read = request.readEvidence ?? (args => new SupabaseCommerceEvidenceStore().getAuthorized(args));
  const bytes = await read({organizationId:input.organizationId,storageReference:reference});
  if (!bytes || bytes.byteLength>2_000_000 || createHash("sha256").update(bytes).digest("hex")!==evidence.payload_hash) throw failure();
  let envelope:Row;
  try { envelope=object(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))); } catch { throw failure(); }
  const payload=object(envelope.payload);
  if (envelope.provider!=="next29" || envelope.resource!=="order" || envelope.sourceObjectId!==order.provider_order_id || String(payload.number??"")!==order.provider_order_id) throw failure();
  const refunds=expandNext29Order(payload).refunds.filter(r=>r.providerRefundId===refundId);
  if (refunds.length!==1) throw failure();
  return refunds[0];
}

/** Protect the existing globally unique platform-order ID from cross-store reassignment. */
export async function persistNext29Order(request: FinancialRequest, body: Row) {
  const key = Object.fromEntries(["platform","platform_order_id","account_id","organization_id","workspace_id","connection_id","provider_account_id","canonical_order_id"].map(k => { opaque(body[k]); return [k,body[k]]; }));
  if (body.platform !== "next29" || body.workspace_id !== body.organization_id) throw failure();
  await persist(request,"platform_orders",key,body,row => {
    for (const [k,v] of Object.entries(key)) if (row[k] !== v) throw failure();
  });
}

export function next29RefundId(input: Pick<Next29FinancialInput,"organizationId"|"connectionId"|"providerAccountId">, providerRefundId: string) {
  const hash = createHash("sha256").update(JSON.stringify(["next29-refund-v1",input.organizationId,input.connectionId,input.providerAccountId,providerRefundId])).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-8${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

export async function persistNext29Refunds(request: FinancialRequest, accountId: string, input: Next29FinancialInput) {
  if (!input.expansion.refunds.length) return;
  const {identity,order,evidence} = await lineage(request,input,accountId);
  for (const refund of input.expansion.refunds) {
    opaque(refund.providerRefundId);
    if (!refund.occurredAt || !Number.isFinite(Date.parse(refund.occurredAt)) || refund.amount === null || !Number.isFinite(refund.amount) || !refund.currency || !/^[A-Z]{3}$/.test(refund.currency)) throw failure();
    for (const id of refund.transactionIds) opaque(id);
    const paymentIds = Array.from(new Set(refund.transactionIds));
    const authoritative = await retainedRefund(request,input,order,evidence,refund.providerRefundId);
    if (refundTuple(refund)!==refundTuple(authoritative)) throw failure();
    const key = {...identity,canonical_order_id:input.canonicalOrderId,provider_refund_id:refund.providerRefundId};
    const row = {...key,id:next29RefundId(input,refund.providerRefundId),evidence_id:input.evidenceId,source_mapping_id:input.sourceMappingId,provider_payment_id:paymentIds.length === 1 ? paymentIds[0] : null,amount:refund.amount,amount_gross:refund.amount,currency:refund.currency,occurred_at:refund.occurredAt};
    // The complete reference array remains in immutable source evidence; do not flatten it into a first-link guess.
    await persist(request,"commerce_refund_events",key,row,async existing => {
      if (!uuid.test(String(existing.id))) throw failure();
      for (const [k,v] of Object.entries({...key,source_mapping_id:input.sourceMappingId})) if (existing[k] !== v) throw failure();
      const previous = await priorEvidence(request,input,order,existing.evidence_id);
      const oldSource = previous ? await retainedRefund(request,input,order,previous,refund.providerRefundId) : authoritative;
      if (refundTuple(oldSource)!==refundTuple(authoritative) || decimal(existing.amount)!==decimal(authoritative.amount) || decimal(existing.amount_gross)!==decimal(authoritative.amount) || existing.currency!==authoritative.currency || time(existing.occurred_at)!==time(authoritative.occurredAt) || existing.provider_payment_id!==(paymentIds.length===1?paymentIds[0]:null)) throw failure();
      // No independent cross-version ordering rule exists here. Contradictions are not corrections.
    },()=>null);
  }
}

export async function persistNext29Payments(request: FinancialRequest, accountId: string, input: Next29FinancialInput) {
  if (!input.expansion.transactions.length) return;
  const {order} = await lineage(request,input,accountId);
  for (const tx of input.expansion.transactions) {
    // The normalized Next29 contract supplies no fee/net observations. A new financial
    // observation needs its own validated evidence/ordering contract, not an extra JS field.
    for (const key of ["fee_amount","net_amount","feeAmount","netAmount","financialEvidence","financial_completeness"]) if (Object.prototype.hasOwnProperty.call(tx,key)) throw failure();
    opaque(tx.providerTransactionId);
    const eventType = tx.type || "transaction"; opaque(eventType);
    const key = {platform:"next29",account_id:accountId,workspace_id:input.organizationId,transaction_id:tx.providerTransactionId,event_type:eventType};
    const provenance = {organization_id:input.organizationId,connection_id:input.connectionId,provider_account_id:input.providerAccountId,canonical_order_id:input.canonicalOrderId};
    const guards = {...key,external_record_id:tx.externalId,matched_platform_order_id:order.platform_order_id,...Object.fromEntries(Object.entries({...provenance,source_mapping_id:input.sourceMappingId}).map(([k,v]) => [`raw_json->>${k}`,v]))};
    const body = {...key,parent_transaction_id:tx.parentTransactionId,order_id:order.order_id ?? order.provider_order_id,status:tx.status,amount:tx.amount,currency:tx.currency,payment_method:tx.paymentMethod,processor:tx.gatewayName,transaction_ts:tx.occurredAt,external_record_id:tx.externalId,transaction_event_code:tx.type,transaction_updated_at:tx.occurredAt,matched_platform_order_id:order.platform_order_id,
      fee_amount:null,net_amount:null,
      raw_json:{provider:"next29",...provenance,evidence_id:input.evidenceId,source_mapping_id:input.sourceMappingId,financial_completeness:{fee:"unavailable",net:"unavailable"},network_transaction_id:tx.networkTransactionId,auth_code_present:Boolean(tx.authCode),is_disputed:tx.isDisputed,is_external:tx.isExternal,is_test:tx.isTest}};
    await persist(request,"payment_transactions",guards,body,async row => {
      if (!uuid.test(String(row.id))) throw failure();
      for (const [k,v] of Object.entries(key)) if (row[k] !== v) throw failure();
      const raw = object(row.raw_json);
      for (const [k,v] of Object.entries(provenance)) if (raw[k] !== v) throw failure();
      if (raw.source_mapping_id !== input.sourceMappingId || !uuid.test(String(raw.evidence_id))) throw failure();
      await priorEvidence(request,input,order,raw.evidence_id);
      if (row.external_record_id !== tx.externalId || row.matched_platform_order_id !== order.platform_order_id) throw failure();
    },existing => {
      if (tx.amount!==null && existing.amount!==null && decimal(tx.amount)!==decimal(existing.amount)) throw failure();
      if (tx.currency!==null && existing.currency!==null && tx.currency!==existing.currency) throw failure();
      // Defaults belong to INSERT only. Preserve fee/net and enriched JSON (including
      // its original financial provenance/completeness) verbatim on missing-evidence replay.
      const {fee_amount:_fee,net_amount:_net,raw_json:_raw,...update}=body;
      if (tx.amount===null) delete (update as Row).amount;
      if (tx.currency===null) delete (update as Row).currency;
      const guards:Row={};
      for (const field of ["amount","currency","fee_amount","net_amount","raw_json"]) {
        if (existing[field]===undefined) throw failure();
        guards[field]=field==="raw_json" && existing[field]!==null ? JSON.stringify(existing[field]) : existing[field];
      }
      return {body:update,guards};
    });
  }
}
