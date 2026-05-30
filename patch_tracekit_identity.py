from pathlib import Path

path = Path("api/src/index.ts")
if not path.exists():
    raise SystemExit("Run this from ~/Downloads/tracekit-starter. Could not find api/src/index.ts")

text = path.read_text()
changes = []

helpers = '\nfunction normalizeEmail(v: any) {\n  const email = String(v ?? "").trim().toLowerCase();\n  return email && email.includes("@") ? email : "";\n}\n\nasync function sha256Hex(v: string) {\n  if (!v) return "";\n  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));\n  return Array.from(new Uint8Array(buf))\n    .map((b) => b.toString(16).padStart(2, "0"))\n    .join("");\n}\n\nasync function emailIdentityFields(emailRaw: any) {\n  const email = String(emailRaw ?? "").trim();\n  const emailNorm = normalizeEmail(email);\n  const emailHash = emailNorm ? await sha256Hex(emailNorm) : "";\n\n  return {\n    customer_email: email || null,\n    customer_email_normalized: emailNorm || null,\n    customer_email_hash: emailHash || null,\n  };\n}\n'

if "function normalizeEmail(v: any)" not in text:
    anchor = "const wowSuiteNormalizeStatus = normalizeOrderStatus;"
    if anchor not in text:
        raise SystemExit("Could not find helper insertion point: const wowSuiteNormalizeStatus = normalizeOrderStatus;")
    text = text.replace(anchor, helpers + "\n" + anchor)
    changes.append("added email helper functions")

# CheckoutChamp function async + return enrichment.
text = text.replace("function normalizeCheckoutChampOrder(order: any)", "async function normalizeCheckoutChampOrder(order: any)")
old_cc_return = '  return {\n    platform: "checkoutchamp",\n    platform_order_id: `checkoutchamp:${id}`,\n    order_ts: ts,\n    status,\n    gross_amount: gross,\n    currency: pickField(order, ["currency", "currencyCode"]) || "USD",\n  };'
new_cc_return = '  const emailFields = await emailIdentityFields(\n    pickField(order, ["email", "customerEmail", "emailAddress", "shipEmail", "billingEmail"])\n  );\n\n  return {\n    platform: "checkoutchamp",\n    platform_order_id: `checkoutchamp:${id}`,\n    order_ts: ts,\n    status,\n    gross_amount: gross,\n    currency: pickField(order, ["currency", "currencyCode"]) || "USD",\n\n    ...emailFields,\n    transaction_id: pickField(order, ["transactionId", "transaction_id", "authId", "orderId"]) || null,\n    affiliate_id: pickField(order, ["affiliateId", "affiliate_id"]) || null,\n    source_id: pickField(order, ["sourceId", "source_id"]) || null,\n    sub1: pickField(order, ["sub1", "s1", "S1"]) || null,\n    sub2: pickField(order, ["sub2", "s2", "S2"]) || null,\n    sub3: pickField(order, ["sub3", "s3", "S3"]) || null,\n    sub4: pickField(order, ["sub4", "s4", "S4"]) || null,\n    sub5: pickField(order, ["sub5", "s5", "S5"]) || null,\n    raw_json: order,\n  };'
if old_cc_return in text:
    text = text.replace(old_cc_return, new_cc_return, 1)
    changes.append("patched CheckoutChamp return fields")

old_cc_map = 'const rows = dedupePlatformOrders(rawRows.map(normalizeCheckoutChampOrder).filter(Boolean));'
new_cc_map = 'const normalizedRows = await Promise.all(rawRows.map((o: any) => normalizeCheckoutChampOrder(o)));\n    const rows = dedupePlatformOrders(normalizedRows.filter(Boolean));'
if old_cc_map in text:
    text = text.replace(old_cc_map, new_cc_map)
    changes.append("patched CheckoutChamp async mapper")

# WowPay full function replacement.
wp_start = text.find("async function runWowPayImportPage(")
wp_end = text.find("\nfunction b64ToU8", wp_start)
if wp_start != -1 and wp_end != -1:
    wp_current = text[wp_start:wp_end]
    if "customer_email_normalized" not in wp_current and "...emailFields" not in wp_current:
        wp_new = 'async function runWowPayImportPage(env: Env, args: { from: string; to: string; page: number; pageSize?: number }) {\n  const supabase = getSupabase(env);\n  const pageSize = Math.max(1, Math.min(1000, Number(args.pageSize ?? 1000)));\n\n  const creds = await getLatestCredential(env, "wowpay");\n  if (!creds) throw new Error("WowPay not connected.");\n\n  const authBase = String((creds as any).base_url || env.DEFAULT_WOWSUITE_AUTH_BASE || DEFAULT_WOWSUITE_AUTH_BASE).replace(/\\/+$/, "");\n  const username = String((creds as any).username ?? "").trim();\n  const password = await decryptSecretFromCredRow(env, creds as any);\n  const bearer = await wowSuiteGetBearerToken({ authBase, username, password });\n\n  const url = new URL(`${authBase}/order/${args.page}/${pageSize}`);\n  url.searchParams.set("StartDate", `${args.from} 00:00:00`);\n  url.searchParams.set("EndDate", `${args.to} 23:59:59`);\n\n  const res = await fetch(url.toString(), {\n    headers: { Authorization: `bearer ${bearer}`, Accept: "application/json" },\n  });\n\n  const text = await readTextSafe(res);\n  if (!res.ok) throw new Error(`WowPay order query failed ${res.status}: ${text.slice(0, 300)}`);\n\n  const js = safeJsonParse(text);\n  if (!js) throw new Error(`WowPay returned invalid JSON: ${text.slice(0, 300)}`);\n\n  const orders = Array.isArray(js.customerOrders) ? js.customerOrders : Array.isArray(js.orders) ? js.orders : [];\n\n  const upserts = await Promise.all(\n    orders.map(async (o: any) => {\n      const orderId = String(o.orderId ?? o.orderNumber ?? "").trim();\n      if (!orderId) return null;\n\n      const receipts = Array.isArray(o.receipts) ? o.receipts : [];\n      const receipt = receipts[0] || {};\n      const status = wowSuiteNormalizeStatus(receipt.paymentStatus || o.orderStatus);\n\n      let gross = parseMoneyMaybe(receipt.amountUSD ?? receipt.amount ?? o.productPrice);\n      if (gross == null) gross = 0;\n      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {\n        gross = -Math.abs(gross);\n      }\n\n      const emailFields = await emailIdentityFields(\n        o.email || o.customerEmail || o.customer?.email || receipt.email\n      );\n\n      return {\n        platform: wowSuiteKey("wowpay"),\n        platform_order_id: `${wowSuiteKey("wowpay")}:${orderId}`,\n        order_ts: parseDateToIsoMaybe(receipt.createDate || o.orderDate || o.lastUpdateDate) || `${args.from}T00:00:00.000Z`,\n        status,\n        gross_amount: gross,\n        currency: receipt.currencyCode || o.currencyCode || "USD",\n\n        ...emailFields,\n        transaction_id: receipt.transactionId || receipt.transactionID || o.transactionId || null,\n        affiliate_id: o.affiliateId || o.affiliateID || o.affiliate_id || null,\n        source_id: o.sourceId || o.sourceID || o.source_id || null,\n        sub1: o.s1 || o.S1 || o.sub1 || null,\n        sub2: o.s2 || o.S2 || o.sub2 || null,\n        sub3: o.s3 || o.S3 || o.sub3 || null,\n        sub4: o.s4 || o.S4 || o.sub4 || null,\n        sub5: o.s5 || o.S5 || o.sub5 || null,\n        raw_json: o,\n      };\n    })\n  );\n\n  const deduped = dedupePlatformOrders(upserts.filter(Boolean));\n\n  if (deduped.length) {\n    const { error } = await supabase.from("platform_orders").upsert(deduped as any[], { onConflict: "platform_order_id" });\n    if (error) throw new Error(error.message);\n  }\n\n  return {\n    fetched: orders.length,\n    upserted: deduped.length,\n    page: args.page,\n    pageSize,\n    hasMore: Boolean(js?.paging?.nextPage) || orders.length >= pageSize,\n    nextPage: (Boolean(js?.paging?.nextPage) || orders.length >= pageSize) ? args.page + 1 : null,\n  };\n}\n'
        text = text[:wp_start] + wp_new + text[wp_end:]
        changes.append("patched WowPay function")

# Patch every plain WowBoost parsed.rows mapper that has not already been patched.
old_wb = '  const upserts = parsed.rows\n    .map((r) => {\n      const orderId =\n        pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||\n        pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);\n\n      if (!orderId) return null;\n\n      const status = wowSuiteNormalizeStatus(\n        pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||\n          pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])\n      );\n\n      let gross = parseMoneyMaybe(\n        pickField(r, ["Amount USD", "Amount", "Order Price USD", "Order Price", "Total", "OrderTotal"])\n      );\n\n      if (gross == null) gross = 0;\n      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {\n        gross = -Math.abs(gross);\n      }\n\n      const isoTs =\n        parseDateToIsoMaybe(\n          pickField(r, ["Order Create Date", "Updated Date", "Create Date (Receipts)", "OrderDate", "Date"])\n        ) || `${args.from}T00:00:00.000Z`;\n\n      return {\n        platform: wowSuiteKey("wowboost"),\n        platform_order_id: `${wowSuiteKey("wowboost")}:${orderId}`,\n        order_ts: isoTs,\n        status,\n        gross_amount: gross,\n        currency: pickField(r, ["Currency Code", "Currency", "currencyCode"]) || "USD",\n      };\n    })\n    .filter(Boolean);\n\n  const deduped = dedupePlatformOrders(upserts);'
new_wb = '  const upserts = await Promise.all(\n    parsed.rows.map(async (r) => {\n      const orderId =\n        pickField(r, ["Order ID", "OrderId", "OrderID", "order_id", "Id", "ID"]) ||\n        pickField(r, ["Order Number", "OrderNumber", "orderNumber"]);\n\n      if (!orderId) return null;\n\n      const status = wowSuiteNormalizeStatus(\n        pickField(r, ["Order Status Name", "OrderStatus", "orderStatus", "Status", "status"]) ||\n          pickField(r, ["Receipt Status Name", "PaymentStatus", "paymentStatus"])\n      );\n\n      let gross = parseMoneyMaybe(\n        pickField(r, ["Amount USD", "Amount", "Order Price USD", "Order Price", "Total", "OrderTotal"])\n      );\n\n      if (gross == null) gross = 0;\n      if ((status === "REFUNDED" || status === "CHARGEBACK" || status === "CANCELLED") && gross > 0) {\n        gross = -Math.abs(gross);\n      }\n\n      const isoTs =\n        parseDateToIsoMaybe(\n          pickField(r, ["Order Create Date", "Updated Date", "Create Date (Receipts)", "OrderDate", "Date"])\n        ) || `${args.from}T00:00:00.000Z`;\n\n      const emailFields = await emailIdentityFields(pickField(r, ["Email", "email"]));\n\n      return {\n        platform: wowSuiteKey("wowboost"),\n        platform_order_id: `${wowSuiteKey("wowboost")}:${orderId}`,\n        order_ts: isoTs,\n        status,\n        gross_amount: gross,\n        currency: pickField(r, ["Currency Code", "Currency", "currencyCode"]) || "USD",\n\n        ...emailFields,\n        transaction_id: pickField(r, ["TransactionId", "Transaction ID", "transaction_id"]) || null,\n        affiliate_id: pickField(r, ["Affiliate ID", "AffiliateId", "affiliate_id"]) || null,\n        source_id: null,\n        sub1: pickField(r, ["S1", "sub1"]) || null,\n        sub2: pickField(r, ["S2", "sub2"]) || null,\n        sub3: pickField(r, ["S3", "sub3"]) || null,\n        sub4: pickField(r, ["S4", "sub4"]) || null,\n        sub5: pickField(r, ["S5", "sub5"]) || null,\n        raw_json: r,\n      };\n    })\n  );\n\n  const deduped = dedupePlatformOrders(upserts.filter(Boolean));'
count_wb = text.count(old_wb)
if count_wb:
    text = text.replace(old_wb, new_wb)
    changes.append(f"patched {count_wb} WowBoost mapper block(s)")

path.write_text(text)

print("Patched api/src/index.ts")
for c in changes:
    print("-", c)
if not changes:
    print("No changes made. The file may already be patched or has unexpected formatting.")
print("Next:")
print("  cd api")
print("  npx wrangler deploy")
