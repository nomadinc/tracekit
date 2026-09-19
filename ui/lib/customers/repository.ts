import type { CustomerDeepLinkState, CustomerDrawerRecord, CustomerJourneyEvent, CustomerListFilter, CustomerScope, CustomerSearchResult, CustomerSummary, CustomerWorkspaceSnapshot } from "./types";
export interface CustomerRepository<TScope = CustomerScope> {
  listCustomers(scope:TScope,filter?:CustomerListFilter):Promise<CustomerSummary[]>;
  resolveCustomer(scope:TScope,customerId:string):Promise<{organizationId:string;businessContextId:string|null;customerId:string}|null>;
  loadWorkspace(scope:TScope,customerId:string):Promise<CustomerWorkspaceSnapshot|null>;
  loadJourney(scope:TScope,customerId:string):Promise<CustomerJourneyEvent[]>;
  loadDrawer(scope:TScope,customerId:string,drawerId:string):Promise<CustomerDrawerRecord|null>;
  search(scope:TScope,query:string):Promise<CustomerSearchResult[]>;
  resolveDeepLink(scope:TScope,state:CustomerDeepLinkState):Promise<CustomerDeepLinkState>;
}
