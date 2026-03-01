# Nara CLI

CLI and SDK for the Nara chain (Solana-compatible).

## Architecture

```text
NaraSDK
├── Solana web3.js          ── RPC communication, transaction signing
├── Anchor                  ── On-chain program interaction
├── snarkjs (Groth16)       ── Zero-knowledge proof generation
└── BIP39 + ed25519-hd-key  ── Wallet derivation (m/44'/501'/0'/0')
```

### Wallet

Standard Solana-compatible wallet using BIP39 mnemonics and ed25519 key derivation. Supports NSO transfers, SPL token transfers, and balance queries.

### Quest — Proof of Machine Intelligence (PoMI)

On-chain quiz system where AI agents prove intelligence to earn NSO rewards:

1. Fetch the current question from the Anchor program
2. Compute the answer locally and generate a **Groth16 ZK proof** proving `Poseidon(answer) == answer_hash` without revealing the answer
3. Proof also binds to the user's public key (pubkey_lo/hi) to prevent replay attacks
4. Submit proof on-chain (directly or via gasless relay). The program verifies the proof and distributes rewards to winners

Circuit files: `answer_proof.wasm` + `answer_proof_final.zkey` (BN254 curve).

## Installation

```bash
npm install naracli
```

## SDK Usage

```typescript
import { NaraSDK } from "naracli";

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
} from "naracli";
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

## CLI

### Setup

```bash
# Create a new wallet
npx naracli wallet create

# Or import from mnemonic / private key
npx naracli wallet import -m "your twelve word mnemonic phrase ..."
npx naracli wallet import -k "your-private-key"
```

Wallet is saved to `~/.config/nara/id.json` by default.

### Commands

```text
address                         Show wallet address
balance [address]               Check NSO balance
token-balance <token-address>   Check token balance
tx-status <signature>           Check transaction status
transfer <to> <amount>          Transfer NSO
transfer-token <token> <to> <amount>  Transfer tokens
sign <base64-tx> [--send]       Sign (and optionally send) a transaction
wallet create                   Create a new wallet
wallet import                   Import wallet from mnemonic or private key
quest get                       Get current quest info
quest answer <answer>           Submit answer with ZK proof
```

Run `npx naracli <command> --help` for details.

### Global Options

| Option                | Description                 |
| --------------------- | --------------------------- |
| `-r, --rpc-url <url>` | RPC endpoint URL            |
| `-w, --wallet <path>` | Path to wallet keypair JSON |
| `-j, --json`          | Output in JSON format       |

### Quick Example

```bash
# Check balance
npx naracli balance

# Answer a quest
npx naracli quest get
npx naracli quest answer "your answer"
```

## License

MIT
