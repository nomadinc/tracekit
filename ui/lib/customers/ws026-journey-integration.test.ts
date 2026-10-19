import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const repo = readFileSync(fileURLToPath(new URL("./production-repository.ts", import.meta.url)), "utf8");
const ui = readFileSync(fileURLToPath(new URL("../../components/customers/customer-workspace.tsx", import.meta.url)), "utf8");
test("repository selects explicit journey and never uses first array entry", () => {
 assert.match(repo, /selectCustomerJourney\(journeyOptions, requestedJourneyId\)/);
 assert.doesNotMatch(repo, /selectedJourney\s*=\s*journeys\[0\]/);
});
test("UI offers selectable canonical journey choices and loading state", () => {
 assert.match(ui, /aria-label="Select canonical journey"/);
 assert.match(ui, /setSelectedJourneyId\(e\.target\.value \|\| null\)/);
 assert.match(ui, /Loading journey/);
});
test("journey detail uses existing scoped customer API", () => {
 assert.match(repo, /encodeURIComponent\(selectedJourney\.id\)/);
 assert.match(repo, /collectCoreTimelinePages/);
 assert.match(repo, /next_cursor/);
 assert.match(repo, /cursor/);
});

test("repository consumes nested Core page cursor rather than assuming top-level cursor", () => {
 assert.match(repo, /page\.page\?\.next_cursor \?\? page\.next_cursor/);
});
test("five-second timestamp proximity cannot link a purchase to an order", () => {
 assert.doesNotMatch(repo, /Math\.abs\(orderTime - eventTime\) <= 5000/);
 assert.match(repo, /hasExactOrderIdentity\(row,/);
 assert.match(repo, /relatedOrders\.length === 1/);
});

test("Customer observed revenue requires valid amount and source currency", () => {
 assert.match(repo, /lifetimeRevenueAvailable: sourceMoney/);
 assert.match(repo, /lifetimeRevenueCurrency: sourceMoney/);
 assert.match(ui, /snapshot\.lifetimeRevenueAvailable === false \|\| !snapshot\.lifetimeRevenueCurrency/);
 assert.match(ui, /currency: snapshot\.lifetimeRevenueCurrency/);
});
test("related Customer orders retain explicit unavailable amount status", () => {
 assert.match(repo, /amountAvailable: sourceMoney/);
 assert.match(repo, /amountCurrency: sourceMoney/);
});

test("related-order rendering gates missing amounts and unknown currency", () => {
 assert.match(ui, /o\.amountAvailable === false \|\| !o\.amountCurrency/);
 assert.match(ui, /currency: o\.amountCurrency/);
 assert.doesNotMatch(ui, /money\(o\.amount\)/);
});

test("actual customer mapper delegates to scoped namespace-safe order matching", () => {
 assert.match(repo, /orders\.filter\(\(order: any\) =>/);
 assert.match(repo, /hasExactOrderIdentity\(row,/);
 assert.match(repo, /canonicalOrderId: order\?\.canonical_order_id/);
 assert.match(repo, /providerOrderId: order\?\.provider_order_id/);
 assert.match(repo, /providerAccountId: String\(order\?\.provider_account_id/);
 assert.match(repo, /relatedOrders\.length === 1 \? relatedOrders\[0\] : null/);
 assert.doesNotMatch(repo, /row\?\.related_order_id \? \[\{ type: "Order"/);
});
