import {initTraceKitJourney,TRACEKIT_JOURNEY_SDK_VERSION,TraceKitJourneyClient} from "./browser-client";

export type DeclarativeCta={cta_id:string;cta_version:string;funnel_step_id:string;action_type:string;match_type:"marker"|"selector";match_value:string};
export type DeclarativePage={match_type:"pathname_exact";pathname:string;page_id:string;funnel_step_id:string;emit_page_viewed:boolean;emit_funnel_step_viewed:boolean;ctas:DeclarativeCta[]};
export type DeclarativeDefinition={schema_version:1;privacy_mode:"essential";pages:DeclarativePage[]};
export type UniversalInstall={endpoint:string;publicSourceId:string;configVersion?:string};
type Delivered={ok:true;config_version:string;sdk_version:string;definition_sha256:string;definition:DeclarativeDefinition};

const ids=/^[a-z][a-z0-9_-]{0,95}$/,versions=/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/,markers=/^[a-z][a-z0-9_-]{0,63}$/;
const selectors=/^(\.[A-Za-z][A-Za-z0-9_-]{0,63}|#[A-Za-z][A-Za-z0-9_-]{0,63}|\[data-tracekit-cta="[a-z][a-z0-9_-]{0,63}"\])$/;
const exact=(v:any,k:string[])=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join("|")===k.sort().join("|");

export function validateDeclarativeDefinition(value:unknown):DeclarativeDefinition{
  const d=value as any;if(!exact(d,["schema_version","privacy_mode","pages"])||d.schema_version!==1||d.privacy_mode!=="essential"||!Array.isArray(d.pages)||d.pages.length<1||d.pages.length>32)throw new TypeError("Invalid TraceKit browser configuration");
  const paths=new Set<string>();for(const p of d.pages){if(!exact(p,["match_type","pathname","page_id","funnel_step_id","emit_page_viewed","emit_funnel_step_viewed","ctas"])||p.match_type!=="pathname_exact"||typeof p.pathname!=="string"||!/^\/[A-Za-z0-9/_-]{0,255}$/.test(p.pathname)||!ids.test(p.page_id)||!ids.test(p.funnel_step_id)||typeof p.emit_page_viewed!=="boolean"||typeof p.emit_funnel_step_viewed!=="boolean"||!Array.isArray(p.ctas)||p.ctas.length>16||paths.has(p.pathname))throw new TypeError("Invalid TraceKit browser configuration");paths.add(p.pathname);const ctas=new Set<string>();for(const c of p.ctas){if(!exact(c,["cta_id","cta_version","funnel_step_id","action_type","match_type","match_value"])||!ids.test(c.cta_id)||!versions.test(c.cta_version)||!ids.test(c.funnel_step_id)||!ids.test(c.action_type)||!(c.match_type==="marker"?markers:c.match_type==="selector"?selectors:/a^/).test(c.match_value)||ctas.has(c.cta_id))throw new TypeError("Invalid TraceKit browser configuration");ctas.add(c.cta_id)}}return structuredClone(d)
}

function installKey(input:UniversalInstall){return`${input.endpoint}|${input.publicSourceId}|${input.configVersion||"active"}`}
const runtimes=new Map<string,Promise<TraceKitUniversalRuntime|null>>();

export class TraceKitUniversalRuntime{
  private listener:((event:Event)=>void)|null=null;private tornDown=false;
  constructor(readonly client:TraceKitJourneyClient,readonly config:Delivered,readonly page:DeclarativePage){}
  async start(){const started=await this.client.startJourney();if(!started||this.tornDown)return false;if(this.page.emit_page_viewed&&!await this.client.trackPageView({pageId:this.page.page_id}))return false;if(this.page.emit_funnel_step_viewed&&!await this.client.trackFunnelStep({funnelStepId:this.page.funnel_step_id}))return false;this.attach();return true}
  private attach(){if(this.listener||!this.page.ctas.length)return;this.listener=(event:Event)=>{if(this.tornDown||!event.isTrusted)return;const target=event.target;if(!(target instanceof Element))return;const match=this.page.ctas.find(cta=>target.closest(cta.match_type==="marker"?`[data-tracekit-cta="${cta.match_value}"]`:cta.match_value));if(!match)return;void this.client.trackCta({ctaId:match.cta_id,ctaVersion:match.cta_version,funnelStepId:match.funnel_step_id,actionType:match.action_type})};document.addEventListener("click",this.listener,false)}
  async teardown(){this.tornDown=true;if(this.listener)document.removeEventListener("click",this.listener,false);this.listener=null;await this.client.flush()}
}

export function initUniversalTraceKit(input:UniversalInstall){const endpoint=new URL(input.endpoint);if(endpoint.protocol!=="https:"||endpoint.pathname!=="/"||endpoint.search||endpoint.hash||!/^tksrc_[a-z0-9][a-z0-9_-]{5,95}$/.test(input.publicSourceId)||input.configVersion&&!/^[1-9][0-9]{0,5}$/.test(input.configVersion))throw new TypeError("Invalid TraceKit universal installation");const normalized={...input,endpoint:endpoint.origin},key=installKey(normalized),prior=runtimes.get(key);if(prior)return prior;const started=startUniversal(normalized);runtimes.set(key,started);return started}

async function startUniversal(input:UniversalInstall){try{const url=new URL("/v1/tkid/browser-config",input.endpoint);url.searchParams.set("source",input.publicSourceId);if(input.configVersion)url.searchParams.set("version",input.configVersion);const response=await fetch(url,{method:"GET",credentials:"omit",headers:{accept:"application/json"}});if(!response.ok)return null;const delivered=await response.json() as Delivered;if(!delivered.ok||delivered.sdk_version!==TRACEKIT_JOURNEY_SDK_VERSION||!/^[0-9a-f]{64}$/.test(delivered.definition_sha256))return null;const definition=validateDeclarativeDefinition(delivered.definition),matches=definition.pages.filter(page=>page.pathname===location.pathname);if(matches.length!==1)return null;const client=initTraceKitJourney({endpoint:input.endpoint,publicSourceId:input.publicSourceId,privacyMode:"essential",autoPageView:false});const runtime=new TraceKitUniversalRuntime(client,{...delivered,definition},matches[0]);return await runtime.start()?runtime:null}catch{return null}}

export function installFromCurrentScript(script:HTMLScriptElement|null=document.currentScript as HTMLScriptElement|null){if(!script)return Promise.resolve(null);return initUniversalTraceKit({endpoint:script.dataset.endpoint||"https://api.trace-kit.io",publicSourceId:script.dataset.source||"",configVersion:script.dataset.configVersion})}
