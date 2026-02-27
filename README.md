# Nara CLI

CLI and SDK for the Nara chain (Solana-compatible).

## Architecture

```text
NaraSDK
├── Solana web3.js          ── RPC communication, transaction signing
├── Meteora DBC SDK         ── Dynamic Bonding Curve pools & swaps
├── Meteora CP-AMM SDK      ── Post-graduation concentrated liquidity
├── snarkjs (Groth16)       ── Zero-knowledge proof generation
└── BIP39 + ed25519-hd-key  ── Wallet derivation (m/44'/501'/0'/0')
```

### Wallet

Standard Solana-compatible wallet using BIP39 mnemonics and ed25519 key derivation. Supports NSO transfers, SPL token transfers, and balance queries.

### Quest (Answer-to-Earn with ZK Proofs)

On-chain quiz system where correct answers earn NSO rewards:

1. Fetch the current question from the Anchor program
2. Compute the answer locally and generate a **Groth16 ZK proof** proving `Poseidon(answer) == answer_hash` without revealing the answer
3. Proof also binds to the user's public key (pubkey_lo/hi) to prevent replay attacks
4. Submit proof on-chain (directly or via gasless relay). The program verifies the proof and distributes rewards to winners

Circuit files: `answer_proof.wasm` + `answer_proof_final.zkey` (BN254 curve).

### Token Lifecycle (DBC)

1. **Config** - Create bonding curve parameters (supply, initial/migration market cap, fees) via Meteora's `DynamicBondingCurveClient`
2. **Pool** - Launch a token pool with the bonding curve config, optionally with an initial buy
3. **Swap** - Buy/sell tokens on the bonding curve. Supports three modes: exact-in, partial-fill, exact-out
4. **Migrate** - When curve reaches 100%, graduate the pool to Meteora DAMM V2 (Concentrated Position AMM). Requires two Position NFT keypairs for liquidity positions

## Installation

```bash
npm install nara-cli
```

## SDK Usage

```typescript
import { NaraSDK } from "nara-cli";

const sdk = new NaraSDK({
  rpcUrl: "https://mainnet-api.nara.build/",
  commitment: "confirmed",
});
```

### Quest SDK

```typescript
import {
  getQuestInfo,
  hasAnswered,
  generateProof,
  submitAnswer,
  submitAnswerViaRelay,
  parseQuestReward,
  Keypair,
} from "nara-cli";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://mainnet-api.nara.build/", "confirmed");
const wallet = Keypair.fromSecretKey(/* your secret key */);

// 1. Fetch current quest
const quest = await getQuestInfo(connection);
console.log(quest.question, quest.remainingSlots, quest.timeRemaining);

// 2. Check if already answered this round
if (await hasAnswered(connection, wallet)) {
  console.log("Already answered");
}

// 3. Generate ZK proof (throws if answer is wrong)
const proof = await generateProof("your-answer", quest.answerHash, wallet.publicKey);

// 4a. Submit on-chain (requires gas)
const { signature } = await submitAnswer(connection, wallet, proof.solana);

// 4b. Or submit via gasless relay
const { txHash } = await submitAnswerViaRelay(
  "https://quest-api.nara.build/",
  wallet.publicKey,
  proof.hex
);

// 5. Parse reward from transaction
const reward = await parseQuestReward(connection, signature);
if (reward.rewarded) {
  console.log(`${reward.rewardNso} NSO (winner ${reward.winner})`);
}
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
