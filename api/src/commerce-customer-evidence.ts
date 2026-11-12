// Read-only commerce projection. Identity comes from an already authorized Order,
// never from an email, timestamp, amount, or an unqualified order number.
export const COMMERCE_ORDER_FIELDS = 'workspace_id,organization_id,account_id,connection_id,provider_account_id,business_context_id,canonical_order_id,platform,platform_order_id,order_id,order_ts,status,status_norm,gross_amount,product_subtotal,tax_amount,shipping_amount,currency,evidence_id,payment_reference,transaction_id,everflow_transaction_id,tkid,resolved_person_id,identity_resolution';
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
const number = (v: unknown) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
export function commercialTotals(orders: any[]) {
  const unique = new Map<string, any>();
  for (const order of orders) {
    const key = order.canonical_order_id || [order.platform, order.connection_id, order.provider_account_id, order.platform_order_id].join(':');
    const previous = unique.get(key);
    if (previous && (number(previous.gross_amount) !== number(order.gross_amount) || previous.currency !== order.currency)) return { amount: null, currency: null, count: unique.size };
    unique.set(key, order);
  }
  const rows = [...unique.values()];
  const currencies = new Set(rows.map(o => text(o.currency)));
  const available = rows.length > 0 && currencies.size === 1 && !currencies.has(null) && rows.every(o => number(o.gross_amount) !== null);
  return { amount: available ? rows.reduce((sum, o) => sum + Math.round(number(o.gross_amount)! * 100), 0) / 100 : null, currency: available ? rows[0].currency : null, count: rows.length };
}
export function scopedOrder(order: any, organization: string, context?: string | null) {
  // Unassigned commerce remains visible inside its authorized organization;
  // an attribution context is never invented for it.
  return order.workspace_id === organization && order.organization_id === organization
    && (!context || !order.business_context_id || order.business_context_id === context);
}
export async function orderEvidence(db: any, organization: string, order: any) {
  if (!scopedOrder(order, organization) || !order.canonical_order_id || !order.connection_id || !order.provider_account_id) return { lines: [], journey_id: null };
  const scope = (query: any) => query.eq('organization_id', organization).eq('canonical_order_id', order.canonical_order_id).eq('connection_id', order.connection_id).eq('provider_account_id', order.provider_account_id);
  const [lineResult, eventResult] = await Promise.all([
    scope(db.from('commerce_order_lines').select('id,organization_id,canonical_order_id,connection_id,provider_account_id,quantity,unit_amount,gross_amount,currency,evidence_id,metadata')).order('id').limit(501),
    order.resolved_person_id ? db.from('journey_events').select('id,journey_id,source_record_id,platform_order_id,person_id,workspace_id').eq('workspace_id', organization).eq('person_id', order.resolved_person_id).eq('source_record_id', order.canonical_order_id).eq('platform_order_id', order.platform_order_id).eq('event_type', 'purchase').limit(101) : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineResult.error || eventResult.error || lineResult.data?.length > 500 || eventResult.data?.length > 100) throw new Error('Commerce evidence is unavailable.');
  const lines = (lineResult.data || []).filter((line: any) => line.organization_id === organization && line.canonical_order_id === order.canonical_order_id && line.connection_id === order.connection_id && line.provider_account_id === order.provider_account_id).map((line: any) => ({
    id: line.id, organization_id: organization, canonical_order_id: order.canonical_order_id,
    quantity: number(line.quantity), unit_amount: number(line.unit_amount), gross_amount: number(line.gross_amount), currency: text(line.currency), evidence_id: text(line.evidence_id),
    // Project only known nonsecret product fields; do not serialize raw metadata.
    product_name: text(line.metadata?.title), sku: text(line.metadata?.sku),
    provider_product_id: text(line.metadata?.provider_product_id), provider_variant_id: text(line.metadata?.provider_variant_id),
  }));
  const ids = [...new Set((eventResult.data || []).filter((e: any) => e.workspace_id === organization && e.person_id === order.resolved_person_id && e.source_record_id === order.canonical_order_id && e.platform_order_id === order.platform_order_id).map((e: any) => e.journey_id).filter(Boolean))];
  let journey_id = null;
  if (ids.length === 1) {
    const result = await db.from('journeys').select('id').eq('workspace_id', organization).eq('person_id', order.resolved_person_id).eq('id', ids[0]).maybeSingle();
    if (result.error) throw new Error('Journey evidence is unavailable.');
    journey_id = result.data?.id || null;
  }
  return { lines, journey_id };
}

// Customer history needs exact Journey references, not N line-item lookups.
// Batch bounded keys; never select a Journey by ordering or time proximity.
export async function customerOrderJourneys(db: any, organization: string, person: string, orders: any[]) {
  const result = new Map<string, string | null>();
  for (let offset = 0; offset < orders.length; offset += 50) {
    const batch = orders.slice(offset, offset + 50).filter(o => scopedOrder(o, organization) && o.resolved_person_id === person && o.canonical_order_id);
    if (!batch.length) continue;
    const events = await db.from('journey_events').select('source_record_id,platform_order_id,journey_id,workspace_id,person_id').eq('workspace_id', organization).eq('person_id', person).eq('event_type', 'purchase').in('source_record_id', batch.map(o => o.canonical_order_id)).limit(1001);
    if (events.error || events.data?.length > 1000) throw new Error('Customer Journey relationships are unavailable.');
    const ids = [...new Set((events.data || []).map((e: any) => e.journey_id).filter(Boolean))];
    const journeys = ids.length ? await db.from('journeys').select('id').eq('workspace_id', organization).eq('person_id', person).in('id', ids).limit(1001) : {data:[],error:null};
    if (journeys.error || journeys.data?.length > 1000) throw new Error('Customer Journey relationships are unavailable.');
    const authorized = new Set((journeys.data || []).map((j: any) => j.id));
    for (const order of batch) {
      const matches = [...new Set((events.data || []).filter((e: any) => e.workspace_id === organization && e.person_id === person && e.source_record_id === order.canonical_order_id && e.platform_order_id === order.platform_order_id && authorized.has(e.journey_id)).map((e: any) => e.journey_id))];
      result.set(order.canonical_order_id, matches.length === 1 ? matches[0] as string : null);
    }
  }
  return result;
}

export async function relatedCommerceOrders(db: any, organization: string, order: any, context?: string | null) {
  if (!scopedOrder(order, organization, context) || !/^[a-f0-9-]{36}$/i.test(order.canonical_order_id || '') || !order.connection_id || !order.provider_account_id) return [];
  const {data, error} = await db.from('commerce_relationship_projection_v3').select('organization_id,connection_id,child_canonical_order_id,parent_canonical_order_id,relationship_type,resolution_method,resolution_status,evidence_id').eq('organization_id',organization).eq('connection_id',order.connection_id).eq('resolution_status','resolved').or(`child_canonical_order_id.eq.${order.canonical_order_id},parent_canonical_order_id.eq.${order.canonical_order_id}`).limit(101);
  if (error || data?.length > 100) throw new Error('Related commerce evidence is unavailable.');
  const relations = (data || []).filter((r: any) => r.organization_id === organization && r.connection_id === order.connection_id && r.resolution_status === 'resolved' && [r.child_canonical_order_id,r.parent_canonical_order_id].includes(order.canonical_order_id));
  const ids = [...new Set(relations.flatMap((r: any) => [r.child_canonical_order_id,r.parent_canonical_order_id]).filter((id: string) => id && id !== order.canonical_order_id))];
  if (!ids.length) return [];
  const targets = await db.from('tracekit_customer_order_read_model').select(COMMERCE_ORDER_FIELDS).eq('workspace_id',organization).eq('organization_id',organization).eq('connection_id',order.connection_id).eq('provider_account_id',order.provider_account_id).in('canonical_order_id',ids).limit(101);
  if (targets.error || targets.data?.length > 100) throw new Error('Related commerce evidence is unavailable.');
  return (targets.data || []).filter((target: any) => scopedOrder(target,organization,context) && target.connection_id === order.connection_id && target.provider_account_id === order.provider_account_id).flatMap((target: any) => relations.filter((r: any) => [r.child_canonical_order_id,r.parent_canonical_order_id].includes(target.canonical_order_id)).map((r: any) => ({canonical_order_id:target.canonical_order_id,platform_order_id:target.platform_order_id,order_id:target.order_id,relationship_type:r.relationship_type,resolution_method:r.resolution_method,evidence_id:r.evidence_id || null})));
}
