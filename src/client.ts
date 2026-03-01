import { Connection } from "@solana/web3.js";

export interface NaraSDKConfig {
  rpcUrl: string;
  commitment?: "processed" | "confirmed" | "finalized";
}

export class NaraSDK {
  private connection: Connection;

  constructor(config: NaraSDKConfig) {
    this.connection = new Connection(
      config.rpcUrl,
      config.commitment || "confirmed"
    );
  }

  getConnection(): Connection {
    return this.connection;
  }
}
