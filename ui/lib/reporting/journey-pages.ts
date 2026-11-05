// Consume the canonical API's opaque cursor; never synthesize missing events.
export async function readJourneyPages(readPage: (cursor: string | null) => Promise<any>) {
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let first: any = null;
  const events: any[] = [];
  const activity: any[] = [];
  const eventIds = new Set<string>();
  const activityIds = new Set<string>();
  function append(rows: any[], target: any[], ids: Set<string>) {
    for (const row of rows) {
      if (row.id && ids.has(row.id)) continue;
      if (row.id) ids.add(row.id);
      target.push(row);
    }
  }
  do {
    const page = await readPage(cursor);
    if (page?.ok === false || !page || !Array.isArray(page.events)) throw new Error("Journey evidence is unavailable.");
    if (!first) first = page;
    append(page.events, events, eventIds);
    append(Array.isArray(page.activity) ? page.activity : [], activity, activityIds);
    if (!page.page?.has_more) return { ...first, events, activity };
    const next = page.page.next_cursor;
    if (typeof next !== "string" || !next || cursors.has(next)) throw new Error("Journey pagination is unavailable.");
    cursors.add(next);
    cursor = next;
  } while (cursor !== null);
}
