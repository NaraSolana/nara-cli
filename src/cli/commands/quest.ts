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

const QUEST_PROGRAM_ID = new PublicKey(
  "EXPLAHaMHLK9p7w5jVqEVY671NkkCKSHTNhhyUrPAboZ"
);

// ─── ZK constants ────────────────────────────────────────────────
const BN254_FIELD =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

// Circuit files path (relative to nara-quest project)
const CIRCUIT_WASM_PATH =
  process.env.QUEST_CIRCUIT_WASM || "";
const ZKEY_PATH =
  process.env.QUEST_ZKEY || "";

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
  if (seconds <= 0) return "已过期";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
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
    printError("无法获取题目信息，Quest 程序可能未初始化");
    process.exit(1);
  }

  if (!pool.isActive) {
    printWarning("当前没有活跃的题目");
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
    rewardPerWinner: `${rewardPerWinner} SOL`,
    totalReward: `${totalReward} SOL`,
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
    console.log(`  题目: ${pool.question}`);
    console.log(`  轮次: #${pool.round.toString()}`);
    console.log(`  每人奖励: ${rewardPerWinner} SOL`);
    console.log(`  奖励总额: ${totalReward} SOL`);
    console.log(
      `  奖励名额: ${pool.winnerCount}/${pool.rewardCount} (剩余 ${remainingRewards} 个)`
    );
    console.log(`  截止时间: ${new Date(deadline * 1000).toLocaleString()}`);
    if (secsLeft > 0) {
      console.log(`  剩余时间: ${formatTimeRemaining(secsLeft)}`);
    } else {
      printWarning("题目已过期");
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
    printError("无法获取题目信息，Quest 程序可能未初始化");
    process.exit(1);
  }

  if (!pool.isActive) {
    printError("当前没有活跃的题目");
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const deadline = pool.deadline.toNumber();
  if (now >= deadline) {
    printError("题目已过期");
    process.exit(1);
  }

  // 2. Check if already answered this round
  const winnerPda = getWinnerRecordPda(program.programId, wallet.publicKey);
  try {
    const wr = await program.account.winnerRecord.fetch(winnerPda);
    if (wr.round.toString() === pool.round.toString()) {
      printWarning("你已经回答过本轮题目了");
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
  const circuitWasm = CIRCUIT_WASM_PATH;
  const zkeyPath = ZKEY_PATH;

  if (!circuitWasm || !zkeyPath) {
    printError(
      "未配置 ZK 证明文件路径。请设置环境变量:\n" +
        "  QUEST_CIRCUIT_WASM=<path to answer_proof.wasm>\n" +
        "  QUEST_ZKEY=<path to answer_proof_final.zkey>"
    );
    process.exit(1);
  }

  printInfo("正在生成 ZK 证明...");

  const snarkjs = await import("snarkjs");
  const answerHashFieldStr = hashBytesToFieldStr(
    Array.from(pool.answerHash)
  );
  const { lo, hi } = pubkeyToCircuitInputs(wallet.publicKey);

  let proof: any;
  try {
    const result = await snarkjs.groth16.fullProve(
      {
        answer: answerToField(answer).toString(),
        answer_hash: answerHashFieldStr,
        pubkey_lo: lo,
        pubkey_hi: hi,
      },
      circuitWasm,
      zkeyPath
    );
    proof = result.proof;
  } catch (err: any) {
    printError(`ZK 证明生成失败: ${err.message}`);
    process.exit(1);
  }

  const { proofA, proofB, proofC } = proofToSolana(proof);

  // 5. Check deadline again after proof generation
  const nowAfterProof = Math.floor(Date.now() / 1000);
  if (nowAfterProof >= deadline) {
    printError("证明生成期间题目已过期");
    process.exit(1);
  }

  // 6. Submit answer
  printInfo("正在提交答案...");

  try {
    const tx = await program.methods
      .submitAnswer(proofA as any, proofB as any, proofC as any)
      .accounts({ user: wallet.publicKey, payer: wallet.publicKey })
      .signers([wallet])
      .rpc({ skipPreflight: true });

    printSuccess("答案已提交!");
    console.log(`  交易: ${tx}`);

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
  printInfo("正在生成 ZK 证明...");

  const circuitWasm = CIRCUIT_WASM_PATH;
  const zkeyPath = ZKEY_PATH;

  if (!circuitWasm || !zkeyPath) {
    printError(
      "未配置 ZK 证明文件路径。请设置环境变量:\n" +
        "  QUEST_CIRCUIT_WASM=<path to answer_proof.wasm>\n" +
        "  QUEST_ZKEY=<path to answer_proof_final.zkey>"
    );
    process.exit(1);
  }

  const snarkjs = await import("snarkjs");
  const answerHashFieldStr = hashBytesToFieldStr(
    Array.from(pool.answerHash)
  );
  const { lo, hi } = pubkeyToCircuitInputs(wallet.publicKey);

  let proof: any;
  try {
    const result = await snarkjs.groth16.fullProve(
      {
        answer: answerToField(answer).toString(),
        answer_hash: answerHashFieldStr,
        pubkey_lo: lo,
        pubkey_hi: hi,
      },
      circuitWasm,
      zkeyPath
    );
    proof = result.proof;
  } catch (err: any) {
    printError(`ZK 证明生成失败: ${err.message}`);
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

  printInfo("正在通过 relay 提交答案...");

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
    printError(`Relay 提交失败: ${data.error ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }

  const txHash = data.txHash as string;
  printSuccess("答案已通过 relay 提交!");
  console.log(`  交易: ${txHash}`);

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
  printInfo("正在查询交易详情...");

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
    printWarning("无法获取交易详情，请稍后手动查看");
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
    printSuccess(`恭喜! 获得奖励: ${rewardSol} SOL`);
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
    printWarning("答对了，但没有获得奖励 — 本轮奖励名额已被领完");
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
      printWarning("你已经回答过本轮题目了");
      break;
    case "deadlineExpired":
      printError("题目已过期");
      break;
    case "invalidProof":
      printError("答案错误 (ZK 证明验证失败)");
      break;
    case "poolNotActive":
      printError("当前没有活跃的题目");
      break;
    default:
      printError(`提交答案失败: ${err.message ?? String(err)}`);
      if (err.logs) {
        console.log("  日志:");
        err.logs.slice(-5).forEach((l: string) => console.log(`    ${l}`));
      }
  }
  process.exit(1);
}

// ─── Register commands ───────────────────────────────────────────
export function registerQuestCommands(program: Command): void {
  const quest = program
    .command("quest")
    .description("Quest (答题) commands");

  // quest get
  quest
    .command("get")
    .description("获取当前题目信息")
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
    .description("提交答案")
    .option("--relay [url]", `通过 relay 服务提交，免 gas (默认: ${DEFAULT_QUEST_RELAY_URL})`)
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
