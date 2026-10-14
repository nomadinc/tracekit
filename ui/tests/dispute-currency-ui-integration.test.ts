import assert from "node:assert/strict";
import test from "node:test";
import {disputeCurrencyFields} from "../lib/chargebacks/currency";
import {formatDisputeAmount} from "../lib/chargebacks/format-currency";

test("qualified API values reach UI without principal or fee currency fallback",()=>{
 const row=disputeCurrencyFields({currency:"EUR",currency_source:"provider_payload.currency",fee_currency:"GBP",fee_currency_source:"provider_payload.fee_currency"});
 assert.equal(formatDisputeAmount(200,row.currency,row.currencySource),"€200.00");
 assert.equal(formatDisputeAmount(0,row.feeCurrency,row.feeCurrencySource),"£0.00");
 const unverified=disputeCurrencyFields({currency:"USD",fee_currency:"GBP",fee_currency_source:"provider_payload.fee_currency"});
 assert.equal(formatDisputeAmount(200,unverified.currency,unverified.currencySource),"200.00 (currency unknown)");
 assert.equal(formatDisputeAmount(15,unverified.feeCurrency,unverified.feeCurrencySource),"£15.00");
 const noFee=disputeCurrencyFields({currency:"EUR",currency_source:"provider_payload.currency"});
 assert.equal(formatDisputeAmount(15,noFee.feeCurrency,noFee.feeCurrencySource),"15.00 (currency unknown)");
});
