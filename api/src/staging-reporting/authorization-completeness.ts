import { ReportingDenied } from './client.ts';
import type { AuthorizationRead } from '../../../ui/lib/identity/authorization-completeness.ts';
export async function completeAuthorizationRows(response: Response, source: string): Promise<{ rows: Record<string, unknown>[]; evidence: AuthorizationRead }> {
 const range = response.headers.get('content-range');
 const match = /^(\d+)-(\d+)\/(\d+)$/.exec(range || '');
 const empty = range === '*/0';
 if (response.status !== 200 || response.headers.get('preference-applied') !== 'count=exact'
  || (!match && !empty)) throw new ReportingDenied(503);
 const total = empty ? 0 : Number(match![3]);
 if (!Number.isSafeInteger(total) || total < 0 || total > 50
  || (!empty && (Number(match![1]) !== 0 || Number(match![2]) !== total-1))) throw new ReportingDenied(503);
 const rows = await response.json();
 if (!Array.isArray(rows) || rows.length !== total || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new ReportingDenied(503);
 return { rows, evidence: { source, total, returned: rows.length } };
}
