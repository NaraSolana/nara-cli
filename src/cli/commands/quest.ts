/**
 * Quest commands - interact with nara-quest on-chain quiz
 */

import { Command } from "commander";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { loadWallet, getRpcUrl } from "../utils/wallet";
import {
  formatOutput,
  printError,
  printInfo,
  printSuccess,
  printWarning,
} from "../utils/output";
import type { GlobalOptions } from "../types";
import type { NaraQuest } from "../quest/nara_quest_types";
import { DEFAULT_QUEST_RELAY_URL } from "../../constants";

// IDL loaded via require for JSON import
import { createRequire } from "module";
const _require = createRequire(import.meta.url);

// ─── ZK constants ────────────────────────────────────────────────
const BN254_FIELD =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

// Circuit files bundled in src/cli/zk/
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const CIRCUIT_WASM_PATH =
  process.env.QUEST_CIRCUIT_WASM || join(__dirname, "../zk/answer_proof.wasm");
const ZKEY_PATH =
  process.env.QUEST_ZKEY || join(__dirname, "../zk/answer_proof_final.zkey");

// Suppress console output from snarkjs WASM during proof generation
async function silentProve(snarkjs: any, input: Record<string, string>, wasmPath: string, zkeyPath: string) {
  const savedLog = console.log;
  const savedError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  } finally {
    console.log = savedLog;
    console.error = savedError;
  }
}

// ─── ZK utilities ────────────────────────────────────────────────
function toBigEndian32(v: bigint): Buffer {
  return Buffer.from(v.toString(16).padStart(64, "0"), "hex");
}

function answerToField(answer: string): bigint {
  return (
    BigInt("0x" + Buffer.from(answer, "utf-8").toString("hex")) % BN254_FIELD
  );
}

function hashBytesToFieldStr(hashBytes: number[]): string {
  return BigInt("0x" + Buffer.from(hashBytes).toString("hex")).toString();
}

function pubkeyToCircuitInputs(pubkey: PublicKey): {
  lo: string;
  hi: string;
} {
  const bytes = pubkey.toBuffer();
  return {
    lo: BigInt("0x" + bytes.subarray(16, 32).toString("hex")).toString(),
    hi: BigInt("0x" + bytes.subarray(0, 16).toString("hex")).toString(),
  };
}

function proofToSolana(proof: any) {
  const negY = (y: string) => toBigEndian32(BN254_FIELD - BigInt(y));
  const be = (s: string) => toBigEndian32(BigInt(s));
  return {
    proofA: Array.from(
      Buffer.concat([be(proof.pi_a[0]), negY(proof.pi_a[1])])
    ),
    proofB: Array.from(
      Buffer.concat([
        be(proof.pi_b[0][1]),
        be(proof.pi_b[0][0]),
        be(proof.pi_b[1][1]),
        be(proof.pi_b[1][0]),
      ])
    ),
    proofC: Array.from(
      Buffer.concat([be(proof.pi_c[0]), be(proof.pi_c[1])])
    ),
  };
}

// ─── Anchor error parsing ────────────────────────────────────────
const QUEST_ERRORS: Record<number, string> = {
  6000: "unauthorized",
  6001: "poolNotActive",
  6002: "deadlineExpired",
  6003: "invalidProof",
  6004: "invalidDeadline",
  6005: "insufficientReward",
  6006: "insufficientPoolBalance",
  6007: "questionTooLong",
  6008: "alreadyAnswered",
};

function anchorErrorCode(err: any): string {
  const code = err?.error?.errorCode?.code;
  if (code) return code;
  const raw = err?.message ?? JSON.stringify(err) ?? "";
  const m = raw.match(/"Custom":(\d+)/);
  if (m) return QUEST_ERRORS[parseInt(m[1])] ?? "";
  return "";
}

// ─── Helpers ─────────────────────────────────────────────────────
function createProgram(
  connection: Connection,
  wallet: Keypair
): Program<NaraQuest> {
  const idl = _require("../quest/nara_quest.json");
  const provider = new AnchorProvider(
    connection,
    new Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  return new Program<NaraQuest>(idl as any, provider);
}

function getPoolPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    programId
  );
  return pda;
}

function getWinnerRecordPda(
  programId: PublicKey,
  user: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("winner"), user.toBuffer()],
    programId
  );
  return pda;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Command: quest get ──────────────────────────────────────────
async function handleQuestGet(options: GlobalOptions) {
  const rpcUrl = getRpcUrl(options.rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");

  // We need a wallet just to create the Anchor provider, but won't sign anything
  let wallet: Keypair;
  try {
    wallet = await loadWallet(options.wallet);
  } catch {
    // Use a dummy keypair for read-only operations
    wallet = Keypair.generate();
  }

  const program = createProgram(connection, wallet);
  const poolPda = getPoolPda(program.programId);

  let pool: any;
  try {
    pool = await program.account.pool.fetch(poolPda);
  } catch {
    printError("Failed to fetch quest info. The Quest program may not be initialized.");
    process.exit(1);
  }

  if (!pool.isActive) {
    printWarning("No active quest at the moment");
    if (options.json) {
      formatOutput({ active: false }, true);
    }
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const deadline = pool.deadline.toNumber();
  const secsLeft = deadline - now;
  const rewardPerWinner = pool.rewardPerWinner.toNumber() / LAMPORTS_PER_SOL;
  const totalReward = pool.rewardAmount.toNumber() / LAMPORTS_PER_SOL;
  const remainingRewards = Math.max(
    0,
    pool.rewardCount - pool.winnerCount
  );

  const data = {
    round: pool.round.toString(),
    questionId: pool.questionId.toString(),
    question: pool.question,
    rewardPerWinner: `${rewardPerWinner} NSO`,
    totalReward: `${totalReward} NSO`,
    rewardSlots: `${pool.winnerCount}/${pool.rewardCount}`,
    remainingRewardSlots: remainingRewards,
    deadline: new Date(deadline * 1000).toLocaleString(),
    timeRemaining: formatTimeRemaining(secsLeft),
    expired: secsLeft <= 0,
  };

  if (options.json) {
    formatOutput(data, true);
  } else {
    console.log("");
    console.log(`  Question: ${pool.question}`);
    console.log(`  Round: #${pool.round.toString()}`);
    console.log(`  Reward per winner: ${rewardPerWinner} NSO`);
    console.log(`  Total reward: ${totalReward} NSO`);
    console.log(
      `  Reward slots: ${pool.winnerCount}/${pool.rewardCount} (${remainingRewards} remaining)`
    );
    console.log(`  Deadline: ${new Date(deadline * 1000).toLocaleString()}`);
    if (secsLeft > 0) {
      console.log(`  Time remaining: ${formatTimeRemaining(secsLeft)}`);
    } else {
      printWarning("Quest has expired");
    }
    console.log("");
  }
}

// ─── Command: quest answer ───────────────────────────────────────
async function handleQuestAnswer(
  answer: string,
  options: GlobalOptions & { relay?: string }
) {
  const rpcUrl = getRpcUrl(options.rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = await loadWallet(options.wallet);

  const program = createProgram(connection, wallet);
  const poolPda = getPoolPda(program.programId);

  // 1. Fetch pool
  let pool: any;
  try {
    pool = await program.account.pool.fetch(poolPda);
  } catch {
    printError("Failed to fetch quest info. The Quest program may not be initialized.");
    process.exit(1);
  }

  if (!pool.isActive) {
    printError("No active quest at the moment");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const deadline = pool.deadline.toNumber();
  if (now >= deadline) {
    printError("Quest has expired");
    process.exit(1);
  }

  // 2. Check if already answered this round
  const winnerPda = getWinnerRecordPda(program.programId, wallet.publicKey);
  try {
    const wr = await program.account.winnerRecord.fetch(winnerPda);
    if (wr.round.toString() === pool.round.toString()) {
      printWarning("You have already answered this round");
      process.exit(0);
    }
  } catch {
    // WinnerRecord doesn't exist yet, first time answering
  }

  // 3. Check if relay mode
  if (options.relay) {
    return handleRelayAnswer(answer, pool, wallet, options.relay, options);
  }

  // 4. Generate ZK proof
  printInfo("Generating ZK proof...");

  const snarkjs = await import("snarkjs");
  const answerHashFieldStr = hashBytesToFieldStr(
    Array.from(pool.answerHash)
  );
  const { lo, hi } = pubkeyToCircuitInputs(wallet.publicKey);

  let proof: any;
  try {
    const result = await silentProve(snarkjs, {
        answer: answerToField(answer).toString(),
        answer_hash: answerHashFieldStr,
        pubkey_lo: lo,
        pubkey_hi: hi,
      },
      CIRCUIT_WASM_PATH,
      ZKEY_PATH
    );
    proof = result.proof;
  } catch (err: any) {
    if (err.message?.includes("Assert Failed")) {
      printError("Wrong answer");
    } else {
      printError(`ZK proof generation failed: ${err.message}`);
    }
    process.exit(1);
  }

  const { proofA, proofB, proofC } = proofToSolana(proof);

  // 5. Check deadline again after proof generation
  const nowAfterProof = Math.floor(Date.now() / 1000);
  if (nowAfterProof >= deadline) {
    printError("Quest expired during proof generation");
    process.exit(1);
  }

  // 6. Submit answer
  printInfo("Submitting answer...");

  try {
    const tx = await program.methods
      .submitAnswer(proofA as any, proofB as any, proofC as any)
      .accounts({ user: wallet.publicKey, payer: wallet.publicKey })
      .signers([wallet])
      .rpc({ skipPreflight: true });

    printSuccess("Answer submitted!");
    console.log(`  Transaction: ${tx}`);

    // 7. Parse transaction for reward
    await parseReward(connection, tx, wallet.publicKey, options);
  } catch (err: any) {
    handleSubmitError(err);
  }
}

// ─── Relay-based answer submission ───────────────────────────────
async function handleRelayAnswer(
  answer: string,
  pool: any,
  wallet: Keypair,
  relayUrl: string,
  options: GlobalOptions
) {
  printInfo("Generating ZK proof...");

  const snarkjs = await import("snarkjs");
  const answerHashFieldStr = hashBytesToFieldStr(
    Array.from(pool.answerHash)
  );
  const { lo, hi } = pubkeyToCircuitInputs(wallet.publicKey);

  let proof: any;
  try {
    const result = await silentProve(snarkjs, {
        answer: answerToField(answer).toString(),
        answer_hash: answerHashFieldStr,
        pubkey_lo: lo,
        pubkey_hi: hi,
      },
      CIRCUIT_WASM_PATH,
      ZKEY_PATH
    );
    proof = result.proof;
  } catch (err: any) {
    if (err.message?.includes("Assert Failed")) {
      printError("Wrong answer");
    } else {
      printError(`ZK proof generation failed: ${err.message}`);
    }
    process.exit(1);
  }

  // Convert proof to hex for relay
  const negY = (y: string) => toBigEndian32(BN254_FIELD - BigInt(y));
  const be = (s: string) => toBigEndian32(BigInt(s));
  const proofA = Buffer.concat([
    be(proof.pi_a[0]),
    negY(proof.pi_a[1]),
  ]).toString("hex");
  const proofB = Buffer.concat([
    be(proof.pi_b[0][1]),
    be(proof.pi_b[0][0]),
    be(proof.pi_b[1][1]),
    be(proof.pi_b[1][0]),
  ]).toString("hex");
  const proofC = Buffer.concat([
    be(proof.pi_c[0]),
    be(proof.pi_c[1]),
  ]).toString("hex");

  printInfo("Submitting answer via relay...");

  const res = await fetch(`${relayUrl}/submit-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: wallet.publicKey.toBase58(),
      proofA,
      proofB,
      proofC,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    printError(`Relay submission failed: ${data.error ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }

  const txHash = data.txHash as string;
  printSuccess("Answer submitted via relay!");
  console.log(`  Transaction: ${txHash}`);

  // Parse reward from relay transaction
  const rpcUrl = getRpcUrl(options.rpcUrl);
  const connection = new Connection(rpcUrl, "confirmed");
  await parseReward(connection, txHash, wallet.publicKey, options);
}

// ─── Parse reward from transaction inner instructions ────────────
async function parseReward(
  connection: Connection,
  txSignature: string,
  userPubkey: PublicKey,
  options: GlobalOptions
) {
  printInfo("Fetching transaction details...");

  // Wait a bit for transaction to be confirmed
  await new Promise((r) => setTimeout(r, 2000));

  let txInfo: any;
  for (let i = 0; i < 5; i++) {
    try {
      txInfo = await connection.getTransaction(txSignature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (txInfo) break;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!txInfo) {
    printWarning("Failed to fetch transaction details. Please check manually later.");
    console.log(
      `  https://solscan.io/tx/${txSignature}?cluster=devnet`
    );
    return;
  }

  // Look for SOL transfer to user in inner instructions
  const userAddress = userPubkey.toBase58();
  let rewardLamports = 0;

  const meta = txInfo.meta;
  if (meta?.innerInstructions) {
    for (const inner of meta.innerInstructions) {
      for (const ix of inner.instructions) {
        // System program transfer instruction
        // programIdIndex points to system program (11111111111111111111111111111111)
        const accountKeys =
          txInfo.transaction.message.staticAccountKeys ??
          txInfo.transaction.message.accountKeys;

        const programId = accountKeys[ix.programIdIndex]?.toBase58?.() ??
          accountKeys[ix.programIdIndex]?.toString?.() ??
          accountKeys[ix.programIdIndex];

        if (programId === "11111111111111111111111111111111") {
          // System program transfer: data contains transfer instruction
          // Instruction type 2 = Transfer, followed by u64 lamports (little-endian)
          const data = Buffer.from(ix.data, "base64");
          if (data.length >= 12 && data.readUInt32LE(0) === 2) {
            // Transfer instruction
            const lamports = Number(data.readBigUInt64LE(4));
            const destIndex = ix.accounts[1];
            const destKey =
              accountKeys[destIndex]?.toBase58?.() ??
              accountKeys[destIndex]?.toString?.() ??
              accountKeys[destIndex];

            if (destKey === userAddress) {
              rewardLamports += lamports;
            }
          }
        }
      }
    }
  }

  if (rewardLamports > 0) {
    const rewardSol = rewardLamports / LAMPORTS_PER_SOL;
    printSuccess(`Congratulations! Reward received: ${rewardSol} NSO`);
    if (options.json) {
      formatOutput(
        {
          signature: txSignature,
          rewarded: true,
          rewardLamports,
          rewardSol,
        },
        true
      );
    }
  } else {
    printWarning("Correct answer, but no reward — all reward slots have been claimed");
    if (options.json) {
      formatOutput(
        { signature: txSignature, rewarded: false, rewardLamports: 0 },
        true
      );
    }
  }
}

// ─── Error handling ──────────────────────────────────────────────
function handleSubmitError(err: any) {
  const errCode = anchorErrorCode(err);
  switch (errCode) {
    case "alreadyAnswered":
      printWarning("You have already answered this round");
      break;
    case "deadlineExpired":
      printError("Quest has expired");
      break;
    case "invalidProof":
      printError("Wrong answer (ZK proof verification failed)");
      break;
    case "poolNotActive":
      printError("No active quest at the moment");
      break;
    default:
      printError(`Failed to submit answer: ${err.message ?? String(err)}`);
      if (err.logs) {
        console.log("  Logs:");
        err.logs.slice(-5).forEach((l: string) => console.log(`    ${l}`));
      }
  }
  process.exit(1);
}

// ─── Register commands ───────────────────────────────────────────
export function registerQuestCommands(program: Command): void {
  const quest = program
    .command("quest")
    .description("Quest commands");

  // quest get
  quest
    .command("get")
    .description("Get current quest info")
    .action(async (_opts: any, cmd: Command) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        await handleQuestGet(globalOpts);
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });

  // quest answer
  quest
    .command("answer <answer>")
    .description("Submit an answer")
    .option("--relay [url]", `Submit via relay service, gasless (default: ${DEFAULT_QUEST_RELAY_URL})`)
    .action(async (answer: string, opts: any, cmd: Command) => {
      try {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const relayUrl = opts.relay === true ? DEFAULT_QUEST_RELAY_URL : opts.relay;
        await handleQuestAnswer(answer, { ...globalOpts, relay: relayUrl });
      } catch (error: any) {
        printError(error.message);
        process.exit(1);
      }
    });
}
