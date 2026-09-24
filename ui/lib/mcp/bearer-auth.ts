const MCP_RESOURCE = "https://app.trace-kit.io/api/mcp";

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtPayload = {
  iss?: string; aud?: string | string[]; sub?: string; org_id?: string;
  exp?: number; nbf?: number; iat?: number; client_id?: string; scope?: string;
};

function b64url(value:string) {
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length/4)*4,"="),"base64");
}
function authKitIssuer() {
  const raw=String(process.env.WORKOS_AUTHKIT_DOMAIN || process.env.AUTHKIT_DOMAIN || "").trim();
  if(!raw) throw new Error("mcp_auth_not_configured");
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw.replace(/\/$/,"") : `https://${raw.replace(/\/$/,"")}`;
}
function audienceMatches(aud:JwtPayload["aud"]) {
  return typeof aud==="string" ? aud===MCP_RESOURCE : Array.isArray(aud) && aud.includes(MCP_RESOURCE);
}
async function jwkFor(issuer:string,kid:string) {
  const res=await fetch(`${issuer}/oauth2/jwks`,{cache:"no-store",headers:{accept:"application/json"}});
  if(!res.ok) throw new Error("invalid_bearer_token");
  const body=await res.json() as {keys?:JsonWebKey[]};
  const key=(body.keys||[]).find((candidate:any)=>candidate.kid===kid);
  if(!key) throw new Error("invalid_bearer_token");
  return key;
}

export function bearerToken(request:Request) {
  const match=request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
export async function verifyMcpBearerToken(token:string) {
  const parts=token.split(".");
  if(parts.length!==3) throw new Error("invalid_bearer_token");
  let header:JwtHeader,payload:JwtPayload;
  try { header=JSON.parse(b64url(parts[0]).toString("utf8")); payload=JSON.parse(b64url(parts[1]).toString("utf8")); }
  catch { throw new Error("invalid_bearer_token"); }
  if(header.alg!=="RS256" || !header.kid) throw new Error("invalid_bearer_token");
  const issuer=authKitIssuer();
  if(payload.iss!==issuer || !audienceMatches(payload.aud) || !payload.sub || !payload.org_id) throw new Error("invalid_bearer_token");
  const now=Math.floor(Date.now()/1000);
  if(!payload.exp || payload.exp<=now || (payload.nbf && payload.nbf>now+60)) throw new Error("invalid_bearer_token");
  const jwk=await jwkFor(issuer,header.kid);
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),Buffer.from(`${parts[0]}.${parts[1]}`));
  if(!ok) throw new Error("invalid_bearer_token");
  return {workosUserId:payload.sub,workosOrganizationId:payload.org_id,authenticationMethod:"oauth_bearer",clientId:payload.client_id||null,scope:payload.scope||""};
}
export function mcpResourceMetadata() {
  const issuer=authKitIssuer();
  return {resource:MCP_RESOURCE,authorization_servers:[issuer],bearer_methods_supported:["header"]};
}
export function mcpWwwAuthenticate() {
  return 'Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="https://app.trace-kit.io/.well-known/oauth-protected-resource"';
}
export const TRACEKIT_MCP_RESOURCE=MCP_RESOURCE;
