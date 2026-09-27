import { sha256 } from "./tkid.ts";

export type TkidCtaDefinition={cta_id:string;cta_version:string;funnel_step_id:string;action_type:string;match_type:"marker"|"selector";match_value:string};
export type TkidPageDefinition={match_type:"pathname_exact";pathname:string;page_id:string;funnel_step_id:string;emit_page_viewed:boolean;emit_funnel_step_viewed:boolean;ctas:TkidCtaDefinition[]};
export type TkidBrowserDefinition={schema_version:1;privacy_mode:"essential";pages:TkidPageDefinition[]};

const id=/^[a-z][a-z0-9_-]{0,95}$/,version=/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const marker=/^[a-z][a-z0-9_-]{0,63}$/;
const selector=/^(\.[A-Za-z][A-Za-z0-9_-]{0,63}|#[A-Za-z][A-Za-z0-9_-]{0,63}|\[data-tracekit-cta="[a-z][a-z0-9_-]{0,63}"\])$/;
const exactKeys=(value:any,keys:string[])=>value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join("|")===keys.sort().join("|");

export function validateTkidBrowserDefinition(value:unknown):TkidBrowserDefinition{
  const d=value as any;
  if(!exactKeys(d,["schema_version","privacy_mode","pages"])||d.schema_version!==1||d.privacy_mode!=="essential"||!Array.isArray(d.pages)||d.pages.length<1||d.pages.length>32)throw new Error("invalid_browser_instrumentation_config");
  const paths=new Set<string>();
  for(const page of d.pages){
    if(!exactKeys(page,["match_type","pathname","page_id","funnel_step_id","emit_page_viewed","emit_funnel_step_viewed","ctas"])||page.match_type!=="pathname_exact"||typeof page.pathname!=="string"||!/^\/[A-Za-z0-9/_-]{0,255}$/.test(page.pathname)||!id.test(page.page_id)||!id.test(page.funnel_step_id)||typeof page.emit_page_viewed!=="boolean"||typeof page.emit_funnel_step_viewed!=="boolean"||!Array.isArray(page.ctas)||page.ctas.length>16||paths.has(page.pathname))throw new Error("invalid_browser_instrumentation_config");
    paths.add(page.pathname);const ctaIds=new Set<string>();
    for(const cta of page.ctas){
      if(!exactKeys(cta,["cta_id","cta_version","funnel_step_id","action_type","match_type","match_value"])||!id.test(cta.cta_id)||!version.test(cta.cta_version)||!id.test(cta.funnel_step_id)||!id.test(cta.action_type)||!(cta.match_type==="marker"?marker:cta.match_type==="selector"?selector:/a^/).test(cta.match_value)||ctaIds.has(cta.cta_id))throw new Error("invalid_browser_instrumentation_config");
      ctaIds.add(cta.cta_id);
    }
  }
  return structuredClone(d);
}

function stable(value:any):string{if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")}}`;return JSON.stringify(value)}

export async function readTkidBrowserConfiguration(db:any,resolved:any,requestedVersion:string|null){
  let query=db.from("tkid_browser_instrumentation_configs").select("id,config_version,sdk_version,definition,definition_sha256,source_commit,approved_at").eq("organization_id",resolved.source.organization_id).eq("source_id",resolved.source.id).eq("status","active");
  if(requestedVersion)query=query.eq("config_version",requestedVersion);
  const {data,error}=await query.maybeSingle();
  if(error||!data)return null;
  const definition=validateTkidBrowserDefinition(data.definition);
  if(await sha256(stable(definition))!==data.definition_sha256)throw new Error("browser_instrumentation_integrity_failed");
  return{config_id:data.id,config_version:data.config_version,sdk_version:data.sdk_version,definition,definition_sha256:data.definition_sha256,source_commit:data.source_commit,approved_at:data.approved_at};
}
