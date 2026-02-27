---
name: nara-cli
description: "Nara chain CLI and SDK agent. Use when the user mentions: Nara, NSO, Nara wallet, balance, transfer NSO, buy/sell tokens, swap, pool, bonding curve, quest, answer quest, migrate, or any blockchain transaction on the Nara chain. Also triggers for keywords: token launch, token pool, swap quote, airdrop, keypair, mnemonic, quest agent, auto-answer, claim NSO, earn NSO, mining, mine NSO, faucet, claim reward, get reward, collect reward."
---

# Nara CLI

CLI for the Nara chain (Solana-compatible). Native coin is **NSO** (not SOL).

**Run from any directory** — do NOT `cd` into the naracli source code directory:

```
npx naracli <command> [options]
```

**First run**: use `npx naracli@latest address` to ensure latest version is installed. After that, `npx naracli` will use the cached version.

## IMPORTANT: Wallet Setup (must do first)

**Before running any other command**, check if a wallet exists:

```
npx naracli@latest address
```

If this fails with "No wallet found", create one **before doing anything else**:

```
npx naracli wallet create
```

Do NOT run other commands (quest, swap, etc.) in parallel with wallet check — wait for wallet confirmation first. Wallet is saved to `~/.config/nara/id.json`.

## Global Options

| Option | Description |
|---|---|
| `-r, --rpc-url <url>` | RPC endpoint (default: `https://mainnet-api.nara.build/`) |
| `-w, --wallet <path>` | Wallet keypair JSON (default: `~/.config/nara/id.json`) |
| `-j, --json` | JSON output |

## Commands

```
address                                             # Show wallet address (shortcut)
wallet address                                      # Show wallet address
wallet balance [address]                            # Check NSO balance
wallet token-balance <token-address> [--owner <addr>]  # Check token balance
wallet tx-status <signature>                        # Check transaction status
wallet transfer <to> <amount> [-e]                  # Transfer NSO
wallet transfer-token <token> <to> <amount> [--decimals 6] [-e]  # Transfer tokens
quest get                                           # Get current quest info
quest answer <answer> [--relay [url]]               # Submit answer with ZK proof
pool create -n <name> -s <symbol> -u <uri> --dbc-config <addr> [--creator <addr>] [-e]
pool create-with-buy -n <name> -s <symbol> -u <uri> --dbc-config <addr> --amount <nso> [--creator <addr>] [--buyer <addr>] [--receiver <addr>] [--slippage 100] [-e]
pool info <token-address>
pool progress <token-address>
swap buy <token-address> <amount> [--slippage 100] [--mode partial-fill] [-e]
swap sell <token-address> <amount> [--decimals 6] [--slippage 100] [--mode partial-fill] [-e]
swap quote <token-address> <amount> <buy|sell> [--decimals 6] [--slippage 100]
config create [--fee-claimer <addr>] [--leftover-receiver <addr>] [--total-supply 1000000000] [--initial-mcap 30] [--migration-mcap 540] [-e]
migrate check <token-address>
migrate launch <token-address> [-e]
migrate create-locker <token-address> [-e]
```

`--relay` enables gasless quest submission. Swap modes: `exact-in`, `partial-fill` (default), `exact-out`.

## Quest Agent Workflow

When the user asks to auto-answer quests, run the quest agent, or uses keywords like: airdrop, claim NSO, earn NSO, mining, faucet, claim/get/collect reward — these all refer to the quest system (answering quests is the only way to earn NSO):

1. **Wallet check**: Run `npx naracli address` first. If no wallet, run `npx naracli wallet create` and wait for it to complete
2. **Balance check**: Run `npx naracli wallet balance --json` to get NSO balance
3. **Fetch**: `npx naracli quest get --json`
4. **Check**: If expired or no active quest, wait 15s and retry
5. **Solve**: Analyze the question and compute the answer. See [references/quest-questions.md](references/quest-questions.md) for question types
6. **Submit**: Choose submission method based on balance:
   - Balance >= 0.1 NSO: `npx naracli quest answer "<answer>"` (direct on-chain, faster)
   - Balance < 0.1 NSO: `npx naracli quest answer "<answer>" --relay` (gasless via relay)
7. **Speed matters** — rewards are first-come-first-served
8. **Loop**: Go back to step 3 for multiple rounds (balance check only needed once)

Constraints: deadline (`timeRemaining`), ZK proof ~2-4s, answer must be exact, skip if already answered this round.
