import 'server-only';
import {withAuth} from '@workos-inc/authkit-nextjs';
import {cookies} from 'next/headers';
import {ACTIVE_ORGANIZATION_COOKIE,readActiveOrganization} from './active-organization-cookie';
import {createRestrictedStagingGet} from './staging-reporting-runtime';
export async function restrictedStagingGet(path:string,url:string){
 return createRestrictedStagingGet({environment:process.env.VERCEL_ENV,mode:process.env.TRACEKIT_REPORTING_MODE,projectUrl:process.env.REPORTING_SUPABASE_URL,issuerUrl:process.env.REPORTING_AUTHORITY_URL,coreUrl:process.env.REPORTING_CORE_URL},{auth:withAuth,activeOrganization:async(subject)=>readActiveOrganization((await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value,subject),fetch:(...args)=>fetch(...args)})(path,url);
}
