/**
 * SolPay Links — on-chain client SDK
 *
 * Wraps every program instruction with clean TypeScript helpers.
 * Drop this into the API backend or the merchant dashboard — same interface.
 *
 * Usage:
 *   import { SolPayClient } from "./app/src/client";
 *   const client = new SolPayClient(connection, wallet);
 *   const { tx, pda } = await client.createLink({ ... });
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair,
  SendOptions,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";

// ─── Program ID ───────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey(
  "SoLPaYLinks1111111111111111111111111111111"
);

// ─── PDA derivation ───────────────────────────────────────────────────────────

export function findPaymentLinkPDA(
  merchant: PublicKey,
  linkId: Uint8Array // exactly 10 bytes
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment_link"), merchant.toBuffer(), linkId],
    PROGRAM_ID
  );
}

/** Convert a nanoid(10) string to the 10-byte array stored on-chain. */
export function linkIdToBytes(id: string): Uint8Array {
  const buf = Buffer.alloc(10);
  Buffer.from(id, "utf-8").copy(buf, 0, 0, 10);
  return buf;
}

// ─── Client class ─────────────────────────────────────────────────────────────

export interface CreateLinkParams {
  linkId: string;          // nanoid(10) — must match API-layer link.id
  recipient: PublicKey;
  amount: bigint;          // 0 = open amount
  feeBps: number;          // e.g. 50 for 0.5%
  label: string;
  description: string;
  memo?: string;
  expiresAt?: Date;        // undefined = never
  maxPayments?: number;    // 0 / undefined = unlimited
  tokenMint?: PublicKey;   // undefined = SOL
}

export interface PaySolParams {
  linkPda: PublicKey;
  merchant: PublicKey;
  linkId: string;
  recipient: PublicKey;
  payAmount: bigint;       // 0 = use fixed amount on-chain
  treasury?: PublicKey;
}

export interface PaySplParams {
  linkPda: PublicKey;
  merchant: PublicKey;
  linkId: string;
  recipient: PublicKey;
  mint: PublicKey;
  payAmount: bigint;
  treasury?: PublicKey;
}

export interface PaymentLinkAccount {
  merchant: PublicKey;
  recipient: PublicKey;
  linkId: number[];
  tokenMint: PublicKey | null;
  amount: BN;
  feeBps: number;
  label: string;
  description: string;
  memo: string | null;
  expiresAt: BN;
  maxPayments: BN;
  paymentCount: BN;
  totalReceived: BN;
  status: { active?: {} } | { completed?: {} } | { cancelled?: {} };
  createdAt: BN;
  bump: number;
}

export class SolPayClient {
  program: Program;

  constructor(
    private connection: Connection,
    private wallet: anchor.Wallet,
    idl: anchor.Idl
  ) {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    this.program = new Program(idl, PROGRAM_ID, provider);
  }

  // ── createLink ─────────────────────────────────────────────────────────────

  async createLink(
    params: CreateLinkParams
  ): Promise<{ tx: Transaction; pda: PublicKey; bump: number }> {
    const linkIdBytes = linkIdToBytes(params.linkId);
    const [pda, bump] = findPaymentLinkPDA(this.wallet.publicKey, linkIdBytes);

    const expiresAt = params.expiresAt
      ? Math.floor(params.expiresAt.getTime() / 1000)
      : 0;

    const ix = await this.program.methods
      .createLink({
        linkId: Array.from(linkIdBytes),
        amount: new BN(params.amount.toString()),
        feeBps: params.feeBps,
        label: params.label,
        description: params.description,
        memo: params.memo ?? null,
        expiresAt: new BN(expiresAt),
        maxPayments: new BN(params.maxPayments ?? 0),
      })
      .accounts({
        paymentLink: pda,
        merchant: this.wallet.publicKey,
        recipient: params.recipient,
        tokenMint: params.tokenMint ?? null,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = await this.buildTx([ix]);
    return { tx, pda, bump };
  }

  // ── paySol ─────────────────────────────────────────────────────────────────

  async paySol(params: PaySolParams): Promise<Transaction> {
    const ix = await this.program.methods
      .paySol(new BN(params.payAmount.toString()))
      .accounts({
        paymentLink: params.linkPda,
        payer: this.wallet.publicKey,
        recipient: params.recipient,
        treasury: params.treasury ?? null,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return this.buildTx([ix]);
  }

  // ── paySpl ─────────────────────────────────────────────────────────────────

  async paySpl(params: PaySplParams): Promise<Transaction> {
    const payerAta = getAssociatedTokenAddressSync(
      params.mint,
      this.wallet.publicKey
    );
    const recipientAta = getAssociatedTokenAddressSync(
      params.mint,
      params.recipient
    );

    const preIxs: TransactionInstruction[] = [];

    // Create recipient ATA if missing
    const recipientAtaInfo = await this.connection.getAccountInfo(recipientAta);
    if (!recipientAtaInfo) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          recipientAta,
          params.recipient,
          params.mint
        )
      );
    }

    // Treasury ATA (optional)
    let treasuryAta: PublicKey | null = null;
    if (params.treasury) {
      treasuryAta = getAssociatedTokenAddressSync(params.mint, params.treasury);
      const treasuryAtaInfo = await this.connection.getAccountInfo(treasuryAta);
      if (!treasuryAtaInfo) {
        preIxs.push(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            treasuryAta,
            params.treasury,
            params.mint
          )
        );
      }
    }

    const ix = await this.program.methods
      .paySpl(new BN(params.payAmount.toString()))
      .accounts({
        paymentLink: params.linkPda,
        payer: this.wallet.publicKey,
        mint: params.mint,
        payerAta,
        recipientAta,
        recipient: params.recipient,
        treasuryAta,
        treasury: params.treasury ?? null,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return this.buildTx([...preIxs, ix]);
  }

  // ── cancelLink ─────────────────────────────────────────────────────────────

  async cancelLink(linkPda: PublicKey): Promise<Transaction> {
    const ix = await this.program.methods
      .cancelLink()
      .accounts({
        paymentLink: linkPda,
        merchant: this.wallet.publicKey,
      })
      .instruction();

    return this.buildTx([ix]);
  }

  // ── closeLink ──────────────────────────────────────────────────────────────

  async closeLink(linkPda: PublicKey): Promise<Transaction> {
    const ix = await this.program.methods
      .closeLink()
      .accounts({
        paymentLink: linkPda,
        merchant: this.wallet.publicKey,
      })
      .instruction();

    return this.buildTx([ix]);
  }

  // ── fetchLink ──────────────────────────────────────────────────────────────

  async fetchLink(pda: PublicKey): Promise<PaymentLinkAccount> {
    return this.program.account.paymentLink.fetch(pda) as Promise<PaymentLinkAccount>;
  }

  async fetchLinkById(
    merchant: PublicKey,
    linkId: string
  ): Promise<{ pda: PublicKey; account: PaymentLinkAccount }> {
    const [pda] = findPaymentLinkPDA(merchant, linkIdToBytes(linkId));
    const account = await this.fetchLink(pda);
    return { pda, account };
  }

  // ── fetchAllMerchantLinks ──────────────────────────────────────────────────

  async fetchAllMerchantLinks(
    merchant: PublicKey
  ): Promise<Array<{ pda: PublicKey; account: PaymentLinkAccount }>> {
    const accounts = await this.program.account.paymentLink.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: merchant.toBase58(),
        },
      },
    ]);
    return accounts.map((a) => ({
      pda: a.publicKey,
      account: a.account as PaymentLinkAccount,
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async buildTx(
    instructions: TransactionInstruction[]
  ): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = this.wallet.publicKey;
    tx.add(...instructions);
    return tx;
  }
}
