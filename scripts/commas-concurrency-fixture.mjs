/** Shared minimal schema fixture for native concurrency validation; not a migration. */
export const org='00000000-0000-0000-0000-000000000001',connection='00000000-0000-0000-0000-000000000002',account='00000000-0000-0000-0000-000000000003';
export const order='00000000-0000-0000-0000-000000000004',event='00000000-0000-0000-0000-000000000005',evidence='00000000-0000-0000-0000-000000000006',dispute='00000000-0000-0000-0000-000000000007';
export const other='00000000-0000-0000-0000-000000000099',hash='a'.repeat(64);
export async function setup(db,linkSql){
 await db.exec(`

 create table commerce_provider_disputes(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_dispute_id text,matched_canonical_order_id uuid,reconciliation_state text,status text,amount numeric,fee numeric,currency text,fee_currency text,updated_at timestamptz,latest_event_id uuid,latest_evidence_id uuid,refund_relationships jsonb);
 create table commerce_dispute_webhook_events(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,provider_dispute_id text,event_type text,evidence_id uuid,payload_hash text,provider_event_id text,provider_updated_at timestamptz);
 create table commerce_evidence_records(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,payload_hash text,source_object_type text,source_object_id text,pii_classification text,deleted_at timestamptz);
 create table commerce_source_mappings(id uuid primary key,organization_id uuid,connection_id uuid,provider_account_id uuid,source_object_type text,source_object_id text,canonical_object_type text,canonical_object_id uuid,state text,unique(connection_id,provider_account_id,source_object_type,source_object_id));
 create table platform_orders(organization_id uuid,connection_id uuid,provider_account_id uuid,canonical_order_id uuid,person_id uuid,tkid text);
 `);
 await db.exec(linkSql);
 await db.query(`insert into commerce_provider_disputes values($1,$2,$3,$4,'dispute',null,'unmatched','won',49,15,null,'EUR','2026-10-14',$5,$6,'["refund"]')`,[dispute,org,connection,account,event,evidence]);
 await db.query(`insert into commerce_dispute_webhook_events values($1,$2,$3,$4,'dispute','dispute.updated',$5,$6,'event','2026-10-12')`,[event,org,connection,account,evidence,hash]);
 await db.query(`insert into commerce_evidence_records values($1,$2,$3,$4,$5,'commas_dispute_webhook','event','restricted',null)`,[evidence,org,connection,account,hash]);
 await db.query(`insert into ws001_dispute_preparation.verified_identity(event_id,evidence_id,payload_hash,numeric_transaction_id,public_order_id,verifier_version) values($1,$2,$3,'42','ORD-ABC','fixture-v1')`,[event,evidence,hash]);
 await db.query(`insert into commerce_source_mappings values(gen_random_uuid(),$1,$2,$3,'transaction','42','order',$4,'active'),(gen_random_uuid(),$1,$2,$3,'commas_public_transaction','ORD-ABC','order',$4,'active')`,[org,connection,account,order]);
 await db.query(`insert into platform_orders values($1,$2,$3,$4,null,null)`,[org,connection,account,order]);
}
