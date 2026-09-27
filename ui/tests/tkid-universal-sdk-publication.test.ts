import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const ui=resolve(import.meta.dirname,"..");
const release=resolve(ui,"sdk/releases/1.1.0");
const published=resolve(ui,"public/sdk/tkid/1.1.0");
const releaseBytes=readFileSync(resolve(release,"tracekit.js"));
const publicBytes=readFileSync(resolve(published,"tracekit.js"));
const releaseManifest=readFileSync(resolve(release,"manifest.json"));
const publicManifest=readFileSync(resolve(published,"manifest.json"));
const manifest=JSON.parse(publicManifest.toString("utf8"));

test("published 1.1.0 bytes and manifest exactly equal the approved release",()=>{
  assert.deepEqual(publicBytes,releaseBytes);
  assert.deepEqual(publicManifest,releaseManifest);
  assert.equal(publicBytes.byteLength,11499);
  assert.equal(createHash("sha256").update(publicBytes).digest("hex"),"256eb0c6d973384c7ebfdefe722de12b0902513371f3dbc717d872bde03811d9");
  assert.equal(manifest.sri,"sha384-/ecNsTMyPMITlCloOpao9O5YNMuZOGvc0BEdkfmRQ/VwQf/NaWdpBtCffS6uRt3N");
  assert.equal(manifest.sourceCommit,"338c67bf434c9a663ed36e78433f08d44575c736");
});

test("versioned 1.1.0 publication has immutable anonymous CORS and exact MIME contracts",()=>{
  const config=readFileSync(resolve(ui,"next.config.mjs"),"utf8");
  assert.match(config,/source: "\/sdk\/tkid\/1\.1\.0\/tracekit\.js"/);
  assert.match(config,/source: "\/sdk\/tkid\/1\.1\.0\/manifest\.json"/);
  assert.match(config,/public, max-age=31536000, immutable/);
  assert.match(config,/Access-Control-Allow-Origin/);
  assert.match(config,/value: "\*"/);
  assert.match(config,/application\/javascript; charset=utf-8/);
  assert.match(config,/application\/json; charset=utf-8/);
  assert.match(config,/Cross-Origin-Resource-Policy/);
});

test("1.1.0 publication is generic, immutable, and has no mutable alias",()=>{
  const text=publicBytes.toString("utf8"),builder=readFileSync(resolve(ui,"scripts/build-tkid-universal-sdk.mjs"),"utf8");
  assert.doesNotMatch(text,/EcoWatt|buyecowatt|tksrc_ecowatt|ecowatt-main|landing-primary|\.cta-btn|workers\.dev|5f1de64a|b0d5abc3|b784b15c/i);
  assert.match(builder,/immutable release conflict/);
  assert.match(builder,/flag:"wx"/);
  assert.equal(existsSync(resolve(ui,"public/sdk/tkid/latest/tracekit.js")),false);
  assert.equal(existsSync(resolve(ui,"public/sdk/tkid/tracekit.js")),false);
});
