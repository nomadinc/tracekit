import assert from"node:assert/strict";import test from"node:test";import{readFileSync}from"node:fs";
const source=readFileSync(new URL("../lib/identity/supabase-identity-repository.ts",import.meta.url),"utf8");
test("identity storage retries only transient transport rate-limit and server failures",()=>{assert.match(source,/attempt < 2/);assert.match(source,/response\.status === 429 \|\| response\.status >= 500/);assert.match(source,/setTimeout\(resolve, 125\)/);});
test("identity storage still fails closed after retry and on non-transient errors",()=>{assert.match(source,/if \(!response\) throw new Error\("Persistent identity storage request failed\."\)/);assert.match(source,/if \(!response\.ok\) throw new Error/);});
