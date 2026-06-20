# Environment Variables Inventory

**Rule**: Only list variable names. Never commit real values or secrets.

## Current / Planned Variables

| Variable Name                        | Purpose                                      | Status          | Notes |
|--------------------------------------|----------------------------------------------|------------------|-------|
| `NEXT_PUBLIC_API_BASE_URL`           | Base URL for future backend API              | Deferred        | Placeholder only |
| `NEXT_PUBLIC_ENABLE_REVIEW`          | Feature flag for review routes               | Planned         | Default: `false` |
| `NEXT_PUBLIC_ALGOD_NETWORK`          | Algorand network (testnet/mainnet)           | Deferred        | Testnet placeholder only |
| `ALGOD_API_KEY`                      | Algorand API key                             | Deferred secret | Do not commit |
| `ALGOD_SERVER`                       | Algorand node server URL                     | Deferred        | - |
| `INDEXER_API_KEY`                    | Algorand Indexer API key                     | Deferred secret | Do not commit |
| `WALLET_PRIVATE_KEY`                 | Wallet private key                           | **Forbidden**   | Never store in repo |
| `MNEMONIC` / `SEED_PHRASE`           | Wallet seed phrase                           | **Forbidden**   | Never store in repo |

## Rules for Agents
- Never introduce new environment variables that hold secrets without owner approval.
- All new env vars must be documented in this file first.
- Use `.env.example` or similar for documentation only.