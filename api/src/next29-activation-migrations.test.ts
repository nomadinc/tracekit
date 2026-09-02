import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import { NEXT29_REQUIRED_MIGRATIONS } from "./connectors/next29/activation-readiness.ts";

const root=new URL("../../supabase/migrations/",import.meta.url);

test("29Next activation preflight references migrations that exist in the repository",async()=>{for(const name of NEXT29_REQUIRED_MIGRATIONS){await access(new URL(name,root));}});

test("29Next activation preflight migration set has unique filenames",()=>{assert.equal(new Set(NEXT29_REQUIRED_MIGRATIONS).size,NEXT29_REQUIRED_MIGRATIONS.length);});
