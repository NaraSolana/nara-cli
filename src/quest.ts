/**
 * Quest SDK - interact with nara-quest on-chain quiz
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import type { NaraQuest } from "./cli/quest/nara_quest_types";

import { createRequire } from "module";
const _require = createRequire(import.meta.url);

// ─── ZK constants ────────────────────────────────────────────────
const BN254_FIELD =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { existsSync } from "fs";
const __dirname = dirname(fileURLToPath(import.meta.url));

function findZkFile(name: string): string {
  // 1. src/cli/zk/ (dev mode, running from src/)
  const srcPath = join(__dirname, "cli/zk", name);
  if (existsSync(srcPath)) return srcPath;
  // 2. dist/zk/ (published, running from dist/)
  const distPath = join(__dirname, "zk", name);
  if (existsSync(distPath)) return distPath;
  // 3. Fallback to src path (will error at runtime if missing)
  return srcPath;
}

const DEFAULT_CIRCUIT_WASM = findZkFile("answer_proof.wasm");
const DEFAULT_ZKEY = findZkFile("answer_proof_final.zkey");

// ─── Types ───────────────────────────────────────────────────────

export interface QuestInfo {
  active: boolean;
  round: string;
  questionId: string;
  question: string;
  answerHash: number[];
  rewardPerWinner: number;
  totalReward: number;
  rewardCount: number;
  winnerCount: number;
  remainingSlots: number;
  deadline: number;
  timeRemaining: number;
  expired: boolean;
}

export interface ZkProof {
  proofA: number[];
  proofB: number[];
  proofC: number[];
}

export interface ZkProofHex {
  proofA: string;
  proofB: string;
  proofC: string;
}

export interface SubmitAnswerResult {
  signature: string;
}

export interface SubmitRelayResult {
  txHash: string;
}

export interface QuestProveOptions {
  circuitWasmPath?: string;
  zkeyPath?: string;
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

function proofToSolana(proof: any): ZkProof {
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

function proofToHex(proof: any): ZkProofHex {
  const negY = (y: string) => toBigEndian32(BN254_FIELD - BigInt(y));
  const be = (s: string) => toBigEndian32(BigInt(s));
  return {
    proofA: Buffer.concat([be(proof.pi_a[0]), negY(proof.pi_a[1])]).toString("hex"),
    proofB: Buffer.concat([
      be(proof.pi_b[0][1]),
      be(proof.pi_b[0][0]),
      be(proof.pi_b[1][1]),
      be(proof.pi_b[1][0]),
    ]).toString("hex"),
    proofC: Buffer.concat([be(proof.pi_c[0]), be(proof.pi_c[1])]).toString("hex"),
  };
}

// Suppress console output from snarkjs WASM during proof generation.
async function silentProve(snarkjs: any, input: Record<string, string>, wasmPath: string, zkeyPath: string) {
  const savedLog = console.log;
  const savedError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath, null, null, { singleThread: true });
  } finally {
    console.log = savedLog;
    console.error = savedError;
  }
}

// ─── Anchor helpers ──────────────────────────────────────────────

function createProgram(
  connection: Connection,
  wallet: Keypair
): Program<NaraQuest> {
  const idlPath = existsSync(join(__dirname, "cli/quest/nara_quest.json"))
    ? "./cli/quest/nara_quest.json"
    : "./quest/nara_quest.json";
  const idl = _require(idlPath);
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

// ─── SDK functions ───────────────────────────────────────────────

/**
 * Get the current active quest info
 */
export async function getQuestInfo(
  connection: Connection,
  wallet?: Keypair
): Promise<QuestInfo> {
  const kp = wallet ?? Keypair.generate();
  const program = createProgram(connection, kp);
  const poolPda = getPoolPda(program.programId);
  const pool = await program.account.pool.fetch(poolPda);

  const now = Math.floor(Date.now() / 1000);
  const deadline = pool.deadline.toNumber();
  const secsLeft = deadline - now;

  return {
    active: pool.isActive,
    round: pool.round.toString(),
    questionId: pool.questionId.toString(),
    question: pool.question,
    answerHash: Array.from(pool.answerHash),
    rewardPerWinner: pool.rewardPerWinner.toNumber() / LAMPORTS_PER_SOL,
    totalReward: pool.rewardAmount.toNumber() / LAMPORTS_PER_SOL,
    rewardCount: pool.rewardCount,
    winnerCount: pool.winnerCount,
    remainingSlots: Math.max(0, pool.rewardCount - pool.winnerCount),
    deadline,
    timeRemaining: secsLeft,
    expired: secsLeft <= 0,
  };
}

/**
 * Check if the user has already answered the current round
 */
export async function hasAnswered(
  connection: Connection,
  wallet: Keypair
): Promise<boolean> {
  const program = createProgram(connection, wallet);
  const quest = await getQuestInfo(connection, wallet);
  const winnerPda = getWinnerRecordPda(program.programId, wallet.publicKey);
  try {
    const wr = await program.account.winnerRecord.fetch(winnerPda);
    return wr.round.toString() === quest.round;
  } catch {
    return false;
  }
}

/**
 * Generate a ZK proof for a quest answer.
 * Throws if the answer is wrong (circuit assertion fails).
 */
export async function generateProof(
  answer: string,
  answerHash: number[],
  userPubkey: PublicKey,
  options?: QuestProveOptions
): Promise<{ solana: ZkProof; hex: ZkProofHex }> {
  const wasmPath = options?.circuitWasmPath ?? process.env.QUEST_CIRCUIT_WASM ?? DEFAULT_CIRCUIT_WASM;
  const zkeyPath = options?.zkeyPath ?? process.env.QUEST_ZKEY ?? DEFAULT_ZKEY;

  const snarkjs = await import("snarkjs");
  const answerHashFieldStr = hashBytesToFieldStr(answerHash);
  const { lo, hi } = pubkeyToCircuitInputs(userPubkey);

  const result = await silentProve(
    snarkjs,
    {
      answer: answerToField(answer).toString(),
      answer_hash: answerHashFieldStr,
      pubkey_lo: lo,
      pubkey_hi: hi,
    },
    wasmPath,
    zkeyPath
  );

  return {
    solana: proofToSolana(result.proof),
    hex: proofToHex(result.proof),
  };
}

/**
 * Submit a quest answer on-chain (direct submission, requires gas)
 */
export async function submitAnswer(
  connection: Connection,
  wallet: Keypair,
  proof: ZkProof
): Promise<SubmitAnswerResult> {
  const program = createProgram(connection, wallet);
  const signature = await program.methods
    .submitAnswer(proof.proofA as any, proof.proofB as any, proof.proofC as any)
    .accounts({ user: wallet.publicKey, payer: wallet.publicKey })
    .signers([wallet])
    .rpc({ skipPreflight: true });

  return { signature };
}

/**
 * Submit a quest answer via relay (gasless submission)
 */
export async function submitAnswerViaRelay(
  relayUrl: string,
  userPubkey: PublicKey,
  proof: ZkProofHex
): Promise<SubmitRelayResult> {
  const base = relayUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/submit-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: userPubkey.toBase58(),
      proofA: proof.proofA,
      proofB: proof.proofB,
      proofC: proof.proofC,
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Relay submission failed: ${data.error ?? `HTTP ${res.status}`}`);
  }

  return { txHash: data.txHash };
}

/**
 * Parse reward info from a quest transaction's log messages
 */
export async function parseQuestReward(
  connection: Connection,
  txSignature: string,
  retries = 10
): Promise<{ rewarded: boolean; rewardLamports: number; rewardNso: number; winner: string }> {
  await new Promise((r) => setTimeout(r, 2000));

  let txInfo: any;
  for (let i = 0; i < retries; i++) {
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
    throw new Error("Failed to fetch transaction details");
  }

  let rewardLamports = 0;
  let winner = "";
  const logs: string[] = txInfo.meta?.logMessages ?? [];
  for (const log of logs) {
    const m = log.match(/reward (\d+) lamports \(winner (\d+\/\d+)\)/);
    if (m) {
      rewardLamports = parseInt(m[1]!);
      winner = m[2]!;
      break;
    }
  }

  return {
    rewarded: rewardLamports > 0,
    rewardLamports,
    rewardNso: rewardLamports / LAMPORTS_PER_SOL,
    winner,
  };
}
