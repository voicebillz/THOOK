# thook.vip

`npm install && npm run dev` — set `VITE_API_URL` and `VITE_WALLETCONNECT_PROJECT_ID` (see `.env.example`).
Pages: `/` (home), `/stats`, `/thook`, `/admin` (not linked; admin wallet only).
Buy button: defaults to Uniswap; override with `VITE_BUY_URL` (`{token}` is replaced by the CA).
