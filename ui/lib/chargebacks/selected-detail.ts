export function selectedDetail<T>(
  selectedId: string | null,
  loaded: { id: string; value: T } | null
): T | null {
  return selectedId !== null && loaded?.id === selectedId
    ? loaded.value
    : null;
}
