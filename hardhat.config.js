require("@nomicfoundation/hardhat-toolbox");

// Robinhood Chain mainnet (chainId 4663) — the only network THOOK lives on.
// Uniswap v4 PoolManager there: 0x8366a39CC670B4001A1121B8F6A443A643e40951.
const RH_RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const FORK = !!process.env.FORK;
const key = (process.env.PRIVATE_KEY || "").trim().replace(/^0x/, "");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [{
      version: "0.8.26",
      settings: { optimizer: { enabled: true, runs: 800 }, viaIR: false, evmVersion: "cancun" },
    }],
  },
  networks: {
    hardhat: FORK ? { forking: { url: RH_RPC }, chainId: 4663 } : {},
    robinhood: { url: RH_RPC, chainId: 4663, accounts: /^[0-9a-fA-F]{64}$/.test(key) ? ["0x" + key] : [] },
  },
  mocha: { timeout: 600_000 },
};
