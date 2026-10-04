import{readFile}from"node:fs/promises";
import{evaluateProductionV1Acceptance}from"../lib/mcp/production-v1-acceptance";

async function main(){
  const inputPath=process.argv[2];
  if(!inputPath)throw new Error("usage: tsx scripts/verify-production-v1-acceptance.ts <evidence-manifest.json>");
  const input=JSON.parse(await readFile(inputPath,"utf8"));
  const result=evaluateProductionV1Acceptance(input);
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  if(!result.productionV1Ready)process.exitCode=1;
}
void main();
