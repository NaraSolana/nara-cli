---
name: nara-cli
description: "Nara chain CLI and SDK agent. Use when the user mentions: Nara, NSO, Nara wallet, balance, transfer NSO, buy/sell tokens, swap, pool, bonding curve, quest, answer quest, migrate, or any blockchain transaction on the Nara chain. Also triggers for keywords: token launch, token pool, swap quote, airdrop, keypair, mnemonic, quest agent, auto-answer."
---

# Nara CLI

CLI for the Nara chain (Solana-compatible). Native coin is **NSO** (not SOL).

```
npx naracli <command> [options]
```

> Development: `npx tsx bin/nara-cli.ts <command> [options]` (same options)

## Global Options

| Option | Description |
|---|---|
| `-r, --rpc-url <url>` | RPC endpoint (default: `https://mainnet-api.nara.build/`) |
| `-w, --wallet <path>` | Wallet keypair JSON (default: `~/.config/nara/id.json`) |
| `-j, --json` | JSON output |

## Wallet

```
wallet create [-o <path>]                          # Create new wallet (outputs mnemonic)
wallet import -m "<mnemonic>" [-o <path>]           # Import from mnemonic
wallet import -k "<private-key>" [-o <path>]        # Import from private key
wallet address                                      # Show wallet address
wallet balance [address]                            # Check NSO balance
wallet token-balance <token-address> [--owner <addr>]  # Check token balance
wallet tx-status <signature>                        # Check transaction status
wallet transfer <to> <amount> [-e]                  # Transfer NSO
wallet transfer-token <token> <to> <amount> [--decimals 6] [-e]  # Transfer tokens
```

## Quest

```
quest get                                           # Get current quest info
quest answer <answer> [--relay [url]]               # Submit answer with ZK proof
```

`--relay` enables gasless submission via relay service.

## Pool

```
pool create -n <name> -s <symbol> -u <uri> --dbc-config <addr> [--creator <addr>] [-e]
pool create-with-buy -n <name> -s <symbol> -u <uri> --dbc-config <addr> --amount <nso> [--creator <addr>] [--buyer <addr>] [--receiver <addr>] [--slippage 100] [-e]
pool info <token-address>
pool progress <token-address>
```

## Swap

```
swap buy <token-address> <amount> [--slippage 100] [--mode partial-fill] [-e]
swap sell <token-address> <amount> [--decimals 6] [--slippage 100] [--mode partial-fill] [-e]
swap quote <token-address> <amount> <buy|sell> [--decimals 6] [--slippage 100]
```

Swap modes: `exact-in`, `partial-fill` (default), `exact-out`.

## Config

```
config create [--fee-claimer <addr>] [--leftover-receiver <addr>] [--total-supply 1000000000] [--initial-mcap 30] [--migration-mcap 540] [-e]
```

## Migrate

```
migrate check <token-address>                       # Check migration eligibility
migrate launch <token-address> [-e]                 # Migrate to DAMM V2
migrate create-locker <token-address> [-e]          # Create locker (before migration if vesting)
```

## Quest Agent Workflow

When the user asks to auto-answer quests or run the quest agent, follow this loop:

1. **Fetch question**: `npx naracli quest get --json`
2. **Check**: If expired or no active quest, wait 15s and retry
3. **Solve**: Analyze the question and compute the answer. See [references/quest-questions.md](references/quest-questions.md) for question types and solving strategies
4. **Submit immediately**: `npx naracli quest answer "<answer>"`
5. **Speed matters** - rewards are first-come-first-served, minimize delay between fetch and submit
6. **Loop**: If user requests multiple rounds, go back to step 1 after submission

Key constraints:
- Each round has a deadline (check `timeRemaining` from quest get)
- ZK proof generation takes ~2-4s
- Answer must be exact (case-sensitive for strings)
- If already answered this round, wait for next round
