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
  createIdentityResolutionDebugMetrics,
  createIdentityService,
  createSupabaseIdentityRepository,
  resolveIdentityForSourceRecord,
} from "./identity-service.ts";
import {
  browserEventPersonAttributes,
  browserIdentityIdentifiers,
} from "./browser-events.ts";

class MemoryIdentityRepository implements IdentityRepository {
  people: IdentityPerson[] = [];
  identifiers: IdentityIdentifier[] = [];
  events: any[] = [];
  merges: any[] = [];
  nextPerson = 1;
  nextIdentifier = 1;
  nextEvent = 1;
  nextMerge = 1;
  calls = {
    createPerson: 0,
    updatePerson: 0,
    getPerson: 0,
    listPeopleByIds: 0,
    findIdentifiers: [] as number[],
    attachIdentifier: 0,
    updateIdentifier: 0,
    getPersonIdentifiers: 0,
    insertResolutionEvent: 0,
  };

  resetCalls() {
    this.calls = {
      createPerson: 0,
      updatePerson: 0,
      getPerson: 0,
      listPeopleByIds: 0,
      findIdentifiers: [],
      attachIdentifier: 0,
      updateIdentifier: 0,
      getPersonIdentifiers: 0,
      insertResolutionEvent: 0,
    };
  }

  async createPerson(args: Partial<IdentityPerson> & { workspace_id: string }) {
    this.calls.createPerson += 1;
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
    this.calls.updatePerson += 1;
    const person = this.people.find((item) => item.workspace_id === workspaceId && item.id === personId);
    if (!person) return null;
    Object.assign(person, patch);
    return person;
  }

  async getPerson(workspaceId: string, personId: string) {
    this.calls.getPerson += 1;
    return this.people.find((person) => person.workspace_id === workspaceId && person.id === personId) || null;
  }

  async listPeopleByIds(workspaceId: string, personIds: string[]) {
    this.calls.listPeopleByIds += 1;
    return this.people.filter((person) => person.workspace_id === workspaceId && personIds.includes(person.id));
  }

  async findIdentifiers(workspaceId: string, identifiers: Array<{ identifier_type: any; normalized_value: string }>) {
    this.calls.findIdentifiers.push(identifiers.length);
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
    this.calls.attachIdentifier += 1;
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
    this.calls.updateIdentifier += 1;
    const identifier = this.identifiers.find((item) => item.workspace_id === workspaceId && item.id === identifierId);
    if (!identifier) return null;
    Object.assign(identifier, patch);
    return identifier;
  }

  async getPersonIdentifiers(workspaceId: string, personId: string) {
    this.calls.getPersonIdentifiers += 1;
    return this.identifiers.filter((identifier) => identifier.workspace_id === workspaceId && identifier.person_id === personId);
  }

  async insertResolutionEvent(event: any) {
    this.calls.insertResolutionEvent += 1;
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

class FakeSupabaseQuery {
  private operation: "select" | "update" | "insert" | null = null;
  private payload: any = null;
  filters: Array<{ method: string; column: string; value: any }> = [];
  private owner: FakeSupabaseClient;
  private table: string;

  constructor(owner: FakeSupabaseClient, table: string) {
    this.owner = owner;
    this.table = table;
  }

  select() {
    if (!this.operation) this.operation = "select";
    return this;
  }

  update(patch: any) {
    this.operation = "update";
    this.payload = patch;
    this.owner.updates.push({ table: this.table, patch });
    return this;
  }

  insert(row: any) {
    this.operation = "insert";
    this.payload = row;
    this.owner.inserts.push({ table: this.table, row });
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ method: "eq", column, value });
    this.owner.filters.push({ table: this.table, method: "eq", column, value });
    return this;
  }

  in(column: string, value: any) {
    this.filters.push({ method: "in", column, value });
    this.owner.filters.push({ table: this.table, method: "in", column, value });
    return this;
  }

  maybeSingle() {
    return this;
  }

  single() {
    return this;
  }

  then(resolve: (value: any) => void, reject: (reason: any) => void) {
    const response = this.response();
    return Promise.resolve(response).then(resolve, reject);
  }

  private response() {
    this.owner.requests.push({
      table: this.table,
      operation: this.operation,
      filters: this.filters.map((filter) => ({ ...filter })),
    });
    if (this.operation === "update") {
      return { data: { ...(this.owner.existingRows[0] || {}), ...this.payload }, error: null };
    }
    if (this.operation === "insert") {
      const error = this.owner.insertErrors.shift();
      if (error) return { data: null, error };
      return { data: { ...this.payload, id: "identifier-inserted" }, error: null };
    }
    const selectRows = this.owner.selectResponses.length
      ? this.owner.selectResponses.shift()
      : this.owner.existingRows;
    return { data: selectRows, error: null };
  }
}

class FakeSupabaseClient {
  updates: Array<{ table: string; patch: any }> = [];
  inserts: Array<{ table: string; row: any }> = [];
  filters: Array<{ table: string; method: string; column: string; value: any }> = [];
  requests: Array<{ table: string; operation: string | null; filters: Array<{ method: string; column: string; value: any }> }> = [];
  existingRows: IdentityIdentifier[];
  selectResponses: IdentityIdentifier[][] = [];
  insertErrors: any[] = [];

  constructor(existingRows: IdentityIdentifier[]) {
    this.existingRows = existingRows;
  }

  from(table: string) {
    return new FakeSupabaseQuery(this, table);
  }
}

function existingEmailIdentifier(overrides: Partial<IdentityIdentifier> = {}): IdentityIdentifier {
  return {
    id: "identifier-1",
    workspace_id: "default",
    person_id: "person-1",
    identifier_type: "email",
    raw_value: "buyer@example.com",
    normalized_value: "buyer@example.com",
    normalized_hash: "hash-email",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:124726",
    source_connector_id: "identity-backfill-platform-orders",
    verification_status: "observed",
    confidence: 0.9,
    is_primary: true,
    first_seen_at: "2026-07-05T17:41:55.000Z",
    last_seen_at: "2026-07-05T17:41:56.000Z",
    created_at: "2026-07-05T17:41:55.000Z",
    updated_at: "2026-07-05T17:41:56.000Z",
    metadata: {},
    ...overrides,
  };
}

function attachEmailArgs(overrides: Partial<Omit<IdentityIdentifier, "id" | "created_at" | "updated_at">> = {}): Omit<IdentityIdentifier, "id" | "created_at" | "updated_at"> {
  return {
    workspace_id: "default",
    person_id: "person-1",
    identifier_type: "email",
    raw_value: "buyer@example.com",
    normalized_value: "buyer@example.com",
    normalized_hash: "hash-email",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:124727",
    source_connector_id: "identity-backfill-platform-orders",
    verification_status: "observed",
    confidence: 0.9,
    is_primary: false,
    first_seen_at: "2026-07-05T17:41:56.000Z",
    last_seen_at: "2026-07-05T17:41:56.000Z",
    metadata: {},
    ...overrides,
  };
}

function uniqueIdentifierViolationError(overrides: Record<string, any> = {}) {
  return {
    code: "23505",
    message: 'duplicate key value violates unique constraint "person_identifiers_active_value_uidx"',
    details: "Key (workspace_id, identifier_type, normalized_value) already exists.",
    ...overrides,
  };
}

test("supabase repository findIdentifiers batches lookup and preserves exact identifier pairs", async () => {
  const crossedEmailValue = existingEmailIdentifier({
    id: "cross-email",
    identifier_type: "email",
    raw_value: "5551112222",
    normalized_value: "5551112222",
  });
  const crossedPhoneValue = existingEmailIdentifier({
    id: "cross-phone",
    identifier_type: "phone",
    raw_value: "a@example.com",
    normalized_value: "a@example.com",
  });
  const deprecatedExactMatch = existingEmailIdentifier({
    id: "deprecated-email",
    raw_value: "a@example.com",
    normalized_value: "a@example.com",
    verification_status: "deprecated",
  });
  const fakeSupabase = new FakeSupabaseClient([
    crossedEmailValue,
    crossedPhoneValue,
    deprecatedExactMatch,
  ]);
  const repo = createSupabaseIdentityRepository(fakeSupabase);

  const matches = await repo.findIdentifiers("default", [
    { identifier_type: "email", normalized_value: "a@example.com" },
    { identifier_type: "phone", normalized_value: "5551112222" },
  ]);

  assert.equal(matches.length, 0);
  assert.equal(fakeSupabase.requests.length, 1);
  assert.equal(fakeSupabase.requests[0].table, "person_identifiers");
  assert.deepEqual(
    fakeSupabase.requests[0].filters.filter((filter) => filter.method === "in").map((filter) => [filter.column, filter.value]),
    [
      ["identifier_type", ["email", "phone"]],
      ["normalized_value", ["a@example.com", "5551112222"]],
      ["verification_status", ["observed", "verified"]],
    ],
  );
});

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

test("browser identify creates a person and repeat identify reuses it", async () => {
  const repo = new MemoryIdentityRepository();
  const service = createIdentityService(repo);
  const firstPayload = { identity: { email: " Buyer@Example.com ", first_name: "Buyer", last_name: "Example" } };
  const secondPayload = { identity: { email: "buyer@example.com", first_name: "Buyer", last_name: "Example" } };

  const created = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "browser",
    source_record_type: "browser_event",
    source_record_id: "identify-1",
    source_connector_id: "browser-event-normalization",
    identifiers: browserIdentityIdentifiers(firstPayload),
    person_attributes: browserEventPersonAttributes(firstPayload),
    observed_at: "2026-07-23T05:21:00.000Z",
  });

  const repeated = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "browser",
    source_record_type: "browser_event",
    source_record_id: "identify-2",
    source_connector_id: "browser-event-normalization",
    identifiers: browserIdentityIdentifiers(secondPayload),
    person_attributes: browserEventPersonAttributes(secondPayload),
    observed_at: "2026-07-23T05:22:00.000Z",
  });

  assert.equal(created.action, "created_person");
  assert.equal(repeated.action, "matched_existing_person");
  assert.equal(repeated.person_id, created.person_id);
  assert.equal(repo.people.length, 1);
  assert.equal(repo.identifiers.filter((identifier) => identifier.identifier_type === "email").length, 1);
  assert.equal(repo.people[0].first_name, "Buyer");
  assert.equal(repo.people[0].last_name, "Example");
});

test("identity resolution batches ownership lookup and reuses caches during attach", async () => {
  const repo = new MemoryIdentityRepository();
  const metrics = createIdentityResolutionDebugMetrics();
  const service = createIdentityService(repo, { metrics });

  const result = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:cache-create",
    identifiers: [
      { identifier_type: "email", value: "first@example.com" },
      { identifier_type: "email", value: "second@example.com" },
    ],
    observed_at: "2026-07-16T00:00:00.000Z",
  });

  assert.equal(result.action, "created_person");
  assert.deepEqual(repo.calls.findIdentifiers, [2]);
  assert.equal(repo.calls.getPersonIdentifiers, 0);
  assert.equal(repo.calls.attachIdentifier, 2);
  assert.equal(repo.calls.updatePerson, 1);
  assert.equal(repo.calls.insertResolutionEvent, 1);
  assert.equal(repo.identifiers.filter((identifier) => identifier.identifier_type === "email" && identifier.is_primary).length, 1);
  assert.equal(repo.identifiers.find((identifier) => identifier.normalized_value === "first@example.com")?.is_primary, true);
  assert.equal(repo.identifiers.find((identifier) => identifier.normalized_value === "second@example.com")?.is_primary, false);
  assert.deepEqual(metrics.findIdentifiers, {
    calls: 1,
    identifiers_requested: 2,
    rows_returned: 0,
  });
  assert.deepEqual(metrics.getPersonIdentifiers, {
    calls: 0,
    rows_returned: 0,
  });
  assert.equal(metrics.attachIdentifier.calls, 2);
  assert.equal(metrics.attachIdentifier.inserts, 2);
  assert.equal(metrics.attachIdentifier.updates, 0);
  assert.equal(metrics.attachIdentifier.noops, 0);
  assert.equal(metrics.attachIdentifier.conflicts, 0);
  assert.equal(metrics.updatePerson.calls, 1);
  assert.equal(metrics.updatePerson.writes, 1);
  assert.equal(metrics.updatePerson.skipped, 0);
  assert.equal(metrics.syncPrimaryIdentifiers.calls, 1);
  assert.equal(metrics.syncPrimaryIdentifiers.writes, 1);
  assert.equal(metrics.syncPrimaryIdentifiers.skipped, 0);
});

test("identity resolution loads existing person identifiers once and skips unchanged primary sync", async () => {
  const repo = new MemoryIdentityRepository();
  const person = await repo.createPerson({
    workspace_id: "default",
    status: "active",
    primary_email: "buyer@example.com",
    primary_phone: "+14155551212",
    first_seen_at: "2026-07-16T00:00:00.000Z",
    last_seen_at: "2026-07-16T00:00:00.000Z",
  });
  repo.identifiers.push(existingEmailIdentifier({
    id: "identifier-email",
    person_id: person.id,
    raw_value: "buyer@example.com",
    normalized_value: "buyer@example.com",
    source_record_id: "wowboost:cache-existing",
    first_seen_at: "2026-07-16T00:00:00.000Z",
    last_seen_at: "2026-07-16T00:00:00.000Z",
  }));
  repo.identifiers.push(existingEmailIdentifier({
    id: "identifier-phone",
    person_id: person.id,
    identifier_type: "phone",
    raw_value: "(415) 555-1212",
    normalized_value: "+14155551212",
    normalized_hash: "hash-phone",
    source_record_id: "wowboost:cache-existing",
    first_seen_at: "2026-07-16T00:00:00.000Z",
    last_seen_at: "2026-07-16T00:00:00.000Z",
  }));
  repo.resetCalls();
  const metrics = createIdentityResolutionDebugMetrics();
  const service = createIdentityService(repo, { metrics });

  const result = await service.resolveIdentity({
    workspace_id: "default",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:cache-existing",
    identifiers: [
      { identifier_type: "email", value: "buyer@example.com" },
      { identifier_type: "phone", value: "(415) 555-1212", country: "US" },
    ],
    observed_at: "2026-07-16T00:00:00.000Z",
  });

  assert.equal(result.action, "matched_existing_person");
  assert.equal(result.person_id, person.id);
  assert.deepEqual(repo.calls.findIdentifiers, [2]);
  assert.equal(repo.calls.getPersonIdentifiers, 1);
  assert.equal(repo.calls.attachIdentifier, 2);
  assert.equal(repo.calls.updatePerson, 1);
  assert.equal(repo.calls.insertResolutionEvent, 1);
  assert.deepEqual(metrics.findIdentifiers, {
    calls: 1,
    identifiers_requested: 2,
    rows_returned: 2,
  });
  assert.deepEqual(metrics.getPersonIdentifiers, {
    calls: 1,
    rows_returned: 2,
  });
  assert.equal(metrics.attachIdentifier.calls, 2);
  assert.equal(metrics.attachIdentifier.inserts, 0);
  assert.equal(metrics.attachIdentifier.updates, 0);
  assert.equal(metrics.attachIdentifier.noops, 2);
  assert.equal(metrics.attachIdentifier.conflicts, 0);
  assert.equal(metrics.updatePerson.calls, 2);
  assert.equal(metrics.updatePerson.writes, 1);
  assert.equal(metrics.updatePerson.skipped, 1);
  assert.equal(metrics.syncPrimaryIdentifiers.calls, 1);
  assert.equal(metrics.syncPrimaryIdentifiers.writes, 0);
  assert.equal(metrics.syncPrimaryIdentifiers.skipped, 1);
});

test("identity resolution preserves cached cross-person attach conflicts", async () => {
  const repo = new MemoryIdentityRepository();
  const active = await repo.createPerson({ workspace_id: "default", status: "active" });
  const merged = await repo.createPerson({ workspace_id: "default", status: "merged" });
  repo.identifiers.push(existingEmailIdentifier({
    id: "active-email",
    person_id: active.id,
    raw_value: "active@example.com",
    normalized_value: "active@example.com",
  }));
  repo.identifiers.push(existingEmailIdentifier({
    id: "merged-phone",
    person_id: merged.id,
    identifier_type: "phone",
    raw_value: "(415) 555-9999",
    normalized_value: "+14155559999",
    normalized_hash: "hash-conflict-phone",
  }));
  repo.resetCalls();
  const metrics = createIdentityResolutionDebugMetrics();
  const service = createIdentityService(repo, { metrics });

  const result = await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "wowboost:attach-conflict",
    identifiers: [
      { identifier_type: "email", value: "active@example.com" },
      { identifier_type: "phone", value: "(415) 555-9999", country: "US" },
    ],
  });

  assert.equal(result.action, "review_required");
  assert.equal(result.match_reason, "identifier_attachment_conflict");
  assert.deepEqual(repo.calls.findIdentifiers, [2]);
  assert.equal(repo.calls.getPersonIdentifiers, 1);
  assert.equal(metrics.attachIdentifier.conflicts, 1);
  assert.equal(metrics.attachIdentifier.calls, 1);
  assert.equal(repo.events.at(-1)?.resolution_reason, "identifier_attachment_conflict");
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
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.operation_promise" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.operation_promise" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.promise_race" && event.metadata?.promise_race_stage === "before_evaluate"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.promise_race" && event.metadata?.promise_race_stage === "after_constructed"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.construct_args" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.construct_args" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.invoke_repo" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.invoke_repo" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.insert_resolution_event" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.metadata?.identifier_type === "email" && event.metadata?.identifier_value_masked === "d***@example.com"));
  assert.ok(events.some((event) => event.metadata?.identifier_type === "phone" && event.metadata?.identifier_value_masked === "***0101"));
  assert.ok(events.some((event) => event.metadata?.identifier_value_hash));

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

test("identity persist diagnostics capture synchronous repository call failures", async () => {
  class SyncThrowingAttachRepository extends MemoryIdentityRepository {
    attachIdentifier(): Promise<any> {
      const error = new Error("sync attach failed");
      error.name = "SyncAttachError";
      throw error;
    }
  }

  const repo = new SyncThrowingAttachRepository();
  const events: IdentityDiagnosticEvent[] = [];
  const service = createIdentityService(repo, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  await assert.rejects(async () => await service.resolveIdentity({
    workspace_id: "default",
    source_record_id: "wowboost:sync-error",
    identifiers: [{ identifier_type: "email", value: "sync@example.com" }],
  }), /sync attach failed/);

  const syncError = events.find((event) => event.operation === "identity_resolve.attach_identifier.persist.sync_error");
  assert.equal(syncError?.phase, "error");
  assert.equal(syncError?.metadata?.error_name, "SyncAttachError");
  assert.equal(syncError?.metadata?.error_message, "sync attach failed");
  assert.ok(String(syncError?.metadata?.error_stack || "").includes("sync attach failed"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.construct_args" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.invoke_repo" && event.phase === "before_await"));
  assert.equal(events.some((event) => event.operation === "identity_resolve.attach_identifier.persist.invoke_repo" && event.phase === "after_await"), false);
  assert.equal(JSON.stringify(events).includes("sync@example.com"), false);
});

test("supabase repository attachIdentifier short-circuits unchanged same-person identifiers", async () => {
  const existing = existingEmailIdentifier();
  const fakeSupabase = new FakeSupabaseClient([existing]);
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  const result = await repo.attachIdentifier({
    workspace_id: "default",
    person_id: "person-1",
    identifier_type: "email",
    raw_value: "buyer@example.com",
    normalized_value: "buyer@example.com",
    normalized_hash: "hash-email",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:124727",
    source_connector_id: "identity-backfill-platform-orders",
    verification_status: "observed",
    confidence: 0.9,
    is_primary: false,
    first_seen_at: "2026-07-05T17:41:56.000Z",
    last_seen_at: "2026-07-05T17:41:56.000Z",
    metadata: {},
  });

  assert.equal(result.created, false);
  assert.equal(result.identifier.id, existing.id);
  assert.equal(fakeSupabase.updates.length, 0);
  assert.equal(fakeSupabase.inserts.length, 0);
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.select_existing" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.select_existing" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.entry" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.entry" && event.phase === "after_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.short_circuit_existing" && event.phase === "after_await"));
  assert.equal(events.some((event) => event.operation === "identity_repository.attachIdentifier.update_existing"), false);
  assert.equal(events.some((event) => event.operation === "identity_repository.findIdentifiers.lookup"), false);
  assert.equal(JSON.stringify(events).includes("buyer@example.com"), false);
});

test("supabase repository attachIdentifier emits direct update diagnostics without recursive lookup", async () => {
  const existing = existingEmailIdentifier({ last_seen_at: "2026-07-05T17:41:55.000Z" });
  const fakeSupabase = new FakeSupabaseClient([existing]);
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  const result = await repo.attachIdentifier({
    workspace_id: "default",
    person_id: "person-1",
    identifier_type: "email",
    raw_value: "buyer@example.com",
    normalized_value: "buyer@example.com",
    normalized_hash: "hash-email",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:124727",
    source_connector_id: "identity-backfill-platform-orders",
    verification_status: "observed",
    confidence: 0.9,
    is_primary: false,
    first_seen_at: "2026-07-05T17:41:55.000Z",
    last_seen_at: "2026-07-05T17:41:56.000Z",
    metadata: {},
  });

  assert.equal(result.created, false);
  assert.equal(fakeSupabase.updates.length, 1);
  assert.equal(fakeSupabase.updates[0].table, "person_identifiers");
  assert.equal(fakeSupabase.updates[0].patch.last_seen_at, "2026-07-05T17:41:56.000Z");
  assert.equal(fakeSupabase.inserts.length, 0);
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.update_existing" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.update_existing" && event.phase === "after_await"));
  assert.equal(events.some((event) => event.operation === "identity_repository.updateIdentifier.update"), false);
  assert.equal(events.some((event) => event.operation === "identity_repository.findIdentifiers.lookup"), false);
});

test("supabase repository attachIdentifier emits direct insert diagnostics", async () => {
  const fakeSupabase = new FakeSupabaseClient([]);
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  const result = await repo.attachIdentifier({
    workspace_id: "default",
    person_id: "person-1",
    identifier_type: "email",
    raw_value: "new@example.com",
    normalized_value: "new@example.com",
    normalized_hash: "hash-new-email",
    source_platform: "wowboost",
    source_record_type: "platform_order",
    source_record_id: "wowboost:124727",
    source_connector_id: "identity-backfill-platform-orders",
    verification_status: "observed",
    confidence: 0.9,
    is_primary: true,
    first_seen_at: "2026-07-05T17:41:56.000Z",
    last_seen_at: "2026-07-05T17:41:56.000Z",
    metadata: {},
  });

  assert.equal(result.created, true);
  assert.equal(fakeSupabase.inserts.length, 1);
  assert.equal(fakeSupabase.inserts[0].table, "person_identifiers");
  assert.equal(fakeSupabase.updates.length, 0);
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.insert" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.insert" && event.phase === "after_await"));
  assert.equal(JSON.stringify(events).includes("new@example.com"), false);
});

test("supabase repository attachIdentifier recovers concurrent unique insert conflicts", async () => {
  const winner = existingEmailIdentifier({
    id: "identifier-winner",
    person_id: "person-winner",
    raw_value: "race@example.com",
    normalized_value: "race@example.com",
    normalized_hash: "hash-race-email",
  });
  const fakeSupabase = new FakeSupabaseClient([]);
  fakeSupabase.selectResponses = [[], [winner]];
  fakeSupabase.insertErrors = [uniqueIdentifierViolationError()];
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  const result = await repo.attachIdentifier(attachEmailArgs({
    person_id: "person-loser",
    raw_value: "race@example.com",
    normalized_value: "race@example.com",
    normalized_hash: "hash-race-email",
  }));

  assert.equal(result.created, false);
  assert.equal(result.identifier.id, "identifier-winner");
  assert.equal(result.identifier.person_id, "person-winner");
  assert.equal(fakeSupabase.requests.filter((request) => request.operation === "select").length, 2);
  assert.equal(fakeSupabase.requests.filter((request) => request.operation === "insert").length, 1);
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.concurrent_conflict_lookup" && event.phase === "before_await"));
  assert.ok(events.some((event) => event.operation === "identity_repository.attachIdentifier.concurrent_conflict_recovered" && event.phase === "after_await"));
});

test("supabase repository attachIdentifier does not recover non-unique insert errors", async () => {
  const fakeSupabase = new FakeSupabaseClient([]);
  fakeSupabase.selectResponses = [[]];
  fakeSupabase.insertErrors = [{ code: "PGRST500", message: "database unavailable" }];
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  await assert.rejects(() => repo.attachIdentifier(attachEmailArgs({
    raw_value: "fail@example.com",
    normalized_value: "fail@example.com",
  })), /Identity identifier attach failed: database unavailable/);

  assert.equal(fakeSupabase.requests.filter((request) => request.operation === "select").length, 1);
  assert.equal(events.some((event) => event.operation === "identity_repository.attachIdentifier.concurrent_conflict_lookup"), false);
});

test("supabase repository attachIdentifier retries 23505 recovery before throwing original context", async () => {
  const fakeSupabase = new FakeSupabaseClient([]);
  fakeSupabase.selectResponses = [[], [], [], []];
  fakeSupabase.insertErrors = [uniqueIdentifierViolationError()];
  const events: IdentityDiagnosticEvent[] = [];
  const repo = createSupabaseIdentityRepository(fakeSupabase, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  await assert.rejects(() => repo.attachIdentifier(attachEmailArgs({
    raw_value: "invisible@example.com",
    normalized_value: "invisible@example.com",
  })), /Identity identifier attach failed after concurrent unique conflict recovery/);

  assert.equal(fakeSupabase.requests.filter((request) => request.operation === "select").length, 4);
  assert.deepEqual(
    events
      .filter((event) => event.operation === "identity_repository.attachIdentifier.concurrent_conflict_lookup" && event.phase === "before_await")
      .map((event) => event.metadata?.attempt),
    [1, 2, 3],
  );
  assert.equal(events.some((event) => event.operation === "identity_repository.attachIdentifier.concurrent_conflict_recovered"), false);
});

test("identity resolution adopts concurrent identifier winner and reconciles losing created person", async () => {
  class ConcurrentAttachWinnerRepository extends MemoryIdentityRepository {
    hideInitialLookup = true;
    winningIdentifier: IdentityIdentifier;

    constructor(winningIdentifier: IdentityIdentifier) {
      super();
      this.winningIdentifier = winningIdentifier;
    }

    async findIdentifiers(workspaceId: string, identifiers: Array<{ identifier_type: any; normalized_value: string }>) {
      this.calls.findIdentifiers.push(identifiers.length);
      if (this.hideInitialLookup) {
        this.hideInitialLookup = false;
        return [];
      }
      return this.identifiers.filter((identifier) => (
        identifier.workspace_id === workspaceId &&
        (identifier.verification_status === "observed" || identifier.verification_status === "verified") &&
        identifiers.some((candidate) => (
          candidate.identifier_type === identifier.identifier_type &&
          candidate.normalized_value === identifier.normalized_value
        ))
      ));
    }

    async attachIdentifier() {
      this.calls.attachIdentifier += 1;
      return { identifier: this.winningIdentifier, created: false };
    }
  }

  const winningIdentifier = existingEmailIdentifier({
    id: "identifier-winner",
    person_id: "person-winner",
    raw_value: "race@example.com",
    normalized_value: "race@example.com",
    normalized_hash: "hash-race-email",
  });
  const repo = new ConcurrentAttachWinnerRepository(winningIdentifier);
  repo.people.push({
    id: "person-winner",
    workspace_id: "default",
    status: "active",
    display_name: null,
    primary_email: "race@example.com",
    primary_phone: null,
    first_seen_at: "2026-07-05T00:00:00.000Z",
    last_seen_at: "2026-07-05T00:00:00.000Z",
    merged_into_person_id: null,
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
    metadata: {},
  });
  repo.identifiers.push(winningIdentifier);
  repo.resetCalls();
  const events: IdentityDiagnosticEvent[] = [];
  const service = createIdentityService(repo, {
    timeout_ms: 1000,
    emit: (event) => events.push(event),
  });

  const result = await resolveIdentityForSourceRecord(service, {
    workspace_id: "default",
    connector_id: "identity-backfill-platform-orders",
    connector_job_id: "job-race",
    platform: "wowboost",
    record_type: "platform_order",
    record_id: "wowboost:race",
    identifiers: [{ identifier_type: "email", value: "race@example.com" }],
    observed_at: "2026-07-16T00:00:00.000Z",
  });
  const platformOrder = { platform_order_id: "wowboost:race", person_id: null as string | null };
  platformOrder.person_id = result.person_id;
  const losingPerson = repo.people.find((person) => person.id !== "person-winner");

  assert.equal(result.action, "matched_existing_person");
  assert.equal(result.person_id, "person-winner");
  assert.equal(platformOrder.person_id, "person-winner");
  assert.equal(losingPerson?.status, "merged");
  assert.equal(losingPerson?.merged_into_person_id, "person-winner");
  assert.equal(repo.people.filter((person) => person.status === "active").length, 1);
  assert.equal(repo.identifiers.filter((identifier) => identifier.person_id === losingPerson?.id).length, 0);
  assert.equal(repo.merges.length, 1);
  assert.ok(events.some((event) => event.operation === "identity_resolve.attach_identifier.concurrent_winner_adopted"));
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
