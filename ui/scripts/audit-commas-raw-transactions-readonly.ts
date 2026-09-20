import { CommasClient } from "../../api/src/connectors/commas/client.ts";
import { auditCommasRawTransaction } from "../../api/src/connectors/commas/raw-evidence-audit.ts";
import { decodeCommerceCredentialKey, decryptCommerceCredential } from "../lib/commerce/credential-crypto";
import { supabaseAuthHeaders } from "../lib/commerce/supabase-auth";

const HARD_MAX=10;
type Row=Record<string,unknown>;
const cfg=()=>({url:process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key:process.env.SUPABASE_SERVICE_ROLE_KEY});
async function db(path:string):Promise<Row[]>{
 const {url,key}=cfg();if(!url||!key)throw new Error("Supabase configuration unavailable.");
 const r=await fetch(`${url}/rest/v1/${path}`,{headers:{...supabaseAuthHeaders(key)}});
 if(!r.ok)throw new Error(`Audit lookup failed (${r.status}).`);
 const v=await r.json();return (Array.isArray(v)?v:[v]) as Row[];
}
const bytes=(v:unknown)=>Uint8Array.from(Buffer.from(String(v).replace(/^\\x/,""),"hex"));

async function credential(connectionId:string,organizationId:string){
 const rows=await db(`commerce_provider_credentials?connection_id=eq.${connectionId}&organization_id=eq.${organizationId}&revoked_at=is.null&select=encryption_key_id,encryption_version,secret_iv,secret_ciphertext&limit=2`);
 if(rows.length!==1)throw new Error("Expected exactly one active encrypted Commas credential.");
 const row=rows[0],keyId=process.env.COMMERCE_CREDENTIALS_KEY_ID,version=Number(process.env.COMMERCE_CREDENTIALS_ENCRYPTION_VERSION||"1");
 if(!keyId||String(row.encryption_key_id)!==keyId||Number(row.encryption_version)!==version)throw new Error("Credential envelope configuration mismatch.");
 return decryptCommerceCredential({keyId,encryptionVersion:version,iv:bytes(row.secret_iv),ciphertext:bytes(row.secret_ciphertext)},decodeCommerceCredentialKey(process.env.COMMERCE_CREDENTIALS_ENC_KEY));
}

async function main(){
 const requested=Number(process.argv.find(v=>v.startsWith("--max="))?.split("=")[1]||"10");
 if(!Number.isInteger(requested)||requested<1||requested>HARD_MAX)throw new Error("--max must be 1..10.");
 const connections=await db("commerce_provider_connections?provider=eq.commas&status=eq.connected&select=id,organization_id&limit=2");
 if(connections.length!==1)throw new Error("Expected exactly one connected Commas connection.");
 const secret=await credential(String(connections[0].id),String(connections[0].organization_id));
 const client=new CommasClient({apiKey:secret,environment:"production"});
 const page=await client.listTransactions({page:1,perPage:requested},{correlationId:`commas-readonly-audit-${crypto.randomUUID()}`});
 const items=page.items.slice(0,requested);
 console.log(JSON.stringify({
   event:"commas_readonly_raw_evidence_audit",
   mode:"read_only",
   providerRequests:1,
   sourceTransactions:items.length,
   writes:0,
   checkpointsAdvanced:false,
   observations:items.map(v=>auditCommasRawTransaction(v as Row))
 }));
}
void main().catch(e=>{console.error(e instanceof Error?e.message:"Commas read-only audit failed.");process.exitCode=1;});
