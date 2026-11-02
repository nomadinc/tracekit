export type OwnedDrawer<T> = {
  owner: string | null;
  contextKey: string;
  value: T;
};

export function openOwnedDrawer<T>(
  contextKey: string,
  owner: string | null,
  value: T
): OwnedDrawer<T> {
  return { contextKey, owner, value };
}

export function closeOwnedDrawer<T>(
  current: OwnedDrawer<T> | null,
  owner?: string
): OwnedDrawer<T> | null {
  if (!current) return null;
  if (owner !== undefined && current.owner !== owner) return current;
  return null;
}

export function visibleOwnedDrawer<T>(
  current: OwnedDrawer<T> | null,
  contextKey: string
): OwnedDrawer<T> | null {
  return current?.contextKey === contextKey ? current : null;
}

export function admitOwnedDrawer<T>(
  current: OwnedDrawer<T> | null,
  activeContextKey: string,
  requestContextKey: string,
  owner: string | null,
  value: T
): OwnedDrawer<T> | null {
  if (activeContextKey !== requestContextKey) return current;

  return openOwnedDrawer(requestContextKey, owner, value);
}

export type DrawerOwnerLease = {
  owner: string;
  active: boolean;
};

export function createDrawerOwnerLease(owner: string): DrawerOwnerLease {
  return { owner, active: true };
}

export function revokeDrawerOwnerLease(lease: DrawerOwnerLease) {
  lease.active = false;
}

export function canOpenOwnedDrawer(lease: DrawerOwnerLease) {
  return lease.active;
}

export function admitLeasedDrawer<T>(
  current: OwnedDrawer<T> | null,
  activeContextKey: string,
  requestContextKey: string,
  lease: DrawerOwnerLease,
  value: T
): OwnedDrawer<T> | null {
  if (!canOpenOwnedDrawer(lease)) return current;

  return admitOwnedDrawer(
    current,
    activeContextKey,
    requestContextKey,
    lease.owner,
    value
  );
}
