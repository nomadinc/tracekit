// Only retained, exact identifiers can establish an Order relationship.
// Time proximity and substring matches are not identity evidence.
export function exactRelatedOrder(event: any, orders: any[]): any | null {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  let proof: any = null;
  if (event && Object.prototype.hasOwnProperty.call(event, "commerce")) {
    // An explicit Core proof (including an empty/unresolved result) outranks
    // legacy provider-key matching. Never turn negative proof into a fallback.
    if (!Array.isArray(event.commerce) || event.commerce.length !== 1) return null;
    proof = event.commerce[0];
    if (!text(proof?.canonical_order_id)
      || text(event.source_record_id) !== text(proof.canonical_order_id)
      || text(event.platform_order_id) !== text(proof.platform_order_id)) return null;
  }
  const evidence = [event, event?.technical_evidence, event?.technical, proof].filter(Boolean);
  const values = (rows: any[], key: string) => Array.from(new Set(rows.map((row) => text(row?.[key])).filter(Boolean)));
  // Persisted provider keys encode provider:connection:provider-account:object-id.
  // Older/short keys cannot supply the missing scope needed for number fallback.
  const encodedScope = (value: unknown) => {
    const parts = text(value).split(":");
    return parts.length >= 4 && parts[0] && parts[1] && parts[2]
      ? { platform: parts[0], connection_id: parts[1], provider_account_id: parts[2] } : null;
  };
  const authoritative: Array<{ field: string; value: string }> = [];
  for (const row of evidence) {
    for (const field of ["platform_order_id", "canonical_order_id", "related_order_id"]) {
      if (row[field] != null && row[field] !== "" && !text(row[field])) return null;
      if (text(row[field])) authoritative.push({ field, value: text(row[field]) });
    }
    // A fully qualified key stored in order_id is still authoritative evidence.
    if (text(row.order_id).includes(":")) authoritative.push({ field: "platform_order_id", value: text(row.order_id) });
    for (const relation of Array.isArray(row.relationships) ? row.relationships : []) {
      if (String(relation?.type || "").toLowerCase() !== "order") continue;
      for (const value of [relation.id, relation.record_id].map(text).filter(Boolean)) authoritative.push({ field: "related_order_id", value });
    }
  }
  const eventScope = [...evidence, ...authoritative.filter((ref) => ref.field === "platform_order_id").map((ref) => encodedScope(ref.value)).filter(Boolean)];
  const scopeKeys = ["organization_id", "workspace_id", "connection_id", "provider_account_id", "platform"];
  const numbers = values(evidence, "order_id");
  const sources = [...values(evidence, "source_platform"), ...values(evidence, "platform")].map((value) => value.toLowerCase());
  const matches = orders.filter((order) => {
    const orderScope = [order, encodedScope(order.platform_order_id)].filter(Boolean);
    for (const key of scopeKeys) {
      const supplied = values(eventScope, key), expected = values(orderScope, key);
      if (supplied.length > 1 || expected.length > 1 || (supplied.length && (expected.length !== 1 || supplied[0] !== expected[0]))) return false;
    }
    if (authoritative.length) {
      // Every authoritative identifier must agree. A mismatch or unavailable
      // identifier cannot be rescued by an overlapping human-readable number.
      return authoritative.every((ref) => ref.field === "related_order_id"
        ? [order.platform_order_id, order.canonical_order_id, order.id].map(text).filter(Boolean).includes(ref.value)
        : text(order[ref.field]) === ref.value);
    }
    const connection = values(eventScope, "connection_id"), account = values(eventScope, "provider_account_id");
    const provider = values(orderScope, "platform");
    return connection.length === 1 && account.length === 1
      && sources.length > 0 && sources.every((source) => source === provider[0]?.toLowerCase())
      && provider.length === 1 && numbers.length === 1 && numbers[0] === text(order.order_id);
  });
  return matches.length === 1 ? matches[0] : null;
}
