import type{DurableAuthorizationEnvelope}from"./action-authorization-repository";
import{consumeMcpActionAuthorization,findMcpActionAuthorization,issueMcpActionAuthorization}from"./action-authorization-repository";
import{readMcpExecutionResult}from"./action-execution-result-repository";

export type DurableExecutionGateDecision<T> =
 | {decision:"execute";envelope:DurableAuthorizationEnvelope;consumptionId:string}
 | {decision:"replay_same_result";envelope:DurableAuthorizationEnvelope;result:T}
 | {decision:"reject";envelope:DurableAuthorizationEnvelope;reason:"authorization_rejected"|"replay_result_unavailable"};

export async function resolveDurableExecutionGate<T>(input:{envelope:DurableAuthorizationEnvelope;requestedAt:string;consumptionId:string}):Promise<DurableExecutionGateDecision<T>>{
 const authorization=(await findMcpActionAuthorization(input.envelope))||await issueMcpActionAuthorization(input.envelope);
 const durable=await consumeMcpActionAuthorization({authorizationId:authorization.authorizationId,envelope:input.envelope,requestedAt:input.requestedAt,consumptionId:input.consumptionId});
 if(durable.decision==="replay_same_result"){
  const prior=await readMcpExecutionResult<T>({envelope:input.envelope});
  return prior?{decision:"replay_same_result",envelope:input.envelope,result:prior}:{decision:"reject",envelope:input.envelope,reason:"replay_result_unavailable"};
 }
 if(durable.decision!=="consume"||!durable.consumptionId)return{decision:"reject",envelope:input.envelope,reason:"authorization_rejected"};
 return{decision:"execute",envelope:input.envelope,consumptionId:durable.consumptionId};
}
