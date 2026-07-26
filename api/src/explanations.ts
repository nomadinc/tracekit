import { cleanText } from "./identity-normalization.ts";

type ExplanationStatement = {
  id: string;
  text: string;
  evidence_type: string;
  evidence_ids: string[];
};

export type ExplanationBlock = {
  title: string;
  summary: string;
  statements: ExplanationStatement[];
  limitations: string[];
};

function numericValue(value: unknown) {
  if (value === null || value === undefined || cleanText(value) === "") return 0;
  const parsed = Number(cleanText(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyText(amount: unknown, currency: unknown = "USD") {
  const text = cleanText(amount);
  if (!text) return null;
  const numeric = Number(text);
  const code = cleanText(currency) || "USD";
  if (!Number.isFinite(numeric)) return `${text} ${code}`.trim();
  try {
    return numeric.toLocaleString("en-US", { style: "currency", currency: code });
  } catch {
    return `${numeric.toFixed(2)} ${code}`;
  }
}

function dateText(value: unknown) {
  const text = cleanText(value);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(ms));
}

function percentText(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  return `${numeric.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function firstPopulated(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function compactId(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  return text.length <= 18 ? text : `${text.slice(0, 8)}...${text.slice(-6)}`;
}

function evidenceId(row: any) {
  return cleanText(row?.id || row?.platform_order_id || row?.commission_event_id || row?.commission_id || row?.order_id || row?.transaction_id);
}

function orderAmount(order: any) {
  return numericValue(order?.gross_amount ?? order?.receipt_total ?? order?.amount);
}

function orderStatus(order: any) {
  return cleanText(order?.status_norm || order?.status || order?.raw_status).toLowerCase();
}

function isRefundOrder(order: any) {
  const status = orderStatus(order);
  if (/chargeback|dispute/.test(status)) return false;
  return /refund|refunded|return|reversal|void/.test(status) || orderAmount(order) < 0;
}

function isChargebackOrder(order: any) {
  return /chargeback|dispute/.test(orderStatus(order));
}

function isCanceledOrder(order: any) {
  return /cancel|void/.test(orderStatus(order));
}

function orderKey(order: any, index = 0) {
  return firstPopulated(
    order?.platform_order_id,
    order?.order_id ? `${order?.platform || "platform"}:${order.order_id}` : "",
    order?.transaction_id ? `${order?.platform || "platform"}:${order.transaction_id}` : "",
    order?.commerce_reference ? `${order?.platform || "platform"}:${order.commerce_reference}` : "",
  ) || `order:${index}`;
}

function dedupeOrders(orders: any[]) {
  const map = new Map<string, any>();
  orders.forEach((order, index) => {
    const key = orderKey(order, index);
    if (!map.has(key)) map.set(key, order);
  });
  return Array.from(map.values());
}

function creditKey(credit: any, index = 0) {
  return cleanText(credit?.id) || [
    cleanText(credit?.conversion_event_id),
    cleanText(credit?.touchpoint_event_id),
    cleanText(credit?.model),
    cleanText(credit?.affiliate_id || credit?.source),
  ].filter(Boolean).join(":") || `credit:${index}`;
}

function commissionKey(commission: any, index = 0) {
  return cleanText(commission?.id || commission?.commission_event_id) || [
    cleanText(commission?.journey_attribution_credit_id),
    cleanText(commission?.conversion_event_id),
    cleanText(commission?.affiliate_id),
  ].filter(Boolean).join(":") || `commission:${index}`;
}

function sourceLabel(row: any) {
  if (row?.affiliate_id) return `Affiliate ${row.affiliate_id}`;
  return firstPopulated(row?.source, row?.medium, row?.touchpoint_source, row?.platform, row?.source_platform, "Unknown");
}

function channelName(row: any) {
  if (row?.affiliate_id) return `Affiliate ${row.affiliate_id}`;
  const source = cleanText(row?.source || row?.touchpoint_source);
  const medium = cleanText(row?.medium || row?.touchpoint_medium);
  if (source || medium) return [source, medium].filter(Boolean).join(" / ");
  return cleanText(row?.source_platform || row?.platform || "Unknown");
}

function latestTimestamp(...values: unknown[]) {
  const sorted = values.map((value) => cleanText(value)).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a));
  return sorted[0] || null;
}

function earliestTimestamp(...values: unknown[]) {
  const sorted = values.map((value) => cleanText(value)).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return sorted[0] || null;
}

function conversionKey(row: any, index = 0) {
  return cleanText(row?.conversion_event_id || row?.platform_order_id || row?.order_id || row?.transaction_id || row?.id) || `conversion:${index}`;
}

function monthKey(value: unknown) {
  const ms = Date.parse(cleanText(value));
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pushStatement(block: ExplanationBlock, statement: ExplanationStatement | null) {
  if (statement?.text) block.statements.push(statement);
}

export function buildIdentityExplanation(args: { person: any; identifiers: any[]; identityEvents: any[] }): ExplanationBlock {
  const block: ExplanationBlock = { title: "Explain Identity", summary: "TraceKit linked the stored identity evidence for this customer.", statements: [], limitations: [] };
  const reason = args.identityEvents.find((event) => cleanText(event.resolution_reason))?.resolution_reason;
  if (args.identifiers.length) {
    pushStatement(block, {
      id: "identity_identifiers",
      text: `${args.identifiers.length} identifier${args.identifiers.length === 1 ? "" : "s"} are linked to this person.`,
      evidence_type: "person_identifiers",
      evidence_ids: args.identifiers.map(evidenceId).filter(Boolean),
    });
  }
  if (reason) {
    pushStatement(block, {
      id: "identity_reason",
      text: `The recorded identity reason is: ${reason}.`,
      evidence_type: "identity_resolution_events",
      evidence_ids: args.identityEvents.map(evidenceId).filter(Boolean).slice(0, 5),
    });
  } else {
    block.limitations.push("The exact identity match reason was not recorded.");
  }
  block.summary = reason || (args.identifiers.length ? "This customer is linked by stored identity identifiers." : "This customer has limited identity evidence.");
  return block;
}

export function buildCommissionExplanation(commission: any): ExplanationBlock {
  const block: ExplanationBlock = { title: "Explain Commission", summary: "A stored commission record is associated with this customer.", statements: [], limitations: [] };
  const amount = moneyText(commission?.commission_amount, commission?.currency);
  const credited = moneyText(commission?.credit_amount ?? commission?.attributed_amount, commission?.currency);
  const rate = commission?.commission_rate === null || commission?.commission_rate === undefined ? null : Number(commission.commission_rate);
  const rateText = rate !== null && Number.isFinite(rate) ? `${(rate * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%` : null;
  if (amount) {
    pushStatement(block, {
      id: "commission_amount",
      text: `${amount} commission was generated${commission?.affiliate_id ? ` for Affiliate ${commission.affiliate_id}` : ""}.`,
      evidence_type: "affiliate_commissions",
      evidence_ids: [evidenceId(commission)].filter(Boolean),
    });
  }
  if (credited && rateText && amount) {
    pushStatement(block, {
      id: "commission_formula",
      text: `${credited} credited revenue x ${rateText} = ${amount}.`,
      evidence_type: "affiliate_commissions",
      evidence_ids: [evidenceId(commission)].filter(Boolean),
    });
  } else {
    block.limitations.push("The stored commission inputs do not support a simple percentage formula.");
  }
  block.summary = amount ? `${amount} commission is stored with status ${cleanText(commission?.status) || "unknown"}.` : "A commission record exists, but the amount is unavailable.";
  return block;
}

export function buildAttributionExplanation(credit: any): ExplanationBlock {
  const block: ExplanationBlock = { title: "Explain Attribution", summary: "Stored attribution credit is associated with this customer.", statements: [], limitations: [] };
  const source = sourceLabel(credit);
  const percent = percentText(credit?.credit_percent);
  const amount = moneyText(credit?.credit_amount, credit?.currency);
  if (source && (percent || amount)) {
    pushStatement(block, {
      id: "attribution_credit",
      text: `${source} received${percent ? ` ${percent}` : ""} attribution credit${amount ? ` for ${amount}` : ""}.`,
      evidence_type: "journey_attribution_credits",
      evidence_ids: [evidenceId(credit)].filter(Boolean),
    });
  }
  if (credit?.reason) {
    pushStatement(block, {
      id: "attribution_reason",
      text: `The stored attribution reason is: ${credit.reason}.`,
      evidence_type: "journey_attribution_credits",
      evidence_ids: [evidenceId(credit)].filter(Boolean),
    });
  } else {
    block.limitations.push("Detailed attribution reasoning was not recorded for this credit.");
  }
  block.summary = amount ? `${source} has stored credited revenue of ${amount}.` : `${source} has stored attribution credit.`;
  return block;
}

export function buildOrderExplanation(args: { order: any; credits: any[]; commissions: any[] }): ExplanationBlock {
  const order = args.order;
  const block: ExplanationBlock = { title: "Explain This Order", summary: "Stored order evidence is linked to this customer.", statements: [], limitations: [] };
  const orderId = firstPopulated(order?.order_id, order?.platform_order_id, order?.transaction_id, "This order");
  const amount = moneyText(order?.gross_amount ?? order?.receipt_total ?? order?.amount, order?.currency);
  pushStatement(block, {
    id: "order_recorded",
    text: `${orderId} was recorded${order?.platform ? ` through ${order.platform}` : ""}${amount ? ` for ${amount}` : ""}.`,
    evidence_type: "platform_orders",
    evidence_ids: [evidenceId(order)].filter(Boolean),
  });
  if (args.credits.length) {
    const sources = unique(args.credits.map(sourceLabel));
    pushStatement(block, {
      id: "order_attribution",
      text: `${args.credits.length} attribution credit${args.credits.length === 1 ? "" : "s"} are associated with this order${sources.length ? `, including ${sources.slice(0, 3).join(", ")}` : ""}.`,
      evidence_type: "journey_attribution_credits",
      evidence_ids: args.credits.map(evidenceId).filter(Boolean),
    });
  } else {
    block.limitations.push("No attribution credit is associated with this order.");
  }
  if (args.commissions.length) {
    const total = args.commissions.reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0);
    pushStatement(block, {
      id: "order_commissions",
      text: `${moneyText(total.toFixed(2), args.commissions[0]?.currency || order?.currency) || "Stored"} commission value is associated with this order.`,
      evidence_type: "affiliate_commissions",
      evidence_ids: args.commissions.map(evidenceId).filter(Boolean),
    });
  } else {
    block.limitations.push("No commission is associated with this order.");
  }
  if (isRefundOrder(order)) {
    pushStatement(block, {
      id: "order_refund",
      text: "A refund or reversal status is recorded for this order.",
      evidence_type: "platform_orders",
      evidence_ids: [evidenceId(order)].filter(Boolean),
    });
  }
  block.summary = block.statements.map((statement) => statement.text).slice(0, 3).join(" ");
  return block;
}

export function buildCustomerExplanation(args: {
  person: any;
  identifiers: any[];
  identityEvents: any[];
  journeys: any[];
  orders: any[];
  credits: any[];
  commissions: any[];
  metrics: Record<string, any>;
  acquisition: Record<string, any>;
  refunds: Record<string, any>;
  chargebacks: Record<string, any>;
}): ExplanationBlock {
  const block: ExplanationBlock = { title: "Explain This Customer", summary: "", statements: [], limitations: [] };
  const name = firstPopulated(args.person?.display_name, args.person?.primary_email, args.person?.primary_phone, compactId(args.person?.id), "This customer");
  const firstSeen = dateText(args.person?.first_seen_at || args.person?.created_at);
  if (firstSeen) {
    pushStatement(block, { id: "first_seen", text: `${name} was first seen on ${firstSeen}.`, evidence_type: "people", evidence_ids: [evidenceId(args.person)].filter(Boolean) });
  }
  const firstTouch = args.acquisition?.first_known_touch;
  if (firstTouch?.source) {
    pushStatement(block, {
      id: "first_marketing_touch",
      text: `The first retained marketing touch was ${firstTouch.source}${firstTouch.occurred_at ? ` on ${dateText(firstTouch.occurred_at)}` : ""}.`,
      evidence_type: firstTouch.evidence_type || "journey_events",
      evidence_ids: firstTouch.evidence_ids || [],
    });
  } else {
    block.limitations.push("No eligible marketing touchpoint was retained for this customer.");
  }
  const identity = buildIdentityExplanation({ person: args.person, identifiers: args.identifiers, identityEvents: args.identityEvents });
  if (identity.statements.length) {
    pushStatement(block, { id: "identity", text: identity.summary, evidence_type: "person_identifiers", evidence_ids: args.identifiers.map(evidenceId).filter(Boolean) });
  } else {
    block.limitations.push("Identity evidence is limited.");
  }
  if (Number(args.metrics.orders || 0) > 0) {
    pushStatement(block, {
      id: "orders",
      text: `${name} has completed ${args.metrics.orders} order${Number(args.metrics.orders) === 1 ? "" : "s"} totaling ${args.metrics.lifetime_revenue || "$0.00"} in lifetime revenue.`,
      evidence_type: "platform_orders",
      evidence_ids: args.orders.map(evidenceId).filter(Boolean).slice(0, 20),
    });
  } else {
    block.limitations.push("No linked purchases are available for this customer.");
  }
  if (Number(args.metrics.attributed_orders || 0) > 0) {
    pushStatement(block, {
      id: "attribution",
      text: `${args.metrics.attributed_orders} order${Number(args.metrics.attributed_orders) === 1 ? "" : "s"} have stored attribution credit totaling ${args.metrics.attributed_revenue || "$0.00"}.`,
      evidence_type: "journey_attribution_credits",
      evidence_ids: args.credits.map(evidenceId).filter(Boolean).slice(0, 20),
    });
  } else if (Number(args.metrics.orders || 0) > 0) {
    block.limitations.push("Purchases are linked to this customer, but no attribution credits were recorded.");
  }
  if (Number(args.metrics.commission_generated_raw || 0) > 0) {
    pushStatement(block, {
      id: "commissions",
      text: `TraceKit generated ${args.metrics.commission_generated} in commissions, with ${args.metrics.commission_paid || "$0.00"} paid.`,
      evidence_type: "affiliate_commissions",
      evidence_ids: args.commissions.map(evidenceId).filter(Boolean).slice(0, 20),
    });
  } else if (Number(args.metrics.attributed_orders || 0) > 0) {
    block.limitations.push("Attribution exists, but no affiliate commission is associated with these conversions.");
  }
  if (args.metrics.last_purchase_at) {
    pushStatement(block, { id: "last_purchase", text: `The most recent purchase occurred on ${dateText(args.metrics.last_purchase_at)}.`, evidence_type: "platform_orders", evidence_ids: args.orders.map(evidenceId).filter(Boolean).slice(0, 1) });
  }
  if (Number(args.refunds?.count || 0) > 0) {
    pushStatement(block, { id: "refunds", text: `${args.refunds.count} historical refund or reversal record${Number(args.refunds.count) === 1 ? " is" : "s are"} associated with the account.`, evidence_type: "platform_orders", evidence_ids: args.orders.filter(isRefundOrder).map(evidenceId).filter(Boolean) });
  }
  if (Number(args.chargebacks?.count || 0) > 0) {
    pushStatement(block, { id: "chargebacks", text: `${args.chargebacks.count} chargeback or dispute record${Number(args.chargebacks.count) === 1 ? " is" : "s are"} associated with the account.`, evidence_type: "platform_orders", evidence_ids: args.orders.filter(isChargebackOrder).map(evidenceId).filter(Boolean) });
  }
  if (Number(args.metrics.unattributed_purchases || 0) > 0) {
    pushStatement(block, { id: "unattributed_purchases", text: `${args.metrics.unattributed_purchases} purchase${Number(args.metrics.unattributed_purchases) === 1 ? "" : "s"} currently have no stored attribution credit.`, evidence_type: "platform_orders", evidence_ids: [] });
  }
  block.summary = block.statements.map((statement) => statement.text).slice(0, 6).join(" ");
  return block;
}

export function buildCustomer360(args: {
  person: any;
  identifiers: any[];
  identityEvents: any[];
  journeys: any[];
  orders: any[];
  credits: any[];
  commissions: any[];
}) {
  const orders = dedupeOrders(args.orders);
  const orderCurrency = orders.find((order) => order.currency)?.currency || args.credits.find((credit) => credit.currency)?.currency || args.commissions.find((commission) => commission.currency)?.currency || "USD";
  const positiveOrders = orders.filter((order) => orderAmount(order) > 0 && !isRefundOrder(order) && !isChargebackOrder(order) && !isCanceledOrder(order));
  const refunds = orders.filter(isRefundOrder);
  const chargebacks = orders.filter(isChargebackOrder);
  const grossRevenueRaw = positiveOrders.reduce((sum, order) => sum + orderAmount(order), 0);
  const refundedRaw = refunds.reduce((sum, order) => sum + Math.abs(orderAmount(order)), 0);
  const chargebackRaw = chargebacks.reduce((sum, order) => sum + Math.abs(orderAmount(order)), 0);
  const netRevenueRaw = grossRevenueRaw - refundedRaw - chargebackRaw;
  const attributedCredits = args.credits.filter((credit) => cleanText(credit.status) !== "unattributed");
  const attributedRevenueRaw = attributedCredits.reduce((sum, credit) => sum + numericValue(credit.credit_amount), 0);
  const commissionGeneratedRaw = args.commissions.reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0);
  const commissionPaidRaw = args.commissions.filter((commission) => cleanText(commission.status).toLowerCase() === "paid").reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0);
  const commissionPendingRaw = args.commissions.filter((commission) => ["draft", "pending", "approved"].includes(cleanText(commission.status).toLowerCase())).reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0);
  const commissionReversedRaw = args.commissions.filter((commission) => ["reversed", "rejected"].includes(cleanText(commission.status).toLowerCase())).reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0);
  const attributedConversions = new Set(attributedCredits.map((credit, index) => conversionKey(credit, index))).size;
  const purchaseConversions = new Set(positiveOrders.map((order, index) => conversionKey(order, index))).size;
  const lastPurchaseAt = latestTimestamp(...positiveOrders.map((order) => order.order_ts || order.created_at));
  const metrics = {
    lifetime_revenue: moneyText(grossRevenueRaw.toFixed(2), orderCurrency),
    lifetime_revenue_raw: grossRevenueRaw,
    net_revenue: moneyText(netRevenueRaw.toFixed(2), orderCurrency),
    net_revenue_raw: netRevenueRaw,
    refunded_revenue: refunds.length ? moneyText(refundedRaw.toFixed(2), orderCurrency) : null,
    refunded_revenue_raw: refundedRaw,
    chargeback_revenue: chargebacks.length ? moneyText(chargebackRaw.toFixed(2), orderCurrency) : null,
    chargeback_revenue_raw: chargebackRaw,
    orders: positiveOrders.length,
    order_rows: orders.length,
    average_order_value: positiveOrders.length ? moneyText((grossRevenueRaw / positiveOrders.length).toFixed(2), orderCurrency) : null,
    average_order_value_raw: positiveOrders.length ? grossRevenueRaw / positiveOrders.length : null,
    attributed_revenue: moneyText(attributedRevenueRaw.toFixed(2), args.credits[0]?.currency || orderCurrency),
    attributed_revenue_raw: attributedRevenueRaw,
    attributed_orders: attributedConversions,
    unattributed_purchases: Math.max(0, purchaseConversions - attributedConversions),
    commission_generated: moneyText(commissionGeneratedRaw.toFixed(2), args.commissions[0]?.currency || orderCurrency),
    commission_generated_raw: commissionGeneratedRaw,
    commission_paid: moneyText(commissionPaidRaw.toFixed(2), args.commissions[0]?.currency || orderCurrency),
    commission_paid_raw: commissionPaidRaw,
    commission_pending: moneyText(commissionPendingRaw.toFixed(2), args.commissions[0]?.currency || orderCurrency),
    commission_pending_raw: commissionPendingRaw,
    commission_reversed: moneyText(commissionReversedRaw.toFixed(2), args.commissions[0]?.currency || orderCurrency),
    commission_reversed_raw: commissionReversedRaw,
    journeys: args.journeys.length,
    first_seen_at: args.person?.first_seen_at || args.person?.created_at || null,
    last_seen_at: latestTimestamp(args.person?.last_seen_at, args.person?.updated_at, ...orders.map((order) => order.order_ts || order.created_at), ...args.credits.map((credit) => credit.conversion_event_time)),
    last_purchase_at: lastPurchaseAt,
  };

  const commissionByStatus = args.commissions.reduce((acc: Record<string, number>, commission) => {
    const status = cleanText(commission.status || "unknown").toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusChips = [
    args.identifiers.length ? "Resolved" : "",
    positiveOrders.length > 1 ? "Repeat customer" : "",
    attributedCredits.length ? "Attributed" : "",
    args.commissions.length && !commissionPendingRaw ? "Commission complete" : "",
    refunds.length ? "Has refund" : "",
    chargebacks.length ? "Has chargeback" : "",
  ].filter(Boolean);

  const operationalHealth = [
    {
      id: "identity_linked",
      label: "Identity linked",
      status: args.identifiers.length ? "healthy" : "attention",
      summary: args.identifiers.length ? "Identity is resolved with stored identifiers." : "This customer has limited identity evidence.",
    },
    {
      id: "orders_linked",
      label: "Orders linked",
      status: positiveOrders.length ? "healthy" : "informational",
      summary: positiveOrders.length ? `${positiveOrders.length} purchase${positiveOrders.length === 1 ? "" : "s"} linked to this customer.` : "This customer has been identified, but no linked purchases are available.",
    },
    {
      id: "purchases_attributed",
      label: "Purchases attributed",
      status: !positiveOrders.length ? "not_applicable" : metrics.unattributed_purchases ? "attention" : "healthy",
      summary: !positiveOrders.length ? "No purchases require attribution." : metrics.unattributed_purchases ? `${metrics.unattributed_purchases} purchase${metrics.unattributed_purchases === 1 ? " has" : "s have"} no stored attribution credit.` : `${positiveOrders.length} of ${positiveOrders.length} eligible purchases have stored attribution.`,
    },
    {
      id: "commissions_created",
      label: "Commissions created",
      status: !attributedCredits.length ? "not_applicable" : args.commissions.length ? "healthy" : "informational",
      summary: !attributedCredits.length ? "No attributed conversions require commission review." : args.commissions.length ? `${args.commissions.length} commission record${args.commissions.length === 1 ? "" : "s"} associated with this customer.` : "Attribution exists, but no affiliate commission is associated with these conversions.",
    },
    {
      id: "commission_status",
      label: "Commission status",
      status: !args.commissions.length ? "not_applicable" : commissionPendingRaw ? "attention" : "healthy",
      summary: !args.commissions.length ? "No commission records are available." : commissionPendingRaw ? `${commissionByStatus.pending || 0} pending and ${commissionByStatus.draft || 0} draft commission records remain.` : "Stored commission records are not pending.",
    },
    {
      id: "refunds",
      label: "Refunds reconciled",
      status: refunds.length || chargebacks.length ? "informational" : "healthy",
      summary: refunds.length || chargebacks.length ? `${refunds.length} refund/reversal and ${chargebacks.length} chargeback/dispute records are associated with this customer.` : "No refund or chargeback records are associated with this customer.",
    },
  ];

  const channelMap = new Map<string, any>();
  for (const credit of args.credits) {
    const channel = channelName(credit);
    const entry = channelMap.get(channel) || {
      channel,
      first_touch: credit.touchpoint_event_time || credit.conversion_event_time || null,
      last_touch: credit.touchpoint_event_time || credit.conversion_event_time || null,
      touchpoint_count: 0,
      journeys_influenced: new Set<string>(),
      attributed_orders: new Set<string>(),
      attributed_revenue_raw: 0,
      attributed_revenue: null,
      primary_campaign: null,
      affiliate_id: credit.affiliate_id || null,
      source: credit.source || null,
      medium: credit.medium || null,
      evidence_ids: [],
    };
    entry.first_touch = earliestTimestamp(entry.first_touch, credit.touchpoint_event_time, credit.conversion_event_time);
    entry.last_touch = latestTimestamp(entry.last_touch, credit.touchpoint_event_time, credit.conversion_event_time);
    entry.touchpoint_count += credit.touchpoint_event_id ? 1 : 0;
    if (credit.journey_id) entry.journeys_influenced.add(cleanText(credit.journey_id));
    entry.attributed_orders.add(conversionKey(credit));
    entry.attributed_revenue_raw += numericValue(credit.credit_amount);
    entry.primary_campaign ||= firstPopulated(credit.campaign_id, credit.offer_id);
    if (evidenceId(credit)) entry.evidence_ids.push(evidenceId(credit));
    channelMap.set(channel, entry);
  }
  for (const order of positiveOrders) {
    if (!order.affiliate_id && !order.source_id) continue;
    const channel = channelName(order);
    const entry = channelMap.get(channel) || {
      channel,
      first_touch: order.order_ts || order.created_at || null,
      last_touch: order.order_ts || order.created_at || null,
      touchpoint_count: 0,
      journeys_influenced: new Set<string>(),
      attributed_orders: new Set<string>(),
      attributed_revenue_raw: 0,
      attributed_revenue: null,
      primary_campaign: null,
      affiliate_id: order.affiliate_id || null,
      source: order.source_id || null,
      medium: null,
      evidence_ids: [],
    };
    entry.first_touch = earliestTimestamp(entry.first_touch, order.order_ts || order.created_at);
    entry.last_touch = latestTimestamp(entry.last_touch, order.order_ts || order.created_at);
    if (evidenceId(order)) entry.evidence_ids.push(evidenceId(order));
    channelMap.set(channel, entry);
  }
  const channels = Array.from(channelMap.values()).map((entry) => ({
    ...entry,
    journeys_influenced: entry.journeys_influenced.size,
    attributed_orders: entry.attributed_orders.size,
    attributed_revenue: moneyText(entry.attributed_revenue_raw.toFixed(2), args.credits[0]?.currency || orderCurrency),
    evidence_ids: unique(entry.evidence_ids).slice(0, 20),
  })).sort((a, b) => Number(b.attributed_revenue_raw || 0) - Number(a.attributed_revenue_raw || 0));

  const firstKnownTouch = channels
    .filter((channel) => channel.first_touch)
    .sort((a, b) => Date.parse(a.first_touch) - Date.parse(b.first_touch))[0] || null;
  const mostRecentTouch = channels
    .filter((channel) => channel.last_touch)
    .sort((a, b) => Date.parse(b.last_touch) - Date.parse(a.last_touch))[0] || null;
  const firstAttributed = args.credits
    .filter((credit) => cleanText(credit.status) !== "unattributed")
    .sort((a, b) => Date.parse(a.conversion_event_time || a.calculated_at || a.created_at || "") - Date.parse(b.conversion_event_time || b.calculated_at || b.created_at || ""))[0] || null;
  const recentAttributed = args.credits
    .filter((credit) => cleanText(credit.status) !== "unattributed")
    .sort((a, b) => Date.parse(b.conversion_event_time || b.calculated_at || b.created_at || "") - Date.parse(a.conversion_event_time || a.calculated_at || a.created_at || ""))[0] || null;
  const acquisition = {
    first_known_touch: firstKnownTouch ? { source: firstKnownTouch.channel, occurred_at: firstKnownTouch.first_touch, evidence_type: "journey_attribution_credits", evidence_ids: firstKnownTouch.evidence_ids } : null,
    first_attributed_source: firstAttributed ? { source: sourceLabel(firstAttributed), occurred_at: firstAttributed.conversion_event_time || firstAttributed.calculated_at || firstAttributed.created_at || null, evidence_type: "journey_attribution_credits", evidence_ids: [evidenceId(firstAttributed)].filter(Boolean) } : null,
    most_recent_touch: mostRecentTouch ? { source: mostRecentTouch.channel, occurred_at: mostRecentTouch.last_touch, evidence_type: "journey_attribution_credits", evidence_ids: mostRecentTouch.evidence_ids } : null,
    most_recent_attributed_source: recentAttributed ? { source: sourceLabel(recentAttributed), occurred_at: recentAttributed.conversion_event_time || recentAttributed.calculated_at || recentAttributed.created_at || null, evidence_type: "journey_attribution_credits", evidence_ids: [evidenceId(recentAttributed)].filter(Boolean) } : null,
    primary_lifetime_source: channels[0] ? { source: channels[0].channel, attributed_revenue: channels[0].attributed_revenue, evidence_ids: channels[0].evidence_ids } : null,
  };

  const conversionCredits = new Map<string, any[]>();
  args.credits.forEach((credit, index) => {
    const key = conversionKey(credit, index);
    const bucket = conversionCredits.get(key) || [];
    bucket.push(credit);
    conversionCredits.set(key, bucket);
  });
  const conversionCommissions = new Map<string, any[]>();
  args.commissions.forEach((commission, index) => {
    const key = conversionKey(commission, index);
    const bucket = conversionCommissions.get(key) || [];
    bucket.push(commission);
    conversionCommissions.set(key, bucket);
  });

  const commercialHistory = orders.map((order, index) => {
    const key = conversionKey(order, index);
    const relatedCredits = conversionCredits.get(key) || [];
    const relatedCommissions = conversionCommissions.get(key) || [];
    const gross = orderAmount(order);
    const refunded = isRefundOrder(order) ? Math.abs(gross) : 0;
    const chargeback = isChargebackOrder(order) ? Math.abs(gross) : 0;
    return {
      key: orderKey(order, index),
      date: order.order_ts || order.created_at || null,
      order_id: order.order_id || null,
      platform_order_id: order.platform_order_id || null,
      transaction_id: order.transaction_id || null,
      platform: order.platform || null,
      products: Array.isArray(order.raw_json?.line_items) ? order.raw_json.line_items.slice(0, 5).map((item: any) => firstPopulated(item.name, item.title, item.sku)).filter(Boolean) : [],
      status: order.status_norm || order.status || null,
      gross: moneyText(gross.toFixed(2), order.currency || orderCurrency),
      gross_raw: gross,
      refunded: refunded ? moneyText(refunded.toFixed(2), order.currency || orderCurrency) : null,
      refunded_raw: refunded,
      chargeback: chargeback ? moneyText(chargeback.toFixed(2), order.currency || orderCurrency) : null,
      chargeback_raw: chargeback,
      net: moneyText((gross - refunded - chargeback).toFixed(2), order.currency || orderCurrency),
      net_raw: gross - refunded - chargeback,
      attributed_source: relatedCredits[0] ? sourceLabel(relatedCredits[0]) : null,
      commission: relatedCommissions.length ? moneyText(relatedCommissions.reduce((sum, commission) => sum + numericValue(commission.commission_amount), 0).toFixed(2), relatedCommissions[0]?.currency || order.currency || orderCurrency) : null,
      related_credit_ids: relatedCredits.map(evidenceId).filter(Boolean),
      related_commission_ids: relatedCommissions.map(evidenceId).filter(Boolean),
    };
  }).sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));

  const valueMonths = new Map<string, any>();
  function ensureMonth(key: string) {
    const existing = valueMonths.get(key) || { month: key, order_revenue_raw: 0, order_revenue: null, attributed_revenue_raw: 0, attributed_revenue: null, refunds_raw: 0, refunds: null, commission_generated_raw: 0, commission_generated: null };
    valueMonths.set(key, existing);
    return existing;
  }
  for (const order of orders) {
    const key = monthKey(order.order_ts || order.created_at);
    if (!key) continue;
    const month = ensureMonth(key);
    if (isRefundOrder(order)) month.refunds_raw += Math.abs(orderAmount(order));
    else if (orderAmount(order) > 0 && !isChargebackOrder(order) && !isCanceledOrder(order)) month.order_revenue_raw += orderAmount(order);
  }
  for (const credit of args.credits) {
    const key = monthKey(credit.conversion_event_time || credit.calculated_at || credit.created_at);
    if (!key) continue;
    ensureMonth(key).attributed_revenue_raw += numericValue(credit.credit_amount);
  }
  for (const commission of args.commissions) {
    const key = monthKey(commission.conversion_event_time || commission.generated_at || commission.created_at);
    if (!key) continue;
    ensureMonth(key).commission_generated_raw += numericValue(commission.commission_amount);
  }
  const valueByMonth = Array.from(valueMonths.values()).sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({
    ...row,
    order_revenue: row.order_revenue_raw ? moneyText(row.order_revenue_raw.toFixed(2), orderCurrency) : null,
    attributed_revenue: row.attributed_revenue_raw ? moneyText(row.attributed_revenue_raw.toFixed(2), args.credits[0]?.currency || orderCurrency) : null,
    refunds: row.refunds_raw ? moneyText(row.refunds_raw.toFixed(2), orderCurrency) : null,
    commission_generated: row.commission_generated_raw ? moneyText(row.commission_generated_raw.toFixed(2), args.commissions[0]?.currency || orderCurrency) : null,
  }));

  const attributionSummaryMap = new Map<string, any>();
  for (const credit of args.credits) {
    const key = channelName(credit);
    const entry = attributionSummaryMap.get(key) || { source: key, orders: new Set<string>(), credited_revenue_raw: 0, credited_revenue: null, commissions_raw: 0, commissions: null, evidence_ids: [] };
    entry.orders.add(conversionKey(credit));
    entry.credited_revenue_raw += numericValue(credit.credit_amount);
    if (evidenceId(credit)) entry.evidence_ids.push(evidenceId(credit));
    attributionSummaryMap.set(key, entry);
  }
  for (const commission of args.commissions) {
    const source = commission.affiliate_id ? `Affiliate ${commission.affiliate_id}` : firstPopulated(commission.touchpoint_source, commission.touchpoint_medium, "Commission source unknown") || "Commission source unknown";
    const entry = attributionSummaryMap.get(source) || { source, orders: new Set<string>(), credited_revenue_raw: 0, credited_revenue: null, commissions_raw: 0, commissions: null, evidence_ids: [] };
    entry.commissions_raw += numericValue(commission.commission_amount);
    if (evidenceId(commission)) entry.evidence_ids.push(evidenceId(commission));
    attributionSummaryMap.set(source, entry);
  }
  const attributionSummary = Array.from(attributionSummaryMap.values()).map((entry) => ({
    source: entry.source,
    orders: entry.orders.size,
    credited_revenue: moneyText(entry.credited_revenue_raw.toFixed(2), args.credits[0]?.currency || orderCurrency),
    credited_revenue_raw: entry.credited_revenue_raw,
    commissions: entry.commissions_raw ? moneyText(entry.commissions_raw.toFixed(2), args.commissions[0]?.currency || orderCurrency) : null,
    commissions_raw: entry.commissions_raw,
    evidence_ids: unique(entry.evidence_ids).slice(0, 20),
  })).sort((a, b) => b.credited_revenue_raw - a.credited_revenue_raw);

  const subscription = null;
  const refundsSummary = {
    count: refunds.length,
    amount: refunds.length ? moneyText(refundedRaw.toFixed(2), orderCurrency) : null,
    amount_raw: refundedRaw,
    last_refund_at: latestTimestamp(...refunds.map((order) => order.order_ts || order.created_at)),
    evidence_ids: refunds.map(evidenceId).filter(Boolean).slice(0, 20),
  };
  const chargebacksSummary = {
    count: chargebacks.length,
    amount: chargebacks.length ? moneyText(chargebackRaw.toFixed(2), orderCurrency) : null,
    amount_raw: chargebackRaw,
    last_chargeback_at: latestTimestamp(...chargebacks.map((order) => order.order_ts || order.created_at)),
    evidence_ids: chargebacks.map(evidenceId).filter(Boolean).slice(0, 20),
  };
  const status = {
    chips: statusChips,
    identity: args.identifiers.length ? "Resolved" : "Limited evidence",
    last_purchase_at: metrics.last_purchase_at,
    attribution: positiveOrders.length ? `${Math.min(attributedConversions, positiveOrders.length)} of ${positiveOrders.length} purchases attributed` : null,
    commissions: args.commissions.length ? commissionByStatus : null,
    refunds: refunds.length ? `${refunds.length} historical refund/reversal` : null,
    chargebacks: chargebacks.length ? `${chargebacks.length} chargeback/dispute` : null,
    subscription: null,
  };
  const customerExplanation = buildCustomerExplanation({ ...args, orders, metrics, acquisition, refunds: refundsSummary, chargebacks: chargebacksSummary });
  const orderExplanations = Object.fromEntries(commercialHistory.map((order) => {
    const sourceOrder = orders.find((row) => orderKey(row) === order.key) || order;
    const relatedCredits = args.credits.filter((credit) => order.related_credit_ids.includes(evidenceId(credit)));
    const relatedCommissions = args.commissions.filter((commission) => order.related_commission_ids.includes(evidenceId(commission)));
    return [order.key, buildOrderExplanation({ order: sourceOrder, credits: relatedCredits, commissions: relatedCommissions })];
  }));

  return {
    metrics,
    status,
    operational_health: operationalHealth,
    channels,
    acquisition,
    commercial_summary: {
      orders: commercialHistory,
      aggregation_keys: {
        order_count: "platform_order_id, then platform:order_id, then platform:transaction_id; never email",
        revenue: "positive linked platform order amounts excluding stored refund, chargeback, and canceled statuses",
        attribution: "stored journey_attribution_credits credit_amount by credit/conversion identifier",
        commission: "stored affiliate_commissions commission_amount by commission identifier",
      },
    },
    subscription,
    refunds: refundsSummary,
    chargebacks: chargebacksSummary,
    value_by_month: valueByMonth,
    attribution_summary: attributionSummary,
    commission_summary: {
      generated: metrics.commission_generated,
      generated_raw: commissionGeneratedRaw,
      paid: metrics.commission_paid,
      paid_raw: commissionPaidRaw,
      pending: metrics.commission_pending,
      pending_raw: commissionPendingRaw,
      reversed: metrics.commission_reversed,
      reversed_raw: commissionReversedRaw,
      by_status: commissionByStatus,
    },
    evidence_limits: {
      orders_loaded: args.orders.length,
      credits_loaded: args.credits.length,
      commissions_loaded: args.commissions.length,
      bounded_read: true,
    },
    explanations: {
      customer: customerExplanation,
      identity: buildIdentityExplanation(args),
      orders: orderExplanations,
      attribution: Object.fromEntries(args.credits.map((credit) => [evidenceId(credit), buildAttributionExplanation(credit)]).filter(([id]) => id)),
      commissions: Object.fromEntries(args.commissions.map((commission) => [evidenceId(commission), buildCommissionExplanation(commission)]).filter(([id]) => id)),
    },
  };
}
