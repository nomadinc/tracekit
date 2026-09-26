import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const version=process.argv[2]||"1.0.0",root=resolve(import.meta.dirname,"../sdk/releases",version),manifest=JSON.parse(await readFile(resolve(root,"manifest.json"),"utf8")),bytes=await readFile(resolve(root,manifest.file));
if(createHash("sha256").update(bytes).digest("hex")!==manifest.sha256||`sha384-${createHash("sha384").update(bytes).digest("base64")}`!==manifest.sri||bytes.byteLength!==manifest.byteSize)throw new Error("TKID SDK release integrity mismatch");
process.stdout.write(`verified ${manifest.artifactPath} ${manifest.sha256}\n`);
