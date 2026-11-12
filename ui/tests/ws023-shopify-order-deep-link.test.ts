import assert from "node:assert/strict";
import test from "node:test";
import { orderDeepLinkHref, parseOrderDeepLink } from "../lib/orders/deep-link";
import { isOpaqueId } from "../lib/navigation/deep-link";

const scoped = "shopify:d69a93dd-98ed-46fd-b486-1a39fb8388dd:d06cd699-6a75-4a92-9942-6c94dc268d3b:gid://shopify/Order/19034706968790";
test("Orders preserves exact scoped Shopify identities through row selection and URL parsing", () => {
  for (const orderId of [scoped, "gid://shopify/Order/19034706968790", "next29:103104", "15f0b290-aaad-4962-b1d6-42f69db3966c"]) {
    const href = orderDeepLinkHref({ orderId });
    assert.equal(parseOrderDeepLink(href.split("?")[1]).orderId, orderId);
    assert.equal(new URL(href, "https://preview.test").pathname, "/orders");
  }
});
test("Shopify Order support does not expand other resource identifiers or admit arbitrary URLs", () => {
  assert.equal(isOpaqueId(scoped), false);
  for (const orderId of ["https://evil.test/order", "gid://shopify/Customer/1", scoped + "?other=tenant", scoped + "#fragment", scoped.replace("19034706968790", "../1"), "shopify:foreign:account:gid://shopify/Order/1"]) {
    assert.equal(new URL(orderDeepLinkHref({ orderId }), "https://preview.test").searchParams.has("order_id"), false);
    assert.equal(parseOrderDeepLink(new URLSearchParams({ order_id: orderId })).orderId, null);
  }
});
