import {
  type IdentityIdentifierType,
  type IdentityNormalizationResult,
  cleanText,
  isIdentityIdentifierType,
  normalizeIdentityIdentifier,
} from "./identity-normalization.ts";

export type IdentityPerson = {
  id: string;
  workspace_id: string;
  status: "active" | "merged" | "suppressed" | "review_required";
  display_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  merged_into_person_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, any>;
};

export type IdentityIdentifier = {
  id: string;
  workspace_id: string;
  person_id: string;
  identifier_type: IdentityIdentifierType;
  raw_value?: string | null;
  normalized_value: string;
  normalized_hash?: string | null;
  source_platform?: string | null;
  source_record_type?: string | null;
  source_record_id?: string | null;
  source_connector_id?: string | null;
  verification_status: "observed" | "verified" | "disputed" | "deprecated";
  confidence?: number | null;
  is_primary: boolean;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, any>;
};

export type IdentityResolutionEvent = {
  id?: string;
  workspace_id: string;
  person_id?: string | null;
  candidate_person_ids?: string[];
  input_identifiers: any[];
  resolution_action:
    | "created_person"
    | "matched_existing_person"
    | "attached_identifier"
    | "conflict_detected"
    | "review_required"
    | "manually_merged"
    | "merge_reversed"
    | "no_match";
  resolution_reason: string;
  confidence?: number | null;
  source_platform?: string | null;
  source_record_type?: string | null;
  source_record_id?: string | null;
  connector_job_id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, any>;
};

export type IdentityInputIdentifier = {
  identifier_type: IdentityIdentifierType | string;
  value?: unknown;
  raw_value?: unknown;
  verification_status?: "observed" | "verified" | "disputed" | "deprecated";
  confidence?: number | null;
  country?: string | null;
  metadata?: Record<string, any>;
};

export type ResolveIdentityInput = {
  workspace_id?: string | null;
  identifiers?: IdentityInputIdentifier[];
  source_platform?: string | null;
  source_record_type?: string | null;
  source_record_id?: string | null;
  source_connector_id?: string | null;
  connector_job_id?: string | null;
  person_attributes?: {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  observed_at?: string | null;
  metadata?: Record<string, any>;
};

export type NormalizedIdentityIdentifier = IdentityNormalizationResult & {
  identifier_type: IdentityIdentifierType;
  verification_status: "observed" | "verified" | "disputed" | "deprecated";
  confidence: number | null;
  metadata: Record<string, any>;
};

export type IdentityResolutionResult = {
  person_id: string | null;
  action: "created_person" | "matched_existing_person" | "review_required" | "no_match";
  confidence: number | null;
  match_reason: string;
  matched_identifiers: NormalizedIdentityIdentifier[];
  attached_identifiers: IdentityIdentifier[];
  conflicts: Array<{
    identifier_type: string;
    normalized_value: string;
    candidate_person_ids: string[];
  }>;
  review_required: boolean;
};

export type IdentityRepository = {
  createPerson(args: Partial<IdentityPerson> & { workspace_id: string }): Promise<IdentityPerson>;
  updatePerson(workspaceId: string, personId: string, patch: Partial<IdentityPerson>): Promise<IdentityPerson | null>;
  getPerson(workspaceId: string, personId: string): Promise<IdentityPerson | null>;
  listPeopleByIds(workspaceId: string, personIds: string[]): Promise<IdentityPerson[]>;
  findIdentifiers(workspaceId: string, identifiers: Array<{ identifier_type: IdentityIdentifierType; normalized_value: string }>): Promise<IdentityIdentifier[]>;
  attachIdentifier(args: Omit<IdentityIdentifier, "id" | "created_at" | "updated_at">): Promise<{ identifier: IdentityIdentifier; created: boolean }>;
  updateIdentifier(workspaceId: string, identifierId: string, patch: Partial<IdentityIdentifier>): Promise<IdentityIdentifier | null>;
  getPersonIdentifiers(workspaceId: string, personId: string): Promise<IdentityIdentifier[]>;
  insertResolutionEvent(event: Omit<IdentityResolutionEvent, "id" | "created_at">): Promise<IdentityResolutionEvent>;
  listResolutionEvents(workspaceId: string, personId: string | null, limit: number, offset: number): Promise<IdentityResolutionEvent[]>;
  insertMergeHistory(args: {
    workspace_id: string;
    source_person_id: string;
    target_person_id: string;
    reason: string;
    performed_by?: string | null;
    metadata?: Record<string, any>;
  }): Promise<Record<string, any>>;
  searchPeople(args: { workspace_id: string; person_id?: string | null; limit: number; offset: number }): Promise<IdentityPerson[]>;
  reviewQueue(args: { workspace_id: string; limit: number; offset: number }): Promise<IdentityResolutionEvent[]>;
};

const PLATFORM_CUSTOMER_TYPES = new Set<IdentityIdentifierType>([
  "shopify_customer_id",
  "woocommerce_customer_id",
  "checkoutchamp_customer_id",
  "fanbasis_customer_id",
  "order_customer_id",
  "external_customer_id",
]);

const PAYMENT_CUSTOMER_TYPES = new Set<IdentityIdentifierType>([
  "paypal_payer_id",
  "stripe_customer_id",
]);

function nowIso() {
  return new Date().toISOString();
}

function workspace(value: unknown) {
  return cleanText(value) || "default";
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function identifierPriority(type: IdentityIdentifierType) {
  if (PLATFORM_CUSTOMER_TYPES.has(type)) return 100;
  if (PAYMENT_CUSTOMER_TYPES.has(type)) return 90;
  if (type === "email") return 80;
  if (type === "phone") return 70;
  return 50;
}

function confidenceForIdentifier(type: IdentityIdentifierType) {
  if (PLATFORM_CUSTOMER_TYPES.has(type)) return 0.99;
  if (PAYMENT_CUSTOMER_TYPES.has(type)) return 0.98;
  if (type === "email") return 0.9;
  if (type === "phone") return 0.85;
  return 0.75;
}

function bestMatchReason(identifiers: NormalizedIdentityIdentifier[]) {
  const best = [...identifiers].sort((a, b) => identifierPriority(b.identifier_type) - identifierPriority(a.identifier_type))[0];
  if (!best) return { reason: "no_valid_identifiers", confidence: null };
  if (PLATFORM_CUSTOMER_TYPES.has(best.identifier_type)) return { reason: `exact_${best.identifier_type}`, confidence: confidenceForIdentifier(best.identifier_type) };
  if (PAYMENT_CUSTOMER_TYPES.has(best.identifier_type)) return { reason: `exact_${best.identifier_type}`, confidence: confidenceForIdentifier(best.identifier_type) };
  if (best.identifier_type === "email") return { reason: "exact_normalized_email", confidence: confidenceForIdentifier(best.identifier_type) };
  if (best.identifier_type === "phone") return { reason: "exact_normalized_phone", confidence: confidenceForIdentifier(best.identifier_type) };
  return { reason: `exact_${best.identifier_type}`, confidence: confidenceForIdentifier(best.identifier_type) };
}

function matchedInputIdentifiers(
  identifiers: NormalizedIdentityIdentifier[],
  matches: IdentityIdentifier[],
) {
  if (!matches.length) return [];
  const matchedKeys = new Set(matches.map((match) => `${match.identifier_type}:${match.normalized_value}`));
  return identifiers.filter((identifier) => matchedKeys.has(`${identifier.identifier_type}:${identifier.normalized_value}`));
}

function eventIdentifiers(identifiers: NormalizedIdentityIdentifier[]) {
  return identifiers.map((identifier) => ({
    identifier_type: identifier.identifier_type,
    normalized_value: identifier.normalized_value,
    normalized_hash: identifier.normalized_hash,
    valid: identifier.valid,
    warnings: identifier.warnings,
  }));
}

async function normalizeInputIdentifiers(input: ResolveIdentityInput) {
  const normalized: NormalizedIdentityIdentifier[] = [];
  for (const identifier of input.identifiers || []) {
    const type = cleanText(identifier.identifier_type);
    if (!isIdentityIdentifierType(type)) continue;
    const value = identifier.value ?? identifier.raw_value;
    const result = await normalizeIdentityIdentifier({
      identifier_type: type,
      value,
      country: identifier.country,
    });
    if (!result.identifier_type || !result.valid) continue;
    normalized.push({
      identifier_type: result.identifier_type,
      raw_value: result.raw_value,
      normalized_value: result.normalized_value,
      normalized_hash: result.normalized_hash,
      valid: result.valid,
      warnings: result.warnings,
      verification_status: identifier.verification_status || "observed",
      confidence: identifier.confidence ?? confidenceForIdentifier(result.identifier_type),
      metadata: identifier.metadata || {},
    });
  }
  return normalized;
}

function compactPerson(person: IdentityPerson | null) {
  if (!person) return null;
  return {
    id: person.id,
    workspace_id: person.workspace_id,
    status: person.status,
    display_name: person.display_name || null,
    primary_email: person.primary_email || null,
    primary_phone: person.primary_phone || null,
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    first_seen_at: person.first_seen_at || null,
    last_seen_at: person.last_seen_at || null,
    merged_into_person_id: person.merged_into_person_id || null,
  };
}

function compactIdentifier(identifier: IdentityIdentifier) {
  return {
    id: identifier.id,
    person_id: identifier.person_id,
    identifier_type: identifier.identifier_type,
    normalized_value: identifier.normalized_value,
    normalized_hash: identifier.normalized_hash || null,
    verification_status: identifier.verification_status,
    confidence: identifier.confidence ?? null,
    is_primary: Boolean(identifier.is_primary),
    source_platform: identifier.source_platform || null,
    source_record_type: identifier.source_record_type || null,
    source_record_id: identifier.source_record_id || null,
    source_connector_id: identifier.source_connector_id || null,
    first_seen_at: identifier.first_seen_at || null,
    last_seen_at: identifier.last_seen_at || null,
  };
}

export function createIdentityService(repo: IdentityRepository) {
  async function syncPrimaryIdentifiers(workspaceId: string, personId: string) {
    const identifiers = await repo.getPersonIdentifiers(workspaceId, personId);
    const usable = identifiers.filter((identifier) => identifier.verification_status !== "deprecated" && identifier.verification_status !== "disputed");
    const primaryEmail = usable.find((identifier) => identifier.identifier_type === "email" && identifier.is_primary) ||
      usable.find((identifier) => identifier.identifier_type === "email");
    const primaryPhone = usable.find((identifier) => identifier.identifier_type === "phone" && identifier.is_primary) ||
      usable.find((identifier) => identifier.identifier_type === "phone");
    await repo.updatePerson(workspaceId, personId, {
      primary_email: primaryEmail?.normalized_value || null,
      primary_phone: primaryPhone?.normalized_value || null,
      updated_at: nowIso(),
    } as any);
  }

  async function attachNormalizedIdentifier(args: {
    workspace_id: string;
    person_id: string;
    identifier: NormalizedIdentityIdentifier;
    input: ResolveIdentityInput;
    observed_at: string;
  }) {
    const existing = await repo.findIdentifiers(args.workspace_id, [{
      identifier_type: args.identifier.identifier_type,
      normalized_value: args.identifier.normalized_value,
    }]);
    const activeExisting = existing.filter((identifier) => identifier.verification_status === "observed" || identifier.verification_status === "verified");
    const conflicting = activeExisting.find((identifier) => identifier.person_id !== args.person_id);
    if (conflicting) return { attached: null, conflict_person_id: conflicting.person_id };

    const hasPrimary = (await repo.getPersonIdentifiers(args.workspace_id, args.person_id))
      .some((identifier) => (
        identifier.identifier_type === args.identifier.identifier_type &&
        identifier.is_primary &&
        identifier.verification_status !== "deprecated" &&
        identifier.verification_status !== "disputed"
      ));

    const result = await repo.attachIdentifier({
      workspace_id: args.workspace_id,
      person_id: args.person_id,
      identifier_type: args.identifier.identifier_type,
      raw_value: args.identifier.raw_value,
      normalized_value: args.identifier.normalized_value,
      normalized_hash: args.identifier.normalized_hash,
      source_platform: args.input.source_platform || null,
      source_record_type: args.input.source_record_type || null,
      source_record_id: args.input.source_record_id || null,
      source_connector_id: args.input.source_connector_id || null,
      verification_status: args.identifier.verification_status,
      confidence: args.identifier.confidence,
      is_primary: !hasPrimary && (args.identifier.identifier_type === "email" || args.identifier.identifier_type === "phone"),
      first_seen_at: args.observed_at,
      last_seen_at: args.observed_at,
      metadata: {
        ...args.identifier.metadata,
        source: "identity_service_v1",
      },
    });
    return { attached: result.identifier, conflict_person_id: null };
  }

  async function resolveIdentity(input: ResolveIdentityInput): Promise<IdentityResolutionResult> {
    const workspaceId = workspace(input.workspace_id);
    const observedAt = cleanText(input.observed_at) || nowIso();
    const normalized = await normalizeInputIdentifiers(input);

    if (!normalized.length && !cleanText(input.source_record_id)) {
      await repo.insertResolutionEvent({
        workspace_id: workspaceId,
        person_id: null,
        candidate_person_ids: [],
        input_identifiers: [],
        resolution_action: "no_match",
        resolution_reason: "no_identifiers_and_no_source_record",
        confidence: null,
        source_platform: input.source_platform || null,
        source_record_type: input.source_record_type || null,
        source_record_id: input.source_record_id || null,
        connector_job_id: input.connector_job_id || null,
        metadata: input.metadata || {},
      });
      return {
        person_id: null,
        action: "no_match",
        confidence: null,
        match_reason: "no_identifiers_and_no_source_record",
        matched_identifiers: [],
        attached_identifiers: [],
        conflicts: [],
        review_required: false,
      };
    }

    const matches = normalized.length ? await repo.findIdentifiers(workspaceId, normalized) : [];
    const candidatePersonIds = unique(matches.map((match) => match.person_id));
    const activePeople = (await repo.listPeopleByIds(workspaceId, candidatePersonIds))
      .filter((person) => person.status === "active");
    const activePersonIds = activePeople.map((person) => person.id);

    if (activePersonIds.length > 1) {
      const conflicts = normalized.map((identifier) => {
        const candidateIds = unique(matches
          .filter((match) => match.identifier_type === identifier.identifier_type && match.normalized_value === identifier.normalized_value)
          .map((match) => match.person_id)
          .filter((id) => activePersonIds.includes(id)));
        return candidateIds.length ? {
          identifier_type: identifier.identifier_type,
          normalized_value: identifier.normalized_value,
          candidate_person_ids: candidateIds,
        } : null;
      }).filter(Boolean) as IdentityResolutionResult["conflicts"];
      await repo.insertResolutionEvent({
        workspace_id: workspaceId,
        person_id: null,
        candidate_person_ids: activePersonIds,
        input_identifiers: eventIdentifiers(normalized),
        resolution_action: "review_required",
        resolution_reason: "identifiers_resolve_to_multiple_active_people",
        confidence: null,
        source_platform: input.source_platform || null,
        source_record_type: input.source_record_type || null,
        source_record_id: input.source_record_id || null,
        connector_job_id: input.connector_job_id || null,
        metadata: { conflicts, ...(input.metadata || {}) },
      });
      return {
        person_id: null,
        action: "review_required",
        confidence: null,
        match_reason: "identifiers_resolve_to_multiple_active_people",
        matched_identifiers: normalized,
        attached_identifiers: [],
        conflicts,
        review_required: true,
      };
    }

    let person = activePeople[0] || null;
    let action: IdentityResolutionResult["action"] = "matched_existing_person";
    const matchedIdentifiers = person
      ? matchedInputIdentifiers(normalized, matches.filter((match) => match.person_id === person!.id))
      : [];
    const best = bestMatchReason(matchedIdentifiers.length ? matchedIdentifiers : normalized);
    if (!person) {
      action = "created_person";
      person = await repo.createPerson({
        workspace_id: workspaceId,
        status: "active",
        display_name: input.person_attributes?.display_name || null,
        first_name: input.person_attributes?.first_name || null,
        last_name: input.person_attributes?.last_name || null,
        first_seen_at: observedAt,
        last_seen_at: observedAt,
        metadata: input.metadata || {},
      });
    } else {
      await repo.updatePerson(workspaceId, person.id, {
        last_seen_at: observedAt,
        updated_at: observedAt,
      } as any);
    }

    const attached: IdentityIdentifier[] = [];
    const conflicts: IdentityResolutionResult["conflicts"] = [];
    for (const identifier of normalized) {
      const result = await attachNormalizedIdentifier({
        workspace_id: workspaceId,
        person_id: person.id,
        identifier,
        input,
        observed_at: observedAt,
      });
      if (result.conflict_person_id) {
        conflicts.push({
          identifier_type: identifier.identifier_type,
          normalized_value: identifier.normalized_value,
          candidate_person_ids: [result.conflict_person_id],
        });
        continue;
      }
      if (result.attached) attached.push(result.attached);
    }

    if (conflicts.length) {
      await repo.insertResolutionEvent({
        workspace_id: workspaceId,
        person_id: person.id,
        candidate_person_ids: unique(conflicts.flatMap((conflict) => conflict.candidate_person_ids)),
        input_identifiers: eventIdentifiers(normalized),
        resolution_action: "review_required",
        resolution_reason: "identifier_attachment_conflict",
        confidence: null,
        source_platform: input.source_platform || null,
        source_record_type: input.source_record_type || null,
        source_record_id: input.source_record_id || null,
        connector_job_id: input.connector_job_id || null,
        metadata: { conflicts, ...(input.metadata || {}) },
      });
      return {
        person_id: null,
        action: "review_required",
        confidence: null,
        match_reason: "identifier_attachment_conflict",
        matched_identifiers: normalized,
        attached_identifiers: [],
        conflicts,
        review_required: true,
      };
    }

    await syncPrimaryIdentifiers(workspaceId, person.id);
    await repo.insertResolutionEvent({
      workspace_id: workspaceId,
      person_id: person.id,
      candidate_person_ids: [person.id],
      input_identifiers: eventIdentifiers(normalized),
      resolution_action: action,
      resolution_reason: action === "created_person" ? "no_exact_match_created_person" : best.reason,
      confidence: best.confidence,
      source_platform: input.source_platform || null,
      source_record_type: input.source_record_type || null,
      source_record_id: input.source_record_id || null,
      connector_job_id: input.connector_job_id || null,
      metadata: input.metadata || {},
    });

    return {
      person_id: person.id,
      action,
      confidence: best.confidence,
      match_reason: action === "created_person" ? "no_exact_match_created_person" : best.reason,
      matched_identifiers: normalized,
      attached_identifiers: attached,
      conflicts: [],
      review_required: false,
    };
  }

  async function createPerson(args: Partial<IdentityPerson> & { workspace_id?: string | null }) {
    return repo.createPerson({
      ...args,
      workspace_id: workspace(args.workspace_id),
      status: args.status || "active",
    });
  }

  async function findPeopleByIdentifiers(workspaceId: string, identifiers: Array<{ identifier_type: IdentityIdentifierType; normalized_value: string }>) {
    const matches = await repo.findIdentifiers(workspace(workspaceId), identifiers);
    return repo.listPeopleByIds(workspace(workspaceId), unique(matches.map((match) => match.person_id)));
  }

  async function attachIdentifier(args: {
    workspace_id?: string | null;
    person_id: string;
    identifier_type: IdentityIdentifierType | string;
    value: unknown;
    verification_status?: "observed" | "verified" | "disputed" | "deprecated";
    country?: string | null;
    source_platform?: string | null;
    source_record_type?: string | null;
    source_record_id?: string | null;
    source_connector_id?: string | null;
    observed_at?: string | null;
  }) {
    const workspaceId = workspace(args.workspace_id);
    const normalized = await normalizeIdentityIdentifier({
      identifier_type: args.identifier_type,
      value: args.value,
      country: args.country,
    });
    if (!normalized.identifier_type || !normalized.valid) {
      throw new Error(`Invalid identity identifier: ${normalized.warnings.join(",") || "invalid"}`);
    }
    const person = await repo.getPerson(workspaceId, args.person_id);
    if (!person || person.status !== "active") throw new Error("Person not found or not active.");
    const attached = await attachNormalizedIdentifier({
      workspace_id: workspaceId,
      person_id: args.person_id,
      identifier: {
        ...normalized,
        identifier_type: normalized.identifier_type,
        verification_status: args.verification_status || "observed",
        confidence: confidenceForIdentifier(normalized.identifier_type),
        metadata: {},
      },
      input: {
        workspace_id: workspaceId,
        source_platform: args.source_platform,
        source_record_type: args.source_record_type,
        source_record_id: args.source_record_id,
        source_connector_id: args.source_connector_id,
      },
      observed_at: cleanText(args.observed_at) || nowIso(),
    });
    if (attached.conflict_person_id) throw new Error("Identifier is already attached to another active person.");
    await syncPrimaryIdentifiers(workspaceId, args.person_id);
    return attached.attached;
  }

  async function detachOrDeprecateIdentifier(workspaceId: string, identifierId: string) {
    return repo.updateIdentifier(workspace(workspaceId), identifierId, {
      verification_status: "deprecated",
      is_primary: false,
      updated_at: nowIso(),
    } as any);
  }

  async function setPrimaryIdentifier(workspaceId: string, personId: string, identifierId: string) {
    const identifiers = await repo.getPersonIdentifiers(workspace(workspaceId), personId);
    const target = identifiers.find((identifier) => identifier.id === identifierId);
    if (!target) throw new Error("Identifier not found for person.");
    for (const identifier of identifiers.filter((item) => item.identifier_type === target.identifier_type && item.id !== identifierId)) {
      await repo.updateIdentifier(workspace(workspaceId), identifier.id, { is_primary: false } as any);
    }
    const updated = await repo.updateIdentifier(workspace(workspaceId), identifierId, { is_primary: true } as any);
    await syncPrimaryIdentifiers(workspace(workspaceId), personId);
    return updated;
  }

  async function updatePersonLastSeen(workspaceId: string, personId: string, observedAt?: string | null) {
    return repo.updatePerson(workspace(workspaceId), personId, {
      last_seen_at: cleanText(observedAt) || nowIso(),
      updated_at: nowIso(),
    } as any);
  }

  async function previewMerge(args: { workspace_id?: string | null; source_person_id: string; target_person_id: string }) {
    const workspaceId = workspace(args.workspace_id);
    if (args.source_person_id === args.target_person_id) throw new Error("source_person_id and target_person_id must be different.");
    const [source, target] = await Promise.all([
      repo.getPerson(workspaceId, args.source_person_id),
      repo.getPerson(workspaceId, args.target_person_id),
    ]);
    if (!source || !target) throw new Error("Both people must exist in the workspace.");
    if (source.workspace_id !== target.workspace_id) throw new Error("Cross-workspace merge rejected.");

    const [sourceIdentifiers, targetIdentifiers] = await Promise.all([
      repo.getPersonIdentifiers(workspaceId, source.id),
      repo.getPersonIdentifiers(workspaceId, target.id),
    ]);
    const targetKeys = new Set(targetIdentifiers.map((identifier) => `${identifier.identifier_type}:${identifier.normalized_value}`));
    const conflicts: IdentityIdentifier[] = [];
    const movable: IdentityIdentifier[] = [];
    const duplicates: IdentityIdentifier[] = [];
    for (const identifier of sourceIdentifiers) {
      const key = `${identifier.identifier_type}:${identifier.normalized_value}`;
      const owners = await repo.findIdentifiers(workspaceId, [{
        identifier_type: identifier.identifier_type,
        normalized_value: identifier.normalized_value,
      }]);
      const thirdPartyOwner = owners.find((owner) => owner.person_id !== source.id && owner.person_id !== target.id);
      if (thirdPartyOwner) conflicts.push(identifier);
      else if (targetKeys.has(key)) duplicates.push(identifier);
      else movable.push(identifier);
    }

    return {
      source_person: compactPerson(source),
      target_person: compactPerson(target),
      conflicts: conflicts.map(compactIdentifier),
      movable_identifiers: movable.map(compactIdentifier),
      duplicate_identifiers: duplicates.map(compactIdentifier),
    };
  }

  async function mergePeople(args: {
    workspace_id?: string | null;
    source_person_id: string;
    target_person_id: string;
    reason: string;
    performed_by?: string | null;
  }) {
    const workspaceId = workspace(args.workspace_id);
    const source = await repo.getPerson(workspaceId, args.source_person_id);
    const target = await repo.getPerson(workspaceId, args.target_person_id);
    if (!source || !target) throw new Error("Both people must exist in the workspace.");
    if (source.workspace_id !== target.workspace_id) throw new Error("Cross-workspace merge rejected.");
    if (source.status === "merged" && source.merged_into_person_id === target.id) {
      return { merged: true, idempotent: true, source_person: compactPerson(source), target_person: compactPerson(target) };
    }
    const preview = await previewMerge({
      workspace_id: workspaceId,
      source_person_id: source.id,
      target_person_id: target.id,
    });
    for (const identifier of await repo.getPersonIdentifiers(workspaceId, source.id)) {
      if (preview.conflicts.some((conflict: any) => conflict.id === identifier.id)) {
        await repo.updateIdentifier(workspaceId, identifier.id, { verification_status: "disputed", is_primary: false } as any);
      } else if (preview.duplicate_identifiers.some((duplicate: any) => duplicate.id === identifier.id)) {
        await repo.updateIdentifier(workspaceId, identifier.id, { verification_status: "deprecated", is_primary: false } as any);
      } else {
        await repo.updateIdentifier(workspaceId, identifier.id, { person_id: target.id, is_primary: false } as any);
      }
    }
    const updatedSource = await repo.updatePerson(workspaceId, source.id, {
      status: "merged",
      merged_into_person_id: target.id,
      updated_at: nowIso(),
    } as any);
    await syncPrimaryIdentifiers(workspaceId, target.id);
    await repo.insertMergeHistory({
      workspace_id: workspaceId,
      source_person_id: source.id,
      target_person_id: target.id,
      reason: args.reason || "manual_merge",
      performed_by: args.performed_by || null,
      metadata: { preview },
    });
    await repo.insertResolutionEvent({
      workspace_id: workspaceId,
      person_id: target.id,
      candidate_person_ids: [source.id, target.id],
      input_identifiers: [],
      resolution_action: "manually_merged",
      resolution_reason: args.reason || "manual_merge",
      confidence: 1,
      metadata: { source_person_id: source.id, target_person_id: target.id },
    });
    return {
      merged: true,
      idempotent: false,
      source_person: compactPerson(updatedSource),
      target_person: compactPerson(await repo.getPerson(workspaceId, target.id)),
      conflicts: preview.conflicts,
    };
  }

  async function getPerson(workspaceId: string, personId: string) {
    return repo.getPerson(workspace(workspaceId), personId);
  }

  async function getPersonIdentifiers(workspaceId: string, personId: string) {
    return repo.getPersonIdentifiers(workspace(workspaceId), personId);
  }

  async function getIdentityResolutionHistory(workspaceId: string, personId: string | null, limit = 25, offset = 0) {
    return repo.listResolutionEvents(workspace(workspaceId), personId, Math.min(Math.max(1, limit), 100), Math.max(0, offset));
  }

  async function searchPeople(args: { workspace_id?: string | null; person_id?: string | null; identifier_type?: string | null; value?: unknown; email?: unknown; phone?: unknown; country?: string | null; limit?: number; offset?: number }) {
    const workspaceId = workspace(args.workspace_id);
    if (args.person_id) return repo.searchPeople({ workspace_id: workspaceId, person_id: cleanText(args.person_id), limit: 1, offset: 0 });
    const identifierType = args.identifier_type || (args.email ? "email" : args.phone ? "phone" : "");
    const value = args.value ?? args.email ?? args.phone;
    if (identifierType && value !== undefined) {
      const normalized = await normalizeIdentityIdentifier({ identifier_type: identifierType, value, country: args.country });
      if (!normalized.identifier_type || !normalized.valid) return [];
      return findPeopleByIdentifiers(workspaceId, [{
        identifier_type: normalized.identifier_type,
        normalized_value: normalized.normalized_value,
      }]);
    }
    return repo.searchPeople({
      workspace_id: workspaceId,
      limit: Math.min(Math.max(1, Number(args.limit || 25)), 100),
      offset: Math.max(0, Number(args.offset || 0)),
    });
  }

  async function reviewQueue(args: { workspace_id?: string | null; limit?: number; offset?: number }) {
    return repo.reviewQueue({
      workspace_id: workspace(args.workspace_id),
      limit: Math.min(Math.max(1, Number(args.limit || 25)), 100),
      offset: Math.max(0, Number(args.offset || 0)),
    });
  }

  return {
    resolveIdentity,
    createPerson,
    findPeopleByIdentifiers,
    attachIdentifier,
    detachOrDeprecateIdentifier,
    setPrimaryIdentifier,
    updatePersonLastSeen,
    getPerson,
    getPersonIdentifiers,
    getIdentityResolutionHistory,
    previewMerge,
    mergePeople,
    searchPeople,
    reviewQueue,
  };
}

export function resolveIdentityForSourceRecord(service: ReturnType<typeof createIdentityService>, args: {
  workspace_id?: string | null;
  connector_id?: string | null;
  connector_job_id?: string | null;
  platform?: string | null;
  record_type?: string | null;
  record_id?: string | null;
  identifiers?: IdentityInputIdentifier[];
  attributes?: ResolveIdentityInput["person_attributes"];
  observed_at?: string | null;
}) {
  return service.resolveIdentity({
    workspace_id: args.workspace_id,
    identifiers: args.identifiers || [],
    source_platform: args.platform,
    source_record_type: args.record_type,
    source_record_id: args.record_id,
    source_connector_id: args.connector_id,
    connector_job_id: args.connector_job_id,
    person_attributes: args.attributes,
    observed_at: args.observed_at,
  });
}

export function createSupabaseIdentityRepository(supabase: any): IdentityRepository {
  let repository: IdentityRepository;
  repository = {
    async createPerson(args) {
      const { data, error } = await supabase.from("people").insert(args).select("*").single();
      if (error) throw new Error(`Identity person create failed: ${error.message}`);
      return data;
    },
    async updatePerson(workspaceId, personId, patch) {
      const { data, error } = await supabase
        .from("people")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", personId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Identity person update failed: ${error.message}`);
      return data || null;
    },
    async getPerson(workspaceId, personId) {
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", personId)
        .maybeSingle();
      if (error) throw new Error(`Identity person lookup failed: ${error.message}`);
      return data || null;
    },
    async listPeopleByIds(workspaceId, personIds) {
      if (!personIds.length) return [];
      const { data, error } = await supabase
        .from("people")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("id", personIds);
      if (error) throw new Error(`Identity people lookup failed: ${error.message}`);
      return data || [];
    },
    async findIdentifiers(workspaceId, identifiers) {
      if (!identifiers.length) return [];
      const rows: IdentityIdentifier[] = [];
      for (const identifier of identifiers) {
        const { data, error } = await supabase
          .from("person_identifiers")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("identifier_type", identifier.identifier_type)
          .eq("normalized_value", identifier.normalized_value)
          .in("verification_status", ["observed", "verified"]);
        if (error) throw new Error(`Identity identifier lookup failed: ${error.message}`);
        rows.push(...(data || []));
      }
      return rows;
    },
    async attachIdentifier(args) {
      const existing = await repository.findIdentifiers(args.workspace_id, [{
        identifier_type: args.identifier_type,
        normalized_value: args.normalized_value,
      }]);
      const same = existing.find((identifier) => identifier.person_id === args.person_id);
      if (same) {
        const updated = await repository.updateIdentifier(args.workspace_id, same.id, {
          raw_value: same.raw_value || args.raw_value,
          last_seen_at: args.last_seen_at,
          source_platform: same.source_platform || args.source_platform,
          source_record_type: same.source_record_type || args.source_record_type,
          source_record_id: same.source_record_id || args.source_record_id,
          source_connector_id: same.source_connector_id || args.source_connector_id,
          updated_at: nowIso(),
        } as any);
        return { identifier: updated || same, created: false };
      }
      const { data, error } = await supabase.from("person_identifiers").insert(args).select("*").single();
      if (error) throw new Error(`Identity identifier attach failed: ${error.message}`);
      return { identifier: data, created: true };
    },
    async updateIdentifier(workspaceId, identifierId, patch) {
      const { data, error } = await supabase
        .from("person_identifiers")
        .update(patch)
        .eq("workspace_id", workspaceId)
        .eq("id", identifierId)
        .select("*")
        .maybeSingle();
      if (error) throw new Error(`Identity identifier update failed: ${error.message}`);
      return data || null;
    },
    async getPersonIdentifiers(workspaceId, personId) {
      const { data, error } = await supabase
        .from("person_identifiers")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("person_id", personId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`Identity identifiers lookup failed: ${error.message}`);
      return data || [];
    },
    async insertResolutionEvent(event) {
      const payload = {
        ...event,
        candidate_person_ids: event.candidate_person_ids || [],
        metadata: event.metadata || {},
      };
      const { data, error } = await supabase.from("identity_resolution_events").insert(payload).select("*").single();
      if (error) throw new Error(`Identity event insert failed: ${error.message}`);
      return data;
    },
    async listResolutionEvents(workspaceId, personId, limit, offset) {
      let query = supabase
        .from("identity_resolution_events")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (personId) query = query.eq("person_id", personId);
      const { data, error } = await query;
      if (error) throw new Error(`Identity history lookup failed: ${error.message}`);
      return data || [];
    },
    async insertMergeHistory(args) {
      const { data, error } = await supabase.from("person_merge_history").insert(args).select("*").single();
      if (error) throw new Error(`Identity merge history insert failed: ${error.message}`);
      return data;
    },
    async searchPeople(args) {
      let query = supabase
        .from("people")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .order("updated_at", { ascending: false })
        .range(args.offset, args.offset + args.limit - 1);
      if (args.person_id) query = query.eq("id", args.person_id);
      const { data, error } = await query;
      if (error) throw new Error(`Identity people search failed: ${error.message}`);
      return data || [];
    },
    async reviewQueue(args) {
      const { data, error } = await supabase
        .from("identity_resolution_events")
        .select("*")
        .eq("workspace_id", args.workspace_id)
        .in("resolution_action", ["conflict_detected", "review_required"])
        .order("created_at", { ascending: false })
        .range(args.offset, args.offset + args.limit - 1);
      if (error) throw new Error(`Identity review queue failed: ${error.message}`);
      return data || [];
    },
  };
  return repository;
}

export function compactIdentityPerson(person: IdentityPerson | null) {
  return compactPerson(person);
}

export function compactIdentityIdentifier(identifier: IdentityIdentifier) {
  return compactIdentifier(identifier);
}
