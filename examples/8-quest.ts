/**
 * Example: Quest (Answer-to-Earn with ZK Proofs)
 *
 * This example demonstrates how to:
 * 1. Fetch the current quest question
 * 2. Check if you've already answered
 * 3. Generate a ZK proof for your answer
 * 4. Submit the answer on-chain (direct or via relay)
 * 5. Parse the reward from the transaction
 *
 * Prerequisites:
 * - Set PRIVATE_KEY environment variable (base58 or JSON array)
 *
 * Run: npx tsx examples/8-quest.ts
 */

import {
  getQuestInfo,
  hasAnswered,
  generateProof,
  submitAnswer,
  submitAnswerViaRelay,
  parseQuestReward,
  Keypair,
} from "../index";
import { getRpcUrl } from "./utils";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  const wallet = privateKey.startsWith("[")
    ? Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey)))
    : Keypair.fromSecretKey(bs58.decode(privateKey));

  const rpcUrl = getRpcUrl();
  const connection = new Connection(rpcUrl, "confirmed");

  console.log("Wallet:", wallet.publicKey.toBase58());

  // 1. Fetch quest info
  console.log("\n--- Fetching quest info ---");
  const quest = await getQuestInfo(connection, wallet);

  if (!quest.active) {
    console.log("No active quest at the moment");
    return;
  }

  console.log(`Question: ${quest.question}`);
  console.log(`Round: #${quest.round}`);
  console.log(`Reward per winner: ${quest.rewardPerWinner} NSO`);
  console.log(`Remaining slots: ${quest.remainingSlots}`);
  console.log(`Time remaining: ${quest.timeRemaining}s`);

  if (quest.expired) {
    console.log("Quest has expired, waiting for next round...");
    return;
  }

  // 2. Check if already answered
  console.log("\n--- Checking answer status ---");
  const alreadyAnswered = await hasAnswered(connection, wallet);
  if (alreadyAnswered) {
    console.log("Already answered this round, waiting for next round...");
    return;
  }

  // 3. Solve the question (replace with your answer)
  const answer = process.env.QUEST_ANSWER ?? "your-answer-here";
  console.log(`\n--- Generating ZK proof for answer: "${answer}" ---`);

  const proof = await generateProof(
    answer,
    quest.answerHash,
    wallet.publicKey
  );
  console.log("Proof generated successfully");

  // 4. Submit answer
  // Option A: Direct on-chain submission (requires gas)
  console.log("\n--- Submitting answer on-chain ---");
  const result = await submitAnswer(connection, wallet, proof.solana);
  console.log(`Transaction: ${result.signature}`);

  // Option B: Gasless relay submission (uncomment to use)
  // const relayResult = await submitAnswerViaRelay(
  //   "https://quest-api.nara.build",
  //   wallet.publicKey,
  //   proof.hex
  // );
  // console.log(`Transaction: ${relayResult.txHash}`);

  // 5. Parse reward
  console.log("\n--- Checking reward ---");
  const reward = await parseQuestReward(connection, result.signature);

  if (reward.rewarded) {
    console.log(`Reward: ${reward.rewardNso} NSO (winner ${reward.winner})`);
  } else {
    console.log("Correct answer, but no reward slots remaining");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
