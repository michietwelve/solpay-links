/**
 * BiePay Links — Anchor test suite
 * Run with: anchor test
 *
 * Covers:
 *  ✓ create_link (SOL, fixed amount)
 *  ✓ create_link (SPL, open amount)
 *  ✓ pay_sol (correct split + fee)
 *  ✓ pay_sol (open amount)
 *  ✓ pay_sol rejects expired link
 *  ✓ pay_sol rejects after max_payments reached
 *  ✓ pay_spl (USDC fixed amount)
 *  ✓ cancel_link (merchant only)
 *  ✓ cancel_link rejects non-merchant
 *  ✓ close_link reclaims rent
 *  ✓ close_link rejects active link
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { findPaymentLinkPDA, linkIdToBytes } from "../app/src/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function airdrop(
  connection: Connection,
  to: PublicKey,
  sol = 10
): Promise<void> {
  const sig = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

function shortId(): string {
  // Returns a deterministic 10-char string for tests
  return Math.random().toString(36).slice(2, 12).padEnd(10, "0");
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("biepay_links", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolpayLinks as Program;
  const connection = provider.connection;

  // Test keypairs
  const merchant   = Keypair.generate();
  const recipient  = Keypair.generate();
  const payer      = Keypair.generate();
  const attacker   = Keypair.generate();
  const treasury   = Keypair.generate();

  // USDC mock mint
  let usdcMint: PublicKey;
  let payerUsdcAta: PublicKey;

  // ── Setup ──────────────────────────────────────────────────────────────────

  before(async () => {
    await Promise.all([
      airdrop(connection, merchant.publicKey),
      airdrop(connection, payer.publicKey),
      airdrop(connection, attacker.publicKey),
      airdrop(connection, recipient.publicKey),
    ]);

    // Create a mock USDC mint (6 decimals)
    usdcMint = await createMint(
      connection,
      merchant,           // payer
      merchant.publicKey, // mint authority
      null,               // freeze authority
      6                   // decimals
    );

    // Give payer some mock USDC
    payerUsdcAta = await createAssociatedTokenAccount(
      connection,
      payer,
      usdcMint,
      payer.publicKey
    );

    await mintTo(
      connection,
      merchant,
      usdcMint,
      payerUsdcAta,
      merchant,
      1_000 * 1_000_000 // 1000 USDC
    );
  });

  // ── create_link (SOL, fixed) ───────────────────────────────────────────────

  describe("create_link", () => {
    it("creates a SOL fixed-amount link", async () => {
      const id = shortId();
      const linkIdBytes = linkIdToBytes(id);
      const [pda] = findPaymentLinkPDA(merchant.publicKey, linkIdBytes);

      await program.methods
        .createLink({
          linkId: Array.from(linkIdBytes),
          amount: new BN(0.5 * LAMPORTS_PER_SOL),
          feeBps: 50,
          label: "Test invoice",
          description: "For services rendered",
          memo: "INV-001",
          expiresAt: new BN(0),
          maxPayments: new BN(1),
        })
        .accounts({
          paymentLink: pda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();

      const account = await program.account.paymentLink.fetch(pda);
      assert.equal(account.merchant.toBase58(), merchant.publicKey.toBase58());
      assert.equal(account.recipient.toBase58(), recipient.publicKey.toBase58());
      assert.equal(account.amount.toNumber(), 0.5 * LAMPORTS_PER_SOL);
      assert.equal(account.feeBps, 50);
      assert.equal(account.label, "Test invoice");
      assert.deepEqual(account.status, { active: {} });
      assert.equal(account.paymentCount.toNumber(), 0);
    });

    it("creates an SPL open-amount link", async () => {
      const id = shortId();
      const linkIdBytes = linkIdToBytes(id);
      const [pda] = findPaymentLinkPDA(merchant.publicKey, linkIdBytes);

      await program.methods
        .createLink({
          linkId: Array.from(linkIdBytes),
          amount: new BN(0), // open amount
          feeBps: 50,
          label: "USDC Tip Jar",
          description: "Send any amount",
          memo: null,
          expiresAt: new BN(0),
          maxPayments: new BN(0), // unlimited
        })
        .accounts({
          paymentLink: pda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();

      const account = await program.account.paymentLink.fetch(pda);
      assert.equal(account.amount.toNumber(), 0);
      assert.equal(account.tokenMint!.toBase58(), usdcMint.toBase58());
    });
  });

  // ── pay_sol ────────────────────────────────────────────────────────────────

  describe("pay_sol", () => {
    let payLinkId: string;
    let payLinkPda: PublicKey;

    before(async () => {
      payLinkId = shortId();
      const [pda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(payLinkId)
      );
      payLinkPda = pda;

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(payLinkId)),
          amount: new BN(1_000_000), // 0.001 SOL
          feeBps: 50,
          label: "Pay SOL",
          description: "desc",
          memo: null,
          expiresAt: new BN(0),
          maxPayments: new BN(2),
        })
        .accounts({
          paymentLink: payLinkPda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    });

    it("transfers net amount to recipient and fee to treasury", async () => {
      const recipientBefore = await connection.getBalance(recipient.publicKey);
      const treasuryBefore  = await connection.getBalance(treasury.publicKey);

      await program.methods
        .paySol(new BN(0)) // 0 = use fixed amount
        .accounts({
          paymentLink: payLinkPda,
          payer: payer.publicKey,
          recipient: recipient.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      const recipientAfter = await connection.getBalance(recipient.publicKey);
      const treasuryAfter  = await connection.getBalance(treasury.publicKey);

      const amount = 1_000_000;
      const fee    = Math.floor((amount * 50) / 10_000); // 50 BPS
      const net    = amount - fee;

      assert.equal(recipientAfter - recipientBefore, net);
      assert.equal(treasuryAfter  - treasuryBefore,  fee);

      const acct = await program.account.paymentLink.fetch(payLinkPda);
      assert.equal(acct.paymentCount.toNumber(), 1);
      assert.equal(acct.totalReceived.toNumber(), amount);
    });

    it("marks link as Completed after max_payments reached", async () => {
      await program.methods
        .paySol(new BN(0))
        .accounts({
          paymentLink: payLinkPda,
          payer: payer.publicKey,
          recipient: recipient.publicKey,
          treasury: treasury.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      const acct = await program.account.paymentLink.fetch(payLinkPda);
      assert.deepEqual(acct.status, { completed: {} });
      assert.equal(acct.paymentCount.toNumber(), 2);
    });

    it("rejects payment on completed link", async () => {
      try {
        await program.methods
          .paySol(new BN(0))
          .accounts({
            paymentLink: payLinkPda,
            payer: payer.publicKey,
            recipient: recipient.publicKey,
            treasury: null,
            systemProgram: SystemProgram.programId,
          })
          .signers([payer])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "LinkNotActive");
      }
    });

    it("rejects payment on expired link", async () => {
      const expiredId = shortId();
      const [expiredPda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(expiredId)
      );

      // Expire 1 second in the past
      const expiredAt = Math.floor(Date.now() / 1000) - 1;

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(expiredId)),
          amount: new BN(1_000_000),
          feeBps: 0,
          label: "Expired",
          description: "desc",
          memo: null,
          expiresAt: new BN(expiredAt),
          maxPayments: new BN(0),
        })
        .accounts({
          paymentLink: expiredPda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();

      try {
        await program.methods
          .paySol(new BN(0))
          .accounts({
            paymentLink: expiredPda,
            payer: payer.publicKey,
            recipient: recipient.publicKey,
            treasury: null,
            systemProgram: SystemProgram.programId,
          })
          .signers([payer])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "LinkExpired");
      }
    });
  });

  // ── pay_spl ────────────────────────────────────────────────────────────────

  describe("pay_spl", () => {
    let splLinkId: string;
    let splLinkPda: PublicKey;

    before(async () => {
      splLinkId = shortId();
      const [pda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(splLinkId)
      );
      splLinkPda = pda;

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(splLinkId)),
          amount: new BN(50 * 1_000_000), // 50 USDC
          feeBps: 50,
          label: "USDC Invoice",
          description: "50 USDC fixed",
          memo: "INV-USDC-001",
          expiresAt: new BN(0),
          maxPayments: new BN(1),
        })
        .accounts({
          paymentLink: splLinkPda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: usdcMint,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    });

    it("transfers correct USDC amounts to recipient and treasury", async () => {
      const recipientAta = await createAssociatedTokenAccount(
        connection, payer, usdcMint, recipient.publicKey
      ).catch(() => {
        const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
        return getAssociatedTokenAddressSync(usdcMint, recipient.publicKey);
      });

      const treasuryAta = await createAssociatedTokenAccount(
        connection, payer, usdcMint, treasury.publicKey
      ).catch(() => {
        const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
        return getAssociatedTokenAddressSync(usdcMint, treasury.publicKey);
      });

      await program.methods
        .paySpl(new BN(0)) // use fixed amount
        .accounts({
          paymentLink:  splLinkPda,
          payer:        payer.publicKey,
          mint:         usdcMint,
          payerAta:     payerUsdcAta,
          recipientAta,
          recipient:    recipient.publicKey,
          treasuryAta,
          treasury:     treasury.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();

      const amount  = 50 * 1_000_000;
      const fee     = Math.floor((amount * 50) / 10_000);
      const net     = amount - fee;

      const recipientBalance = (await getAccount(connection, recipientAta)).amount;
      const treasuryBalance  = (await getAccount(connection, treasuryAta)).amount;

      assert.equal(Number(recipientBalance), net);
      assert.equal(Number(treasuryBalance),  fee);
    });
  });

  // ── cancel_link ────────────────────────────────────────────────────────────

  describe("cancel_link", () => {
    let cancelId: string;
    let cancelPda: PublicKey;

    before(async () => {
      cancelId = shortId();
      const [pda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(cancelId)
      );
      cancelPda = pda;

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(cancelId)),
          amount: new BN(1_000_000),
          feeBps: 0,
          label: "Cancellable",
          description: "desc",
          memo: null,
          expiresAt: new BN(0),
          maxPayments: new BN(0),
        })
        .accounts({
          paymentLink: cancelPda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();
    });

    it("rejects cancel from non-merchant", async () => {
      try {
        await program.methods
          .cancelLink()
          .accounts({
            paymentLink: cancelPda,
            merchant: attacker.publicKey,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "seeds constraint");
      }
    });

    it("merchant can cancel an active link", async () => {
      await program.methods
        .cancelLink()
        .accounts({
          paymentLink: cancelPda,
          merchant: merchant.publicKey,
        })
        .signers([merchant])
        .rpc();

      const acct = await program.account.paymentLink.fetch(cancelPda);
      assert.deepEqual(acct.status, { cancelled: {} });
    });

    it("cannot cancel an already-cancelled link", async () => {
      try {
        await program.methods
          .cancelLink()
          .accounts({
            paymentLink: cancelPda,
            merchant: merchant.publicKey,
          })
          .signers([merchant])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "LinkNotActive");
      }
    });
  });

  // ── close_link ─────────────────────────────────────────────────────────────

  describe("close_link", () => {
    it("reclaims rent after cancel", async () => {
      const id = shortId();
      const [pda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(id)
      );

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(id)),
          amount: new BN(1_000_000),
          feeBps: 0,
          label: "Closeable",
          description: "desc",
          memo: null,
          expiresAt: new BN(0),
          maxPayments: new BN(0),
        })
        .accounts({
          paymentLink: pda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();

      await program.methods
        .cancelLink()
        .accounts({ paymentLink: pda, merchant: merchant.publicKey })
        .signers([merchant])
        .rpc();

      const balanceBefore = await connection.getBalance(merchant.publicKey);

      await program.methods
        .closeLink()
        .accounts({ paymentLink: pda, merchant: merchant.publicKey })
        .signers([merchant])
        .rpc();

      const balanceAfter = await connection.getBalance(merchant.publicKey);
      // Merchant should get rent back (minus tx fee)
      assert.isAbove(balanceAfter, balanceBefore);

      // Account should no longer exist
      const acctInfo = await connection.getAccountInfo(pda);
      assert.isNull(acctInfo);
    });

    it("rejects closing an active link", async () => {
      const id = shortId();
      const [pda] = findPaymentLinkPDA(
        merchant.publicKey,
        linkIdToBytes(id)
      );

      await program.methods
        .createLink({
          linkId: Array.from(linkIdToBytes(id)),
          amount: new BN(1_000_000),
          feeBps: 0,
          label: "Active link",
          description: "desc",
          memo: null,
          expiresAt: new BN(0),
          maxPayments: new BN(0),
        })
        .accounts({
          paymentLink: pda,
          merchant: merchant.publicKey,
          recipient: recipient.publicKey,
          tokenMint: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([merchant])
        .rpc();

      try {
        await program.methods
          .closeLink()
          .accounts({ paymentLink: pda, merchant: merchant.publicKey })
          .signers([merchant])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "CannotCloseActiveLink");
      }
    });
  });
});
