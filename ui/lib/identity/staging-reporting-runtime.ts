export function createRestrictedStagingGet(config:{environment:string|undefined;mode:string|undefined;projectUrl:string|undefined;issuerUrl:string|undefined;coreUrl:string|undefined},ports:{auth:()=>Promise<{user:unknown;accessToken?:string}>;activeOrganization:(subject:string)=>Promise<string|null>;fetch:typeof fetch}){return async function restrictedStagingGet(path:string,requestUrl:string){
 const unavailable=(status=503)=>({status,body:{error:'reporting_unavailable'}});
 if(config.environment!=='preview'||config.mode!=='restricted-staging'||config.projectUrl!=='https://joahiwgidfbzwzyslrbq.supabase.co')return unavailable();
 try{
  const auth=await ports.auth();if(!auth.user||!auth.accessToken)return unavailable(403);
  const u=new URL(requestUrl),workspace=u.searchParams.get('workspace_id');if(!workspace||u.searchParams.getAll('workspace_id').length!==1)return unavailable(403);
  let operation='';const params=new URLSearchParams(u.searchParams);params.delete('workspace_id');
  if(path==='/v1/customers')operation='customer_list';
  else if(path==='/v1/customer-orders')operation='customer_orders';
  else if(path==='/v1/profit/summary')operation='profit_summary';
  else {const m=/^\/v1\/customers\/([^/]+)(?:\/journeys\/([^/]+))?$/.exec(path);if(!m)return unavailable(403);operation=m[2]?'journey_detail':'customer_detail';params.set('person_id',decodeURIComponent(m[1]));if(m[2])params.set('journey_id',decodeURIComponent(m[2]));}
  const issuer=new URL(config.issuerUrl||''),core=new URL(config.coreUrl||'');if(issuer.protocol!=='https:'||core.protocol!=='https:'||issuer.username||issuer.password||core.username||core.password)return unavailable();
  const issued=await ports.fetch(new URL('/issue',issuer),{method:'POST',redirect:'error',cache:'no-store',headers:{authorization:`Bearer ${auth.accessToken}`,'content-type':'application/json'},body:JSON.stringify({organization:workspace,workspace})});if(!issued.ok)return unavailable(403);
  const body=await issued.json();if(typeof body.token!=='string'||typeof body.subject!=='string')return unavailable();
  const active=await ports.activeOrganization(body.subject);if(active!==workspace)return unavailable(403);
  params.set('organization',workspace);params.set('workspace',workspace);
  const response=await ports.fetch(new URL('/reporting/'+operation+'?'+params,core),{method:'GET',redirect:'error',cache:'no-store',headers:{authorization:`Bearer ${body.token}`,accept:'application/json'}});if(!response.ok){if(response.status===422){const error=await response.json();if(['profit_offer_identity_unresolved','profit_currency_qualification_required','profit_executive_unverified'].includes(error.error))return {status:422,body:error};}return unavailable(response.status===403?403:503);}return {status:200,body:await response.json()};
 }catch{return unavailable();}
}
}
