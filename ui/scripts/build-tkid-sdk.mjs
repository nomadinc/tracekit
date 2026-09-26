import {build} from "esbuild";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const VERSION="1.0.0",FILE="tracekit-journey.min.js",root=resolve(import.meta.dirname,"..");
const releaseRoot=resolve(root,"sdk/releases",VERSION),flag=process.argv.indexOf("--output-root");
const requestedRoot=flag>=0?process.argv[flag+1]:releaseRoot;
if(!requestedRoot)throw new Error("--output-root requires a path");
const sourceCommit=(process.env.TRACEKIT_SDK_SOURCE_COMMIT||execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"})).trim();
if(!/^[0-9a-f]{40}$/.test(sourceCommit))throw new Error("TRACEKIT_SDK_SOURCE_COMMIT must be a full Git SHA");
try{execFileSync("git",["cat-file","-e",`${sourceCommit}^{commit}`],{cwd:root,stdio:"ignore"})}catch{throw new Error("TRACEKIT_SDK_SOURCE_COMMIT must resolve to a Git commit")}
const result=await build({entryPoints:[resolve(root,"sdk/tkid/browser-entry.ts")],bundle:true,write:false,format:"iife",platform:"browser",target:["es2020"],minify:true,legalComments:"none",sourcemap:false,charset:"ascii",treeShaking:true});
const bytes=result.outputFiles[0].contents,sha256=createHash("sha256").update(bytes).digest("hex"),sri=`sha384-${createHash("sha384").update(bytes).digest("base64")}`;
const manifest={artifactPath:`/sdk/tkid/${VERSION}/${FILE}`,byteSize:bytes.byteLength,canonicalApiEndpoint:"https://api.trace-kit.io",file:FILE,sha256,sourceCommit,sourceMap:"none",sri,version:VERSION};
await mkdir(requestedRoot,{recursive:true});
await immutableWrite(resolve(requestedRoot,FILE),bytes);
await immutableWrite(resolve(requestedRoot,"manifest.json"),Buffer.from(`${JSON.stringify(manifest,null,2)}\n`));
process.stdout.write(`${JSON.stringify(manifest)}\n`);
async function immutableWrite(path,content){try{const prior=await readFile(path);if(!prior.equals(content))throw new Error(`immutable release conflict: ${path}`);return}catch(error){if(error?.code!=="ENOENT")throw error}await writeFile(path,content,{flag:"wx"})}
