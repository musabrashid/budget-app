import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
export function plaidClient() {
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (
    !["sandbox", "production"].includes(env) ||
    !process.env.PLAID_CLIENT_ID ||
    !process.env.PLAID_SECRET
  )
    throw new Error("Plaid credentials are not configured.");
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        timeout: 20000,
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": process.env.PLAID_SECRET,
          "Plaid-Version": "2020-09-14",
        },
      },
    }),
  );
}
