/** Currency describes the reported principal/fee, never an actual wallet movement. */
const principalSources=new Set(["provider_payload.currency","workbook.Currency"]);
const feeSources=new Set(["provider_payload.fee_currency","workbook.Fee Currency"]);
function backed(value:unknown,source:unknown,sources:Set<string>){
 const code=typeof value==="string"?value.trim().toUpperCase():"";
 return /^[A-Z]{3}$/.test(code)&&typeof source==="string"&&sources.has(source)?{value:code,source}:{value:null,source:null};
}
export function disputeCurrencyFields(row:Record<string,unknown>){
 const principal=backed(row.currency,row.currency_source,principalSources),fee=backed(row.fee_currency,row.fee_currency_source,feeSources);
 return {currency:principal.value,currencySource:principal.source,feeCurrency:fee.value,feeCurrencySource:fee.source};
}
