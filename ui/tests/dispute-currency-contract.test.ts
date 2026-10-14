import test from "node:test";
import assert from "node:assert/strict";
import {disputeCurrencyFields} from "../lib/chargebacks/currency.ts";
test("legacy USD without provenance remains unknown",()=>{
 assert.deepEqual(disputeCurrencyFields({currency:"USD",fee:15,provider:"commas",locale:"en-US"}),{currency:null,currencySource:null,feeCurrency:null,feeCurrencySource:null});
});
test("principal and fee preserve independent source-backed codes",()=>{
 assert.deepEqual(disputeCurrencyFields({currency:"eur",currency_source:"provider_payload.currency",fee_currency:"GBP",fee_currency_source:"provider_payload.fee_currency"}),{currency:"EUR",currencySource:"provider_payload.currency",feeCurrency:"GBP",feeCurrencySource:"provider_payload.fee_currency"});
 assert.equal(disputeCurrencyFields({currency:"USD",currency_source:"provider_payload.currency"}).feeCurrency,null);
});
test("missing, invalid and unrecognized provenance never gain a currency",()=>{
 for(const row of [{},{currency:"$",currency_source:"provider_payload.currency"},{currency:"USD",currency_source:"account"},{fee_currency:"USD",fee_currency_source:"locale"}]){
 assert.equal(disputeCurrencyFields(row).currency,null);assert.equal(disputeCurrencyFields(row).feeCurrency,null);
 }
});

test("principal and fee reject each other's provenance categories",()=>{
 const values=disputeCurrencyFields({currency:"EUR",currency_source:"provider_payload.fee_currency",fee_currency:"GBP",fee_currency_source:"provider_payload.currency"});
 assert.deepEqual(values,{currency:null,currencySource:null,feeCurrency:null,feeCurrencySource:null});
 const workbook=disputeCurrencyFields({currency:"EUR",currency_source:"workbook.Fee Currency",fee_currency:"GBP",fee_currency_source:"workbook.Currency"});
 assert.deepEqual(workbook,values);
});
