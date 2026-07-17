import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeExternalIdentityIdentifier,
  normalizeIdentityEmail,
  normalizeIdentityIdentifier,
  normalizeIdentityPhone,
} from "./identity-normalization.ts";
import {
  IdentityOperationTimeoutError,
  type IdentityIdentifier,
  type IdentityDiagnosticEvent,
  type IdentityPerson,
  type IdentityRepository,
  createIdentityService,
  resolveIdentityForSourceRecord,
} from "./identity-service.ts";

class MemoryIdentityRepository implements IdentityRepository {
  people: IdentityPerson[] = [];
  identifiers: IdentityIdentifier[] = [];
  events: any[] = [];
  merges: any[] = [];
  nextPerson = 1;
  nextIdentifier = 1;
  nextEvent = 1;
  nextMerge = 1;

  async createPerson(args: Partial<IdentityPerson> & { workspace_id: string }) {
    const now = new Date().toISOString();
    const person: IdentityPerson = {
      id: `person-${this.nextPerson++}`,
      workspace_id: args.workspace_id,
      status: args.status || "active",
      display_name: args.display_name || null,
      primary_email: args.primary_email || null,
      primary_phone: args.primary_phone || null,
      first_name: args.first_name || null,
      last_name: args.last_name || null,
      first_seen_at: args.first_seen_at || now,
      last_seen_at: args.last_seen_at || now,
      merged_into_person_id: args.merged_into_person_id || null,
      created_at: now,
      updated_at: now,
      metadata: args.metadata || {},
    };
    this.people.push(person);
    return person;
  }

  async updatePerson(workspaceId: string, personId: string, patch: Partial<IdentityPerson>) {
    const person = this.people.find((item) => item.workspace_id === workspaceId && item.id === personId);
    if (!person) return null;
    Object.assign(person, patch);
    return person;
  }

  async getPerson(workspaceId: string, personId: string) {
    return this.people.find((person) => person.workspace_id === workspaceId && person.id === personId) || null;
  }

  async listPeopleByIds(workspaceId: string, personIds: string[]) {
    return this.people.filter((person) => person.workspace_id === workspaceId && personIds.includes(person.id));
  }

  async findIdentifiers(workspaceId: string, identifiers: Array<{ identifier_type: any; normalized_value: string }>) {
    return this.identifiers.filter((identifier) => (
      identifier.workspace_id === workspaceId &&
      (identifier.verification_status === "observed" || identifier.verification_status === "verified") &&
      identifiers.some((candidate) => (
        candidate.identifier_type === identifier.identifier_type &&
        candidate.normalized_value === identifier.normalized_value
      ))
    ));
  }

  async attachIdentifier(args: Omit<IdentityIdentifier, "id" | "created_at" | "updated_at">) {
    const existing = this.identifiers.find((identifier) => (
      identifier.workspace_id === args.workspace_id &&
      identifier.identifier_type === args.identifier_type &&
      identifier.normalized_value === args.normalized_value &&
      identifier.verification_status !== "deprecated" &&
      identifier.verification_status !== "disputed"
    ));
    if (existing) {
      if (existing.person_id !== args.person_id) throw new Error("unique identity conflict");
      existing.raw_value = existing.raw_value || args.raw_value;
      existing.last_seen_at = args.last_seen_at;
      existing.source_platform = existing.source_platform || args.source_platform;
      existing.source_record_id = existing.source_record_id || args.source_record_id;
      existing.updated_at = new Date().toISOString();
      return { identifier: existing, created: false };
    }
    const now = new Date().toISOString();
    const identifier: IdentityIdentifier = {
      ...args,
      id: `identifier-${this.nextIdentifier++}`,
      created_at: now,
      updated_at: now,
    };
    this.identifiers.push(identifier);
    return { identifier, created: true };
  }

  async updateIdentifier(workspaceId: string, identifierId: string, patch: Partial<IdentityIdentifier>) {
    const identifier = this.identifiers.find((item) => item.workspace_id === workspaceId && item.id === identifierId);
    if (!identifier) return null;
    Object.assign(identifier, patch);
    return identifier;
  }

  async getPersonIdentifiers(workspaceId: string, personId: string) {
    return this.identifiers.filter((identifier) => identifier.workspace_id === workspaceId && identifier.person_id === personId);
  }

  async insertResolutionEvent(event: any) {
    const row = { ...event, id: `event-${this.nextEvent++}`, created_at: new Date().toISOString() };
    this.events.push(row);
    return row;
  }

  async listResolutionEvents(workspaceId: string, personId: string | null, limit: number, offset: number) {
    return this.events
      .filter((event) => event.workspace_id === workspaceId && (!personId || event.person_id === personId))
      .slice(offset, offset + limit);
  }

  async insertMergeHistory(args: any) {
    const row = { ...args, id: `merge-${this.nextMerge++}`, created_at: new Date().toISOString() };
    this.merges.push(row);
    return row;
  }

  async searchPeople(args: { workspace_id: string; person_id?: string | null; limit: number; offset: number }) {
    return this.people
      .filter((person) => person.workspace_id === args.workspace_id && (!args.person_id || person.id === args.person_id))
      .slice(args.offset, args.offset + args.limit);
  }

  async reviewQueue(args: { workspace_id: string; limit: number; offset: number }) {
    return this.events
      .filter((event) => event.workspace_id === args.workspace_id && ["conflict_detected", "review_required"].includes(event.resolution_action))
      .slice(args.offset, args.offset + args.limit);
  }
}

test("identity normalization is deterministic and conservative", async () => {
  assert.equal((await normalizeIdentityEmail("  USER+tag@Example.com ")).normalized_value, "user+tag@example.com");
  assert.equal((await normalizeIdentityEmail("First.Last@gmail.com")).normalized_value, "first.last@gmail.com");
  assert.equal((await normalizeIdentityEmail("not-an-email")).valid, false);

  assert.deepEqual(await normalizeIdentityPhone("(415) 555-1212", { country: "US" }).then((result) => ({
    valid: result.valid,
    normalized_value: result.normalized_value,
  })), {
    valid: true,
    normalized_value: "+14155551212",
  });
  const unresolvedPhone = await normalizeIdentityPhone("415.555.1212");
  assert.equal(unresolvedPhone.valid, false);
  assert.equal(unresolvedPhone.normalized_value, "4155551212");
  assert.deepEqual(unresolvedPhone.warnings, ["country_context_required"]);

  assert.equal((await normalizeExternalIdentityIdentifier("shopify_customer_id", " AbC123 ")).normalized_value, "AbC123");
  assert.equal((await normalizeExternalIdentityIdentifier("everflow_transaction_id", "66FE31EE-C521-432E-9822-0A07FF85230F")).normalized_value, "66fe31ee-c521-432e-9822-0a07ff85230f");
  assert.equal((await normalizeExternalIdentityIdentifier("external_customer_id", "0")).valid, false);
  assert.equal((await normalizeIdentityIdentifier({ identifier_type: "bogus", value: "x" })).valid, false);
});

test("identity resolution creates matches conflicts and preserves workspace isolation", async () => {
  const repo = new MemoryIdentityRepository();
  const service = createIdentityService(repo);

  const created = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:1",
    identifiers: [
      { identifier_type: "email", value: " Buyer@Example.com " },
      { identifier_type: "phone", value: "(415) 555-1212", country: "US" },
    ],
    person_attributes: { first_name: "Buyer" },
    observed_at: "2026-07-16T00:00:00.000Z",
  });
  assert.equal(created.action, "created_person");
  assert.equal(repo.people.length, 1);
  assert.equal(repo.people[0].primary_email, "buyer@example.com");
  assert.equal(repo.people[0].primary_phone, "+14155551212");

  const repeated = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:1",
    identifiers: [{ identifier_type: "email", value: "buyer@example.com" }],
    observed_at: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(repeated.action, "matched_existing_person");
  assert.equal(repeated.person_id, created.person_id);
  assert.equal(repo.people.length, 1);
  assert.equal(repo.identifiers.filter((identifier) => identifier.identifier_type === "email").length, 1);
  assert.equal(repo.identifiers.find((identifier) => identifier.identifier_type === "email")?.first_seen_at, "2026-07-16T00:00:00.000Z");
  assert.equal(repo.identifiers.find((identifier) => identifier.identifier_type === "email")?.last_seen_at, "2026-07-17T00:00:00.000Z");

  const otherWorkspace = await service.resolveIdentity({
    workspace_id: "other",
    source_record_id: "wowboost:1",
    identifiers: [{ identifier_type: "email", value: "buyer@example.com" }],
  });
  assert.notEqual(otherWorkspace.person_id, created.person_id);

  const platformMatch = await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "shopify:1",
    identifiers: [
      { identifier_type: "email", value: "buyer@example.com" },
      { identifier_type: "shopify_customer_id", value: "gid://shopify/Customer/123", verification_status: "verified" },
    ],
  });
  assert.equal(platformMatch.person_id, created.person_id);
  assert.equal(platformMatch.match_reason, "exact_normalized_email");

  const second = await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "paypal:2",
    identifiers: [{ identifier_type: "paypal_payer_id", value: "PAYER-2", verification_status: "verified" }],
  });
  const conflict = await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "mixed:1",
    identifiers: [
      { identifier_type: "email", value: "buyer@example.com" },
      { identifier_type: "paypal_payer_id", value: "PAYER-2", verification_status: "verified" },
    ],
  });
  assert.equal(second.action, "created_person");
  assert.equal(conflict.action, "review_required");
  assert.equal(conflict.person_id, null);
  assert.equal(repo.events.some((event) => event.resolution_action === "review_required"), true);

  const noIdentifiers = await service.resolveIdentity({ workspace_id: "default", person_attributes: { display_name: "Name Only" } });
  assert.equal(noIdentifiers.action, "no_match");
  const addressOnly = await service.resolveIdentity({ workspace_id: "default", source_record_id: "address:1", metadata: { address: "1 Main" } });
  assert.equal(addressOnly.action, "created_person");
});

test("identity diagnostics identify awaited operations without raw PII", async () => {
  const repo = new MemoryIdentityRepository();
  const events: IdentityDiagnosticEvent[] = [];
  const service = createIdentityService(repo, {
    timeout_ms: 100,
    emit: (event) => {
      events.push(event);
    },
  });

  const result = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:diagnostic",
    identifiers: [
      { identifier_type: "email", value: "diagnostic@example.com" },
      { identifier_type: "phone", value: "(415) 555-0101", country: "US" },
    ],
    person_attributes: { first_name: "Diagnostic" },
  });

  assert.equal(result.action, "created_person");
  assert.ok(events.some((event) => event.operation === "identity_resolve.lookup_identifiers" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.lookup_identifiers" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.create_person" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.insert_resolution_event" && event.phase === "after_await"));

  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("diagnostic@example.com"), false);
  assert.equal(serialized.includes("4155550101"), false);
  assert.equal(serialized.includes("+14155550101"), false);
  assert.equal(serialized.includes("Diagnostic"), false);
});

test("identity diagnostics timeout a never-resolving repository await as transient", async () => {
  class HangingIdentifierRepository extends MemoryIdentityRepository {
    async findIdentifiers(): Promise<IdentityIdentifier[]> {
      return await new Promise<IdentityIdentifier[]>(() => {});
    }
  }

  const repo = new HangingIdentifierRepository();
  const events: IdentityDiagnosticEvent[] = [];
  const service = createIdentityService(repo, {
    timeout_ms: 20,
    emit: (event) => {
      events.push(event);
    },
  });

  const started = Date.now();
  await assert.rejects(async () => await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "wowboost:hang",
    identifiers: [{ identifier_type: "email", value: "hang@example.com" }],
  }), (error: any) => {
    assert.equal(error instanceof IdentityOperationTimeoutError, true);
    assert.equal(error.transient, true);
    assert.equal(error.operation, "identity_resolve.lookup_identifiers");
    return true;
  });
  assert.ok(Date.now() - started < 1000);

  assert.ok(events.some((event) => event.operation === "identity_resolve.lookup_identifiers" && event.phase === "before_await"));
  const timeoutEvent = events.find((event) => event.operation === "identity_resolve.lookup_identifiers" && event.phase === "error");
  assert.equal(timeoutEvent?.timed_out, true);
  assert.equal(timeoutEvent?.error_name, "IdentityOperationTimeoutError");
  assert.equal(JSON.stringify(events).includes("hang@example.com"), false);
});

test("identity identifier attachment and merge framework are safe and auditable", async () => {
  const repo = new MemoryIdentityRepository();
  const service = createIdentityService(repo);
  const source = await service.createPerson({ workspace_id: "default", display_name: "Source" });
  const target = await service.createPerson({ workspace_id: "default", display_name: "Target" });

  await service.attachIdentifier({
    workspace_id: "default",
    person_id: source.id,
    identifier_type: "email",
    value: "source@example.com",
    source_platform: "fixture",
    source_record_id: "source-record",
  });
  await service.attachIdentifier({
    workspace_id: "default",
    person_id: target.id,
    identifier_type: "phone",
    value: "+14155550000",
  });
  await assert.rejects(() => service.attachIdentifier({
    workspace_id: "default",
    person_id: target.id,
    identifier_type: "email",
    value: "source@example.com",
  }), /another active person/);

  const preview = await service.previewMerge({
    workspace_id: "default",
    source_person_id: source.id,
    target_person_id: target.id,
  });
  assert.equal(preview.movable_identifiers.length, 1);
  assert.equal(preview.conflicts.length, 0);

  const merge = await service.mergePeople({
    workspace_id: "default",
    source_person_id: source.id,
    target_person_id: target.id,
    reason: "manual review approved",
    performed_by: "tester",
  });
  assert.equal(merge.merged, true);
  assert.equal((await service.getPerson("default", source.id))?.status, "merged");
  assert.equal((await service.getPersonIdentifiers("default", target.id)).some((identifier) => identifier.normalized_value === "source@example.com"), true);
  assert.equal(repo.merges.length, 1);
  assert.equal(repo.events.some((event) => event.resolution_action === "manually_merged"), true);

  const repeated = await service.mergePeople({
    workspace_id: "default",
    source_person_id: source.id,
    target_person_id: target.id,
    reason: "manual review approved",
  });
  assert.equal(repeated.idempotent, true);

  const other = await service.createPerson({ workspace_id: "other" });
  await assert.rejects(() => service.mergePeople({
    workspace_id: "default",
    source_person_id: target.id,
    target_person_id: other.id,
    reason: "bad merge",
  }), /Both people/);
});

test("connector integration hook links source records without side effects", async () => {
  const repo = new MemoryIdentityRepository();
  const service = createIdentityService(repo);
  const result = await resolveIdentityForSourceRecord(service, {
    workspace_id: "default",
    connector_id: "wowboost",
    connector_job_id: "00000000-0000-0000-0000-000000000001",
    platform: "wowboost",
    record_type: "platform_order",
    record_id: "wowboost:1001",
    identifiers: [
      { identifier_type: "email", value: "shopper@example.com" },
      { identifier_type: "order_customer_id", value: "cust-1001" },
    ],
    observed_at: "2026-07-16T00:00:00.000Z",
  });

  assert.equal(result.action, "created_person");
  assert.equal(result.person_id, "person-1");
  assert.equal(repo.identifiers.length, 2);
  assert.equal(repo.events[0].source_platform, "wowboost");
  assert.equal(repo.events[0].source_record_type, "platform_order");
  assert.equal(repo.events[0].source_record_id, "wowboost:1001");
  assert.equal(repo.events.length, 1);
});

test("identity API-style helpers return compact paginated review data", async () => {
  const repo = new MemoryIdentityRepository();
  const service = createIdentityService(repo);
  await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "one",
    identifiers: [{ identifier_type: "email", value: "one@example.com" }],
  });
  const found = await service.searchPeople({ workspace_id: "default", email: "one@example.com" });
  assert.equal(found.length, 1);
  assert.equal(found[0].primary_email, "one@example.com");
  const history = await service.getIdentityResolutionHistory("default", found[0].id, 10, 0);
  assert.equal(history.length, 1);
  const review = await service.reviewQueue({ workspace_id: "default", limit: 10, offset: 0 });
  assert.equal(review.length, 0);
});
