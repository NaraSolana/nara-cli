# Nara CLI

CLI and SDK for the Nara chain (Solana-compatible).

## Installation

```bash
npm install nara-cli
```

## SDK Usage

```typescript
import { NaraSDK } from "nara-cli";

const sdk = new NaraSDK({
  rpcUrl: "https://testnet.naraso.org/",
  commitment: "confirmed",
});
```

See [examples/](examples/) for complete SDK usage examples.

## CLI

### Setup

```bash
# Create a new wallet
nara-cli wallet create

# Or import from mnemonic / private key
nara-cli wallet import -m "your twelve word mnemonic phrase ..."
nara-cli wallet import -k "your-private-key"
```

Wallet is saved to `~/.config/nara/id.json` by default.

### Commands

```text
wallet    Wallet management (create, import, balance, transfer)
config    Create bonding curve configurations
pool      Create and query token pools
swap      Buy / sell tokens, get quotes
migrate   Check migration eligibility and launch to DAMM V2
quest     On-chain quiz with ZK proof verification
```

Run `nara-cli <command> --help` for details on each command.

### Global Options

| Option                | Description                 |
| --------------------- | --------------------------- |
| `-r, --rpc-url <url>` | RPC endpoint URL            |
| `-w, --wallet <path>` | Path to wallet keypair JSON |
| `-j, --json`          | Output in JSON format       |

### Quick Example

```bash
# Check balance
nara-cli wallet balance

# Buy tokens
nara-cli swap buy <TOKEN_ADDRESS> 0.1

# Answer a quest
nara-cli quest get
nara-cli quest answer "your answer"
```

## License

MIT
