export const PRODUCTION_DEEP_LINK_VERSION = 1 as const;

export type DrawerTarget<K extends string> = {
  kind: K;
  recordId: string;
};

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function isOpaqueId(value: string | null | undefined): value is string {
  return Boolean(value && OPAQUE_ID.test(value));
}

export function parseVersion(params: URLSearchParams) {
  return params.get("v") === String(PRODUCTION_DEEP_LINK_VERSION)
    ? PRODUCTION_DEEP_LINK_VERSION
    : PRODUCTION_DEEP_LINK_VERSION;
}

export function addVersion(params: URLSearchParams) {
  params.set("v", String(PRODUCTION_DEEP_LINK_VERSION));
}

export function parseDrawerTarget<K extends string>(
  params: URLSearchParams,
  kinds: ReadonlySet<K>,
): DrawerTarget<K> | null {
  const kind = params.get("drawer_kind") as K | null;
  const recordId = params.get("drawer_id");
  return kind && kinds.has(kind) && isOpaqueId(recordId) ? { kind, recordId } : null;
}

export function addDrawerTarget<K extends string>(params: URLSearchParams, target: DrawerTarget<K> | null | undefined) {
  if (!target) return;
  params.set("drawer_kind", target.kind);
  params.set("drawer_id", target.recordId);
}

export function normalizedRepeatedIds(values: readonly string[], maximum = 4) {
  return Array.from(new Set(values.filter(isOpaqueId))).slice(0, maximum);
}
