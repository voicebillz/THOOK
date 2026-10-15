// Addresses that can never win: protocol contracts, burn, keeper, extra env list.
import { deployment, env, POOL_MANAGER } from "./config.js";
import { keeperAccount } from "./chain.js";

export function systemAddresses() {
  const d = deployment();
  const s = new Set([
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    POOL_MANAGER.toLowerCase(),
    ...env.EXCLUDE,
  ]);
  for (const k of ["token", "vault", "seeder", "hook", "hookDeployer", "safe"]) if (d[k]) s.add(d[k].toLowerCase());
  if (keeperAccount) s.add(keeperAccount.address.toLowerCase());
  if (env.ADMIN_WALLET) s.add(env.ADMIN_WALLET);
  return s;
}
