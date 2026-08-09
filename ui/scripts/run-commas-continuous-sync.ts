import { runContinuousCommasSync } from "../lib/commerce/commas-continuous-worker";

async function main() {
  if(!process.argv.includes("--confirm-bounded-continuous-proof")) throw new Error("Bounded continuous proof requires explicit confirmation.");
  const mode=process.argv.includes("--deep-reconciliation")?"deep_reconciliation":"continuous";
  const maxPages=Number(process.argv.find((value)=>value.startsWith("--max-pages="))?.split("=")[1]||8);
  const requestKey=process.argv.find((value)=>value.startsWith("--request-key="))?.split("=")[1];
  const result=await runContinuousCommasSync({mode,maxPages,requestKey});
  console.log(JSON.stringify({event:"continuous_sync_completed",...result}));
}

void main();
