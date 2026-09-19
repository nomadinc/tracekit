import type { CheckoutChampQueryCredential } from "./client.ts";

export type LegacyCheckoutChampCredentialRow = {
  base_url: string;
  username: string;
  password_ciphertext: string;
  password_iv: string;
  password_key_version: number;
};

/**
 * Temporary migration bridge. The caller supplies the existing legacy decryptor
 * so credential plaintext never enters Core tables or metadata. Remove this
 * bridge after credential rotation into commerce_provider_credentials.
 */
export async function checkoutChampCredentialFromLegacy(
  row: LegacyCheckoutChampCredentialRow,
  decrypt: (iv: string, ciphertext: string, keyVersion: number) => Promise<string>,
): Promise<CheckoutChampQueryCredential> {
  const password = await decrypt(row.password_iv, row.password_ciphertext, row.password_key_version);
  if (!password) throw new Error("Checkout Champ legacy credential decrypted to an empty password.");
  return {
    baseUrl: String(row.base_url || "https://api.checkoutchamp.com").replace(/\/+$/,""),
    loginId: required(row.username, "username"),
    password,
  };
}
function required(v:unknown,label:string){const s=String(v??"").trim();if(!s)throw new Error(`Checkout Champ legacy ${label} is required.`);return s;}
