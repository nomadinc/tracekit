import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";

const ui=resolve(import.meta.dirname,"..");
const release=resolve(ui,"sdk/releases/1.0.0");
const published=resolve(ui,"public/sdk/tkid/1.0.0");
const releaseBytes=readFileSync(resolve(release,"tracekit-journey.min.js"));
const publicBytes=readFileSync(resolve(published,"tracekit-journey.min.js"));
const releaseManifest=readFileSync(resolve(release,"manifest.json"));
const publicManifest=readFileSync(resolve(published,"manifest.json"));
const manifest=JSON.parse(publicManifest.toString("utf8"));

test("published 1.0.0 bytes and manifest exactly equal the approved release",()=>{
  assert.deepEqual(publicBytes,releaseBytes);
  assert.deepEqual(publicManifest,releaseManifest);
  assert.equal(publicBytes.byteLength,7182);
  assert.equal(createHash("sha256").update(publicBytes).digest("hex"),"eda519b5d8585c4a46db36b3dabe5b603d7ce895145fdefffba3b3dc32ee0a83");
  assert.equal(manifest.sri,"sha384-w2HlRXLyX2NvTswRJSb/F584XCb5xJar9RgJ2wgBZzJKja4qqjzMzKDkrwVrP0MO");
  assert.equal(manifest.sourceCommit,"dd6036dd354ed0a19ecdf167353719fea24cae1f");
});

test("versioned publication has immutable anonymous CORS and exact MIME contracts",()=>{
  const config=readFileSync(resolve(ui,"next.config.mjs"),"utf8");
  assert.match(config,/source: "\/sdk\/tkid\/1\.0\.0\/tracekit-journey\.min\.js"/);
  assert.match(config,/source: "\/sdk\/tkid\/1\.0\.0\/manifest\.json"/);
  assert.match(config,/public, max-age=31536000, immutable/);
  assert.match(config,/Access-Control-Allow-Origin/);
  assert.match(config,/value: "\*"/);
  assert.match(config,/application\/javascript; charset=utf-8/);
  assert.match(config,/application\/json; charset=utf-8/);
  assert.match(config,/Cross-Origin-Resource-Policy/);
});

test("static SDK paths bypass WorkOS middleware and no mutable alias exists",()=>{
  const middleware=readFileSync(resolve(ui,"middleware.ts"),"utf8");
  assert.match(middleware,/css\|js\|map/);
  assert.match(middleware,/txt\|xml\|json/);
  assert.equal(existsSync(resolve(ui,"public/sdk/tkid/latest")),false);
  assert.equal(existsSync(resolve(ui,"public/sdk/tkid/tracekit-journey.min.js")),false);
});

test("public artifact stays generic and release overwrite protection remains",()=>{
  const text=publicBytes.toString("utf8"),builder=readFileSync(resolve(ui,"scripts/build-tkid-sdk.mjs"),"utf8");
  assert.doesNotMatch(text,/EcoWatt|buyecowatt|workers\.dev|39d895f9|5f1de64a|b0d5abc3|b784b15c/i);
  assert.match(builder,/immutable release conflict/);
  assert.match(builder,/flag:"wx"/);
});
