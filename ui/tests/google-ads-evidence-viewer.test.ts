import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Google evidence viewer is read-only and supports payload history/copy", async()=>{
 const source=await readFile(new URL("../components/integrations/google-ads-evidence-viewer.tsx",import.meta.url),"utf8");
 assert.match(source,/View Google Payload/);
 assert.match(source,/Evidence history/);
 assert.match(source,/Copy JSON/);
 assert.match(source,/JSON\.stringify/);
 assert.doesNotMatch(source,/Delete|Edit payload|Save payload/);
});
