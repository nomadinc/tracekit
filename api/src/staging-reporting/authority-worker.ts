import {createAuthority,type AuthorityEnv} from './authority.ts';
export default {async fetch(request:Request,env:AuthorityEnv){try{return await createAuthority(env).fetch(request);}catch{return Response.json({error:'reporting_unavailable'},{status:503,headers:{'cache-control':'no-store'}})}}};
