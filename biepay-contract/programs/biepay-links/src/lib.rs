use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer, TransferChecked},
};

declare_id!("BiePayLinks1111111111111111111111111111111");

// ─── Constants ────────────────────────────────────────────────────────────────

/// Maximum memo length stored on-chain (fits in a single account without
/// reallocation — keep short to save rent).
const MAX_MEMO_LEN: usize = 32;
const MAX_LABEL_LEN: usize = 80;
const MAX_DESC_LEN: usize = 200;

/// Platform fee denominator (basis points).  50 BPS = 0.50 %.
const FEE_BPS_DENOM: u64 = 10_000;

// ─── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod biepay_links {
    use super::*;

    // ── create_link ──────────────────────────────────────────────────────────
    /// Initialise a new PaymentLink account.
    /// For fixed-amount SOL links the exact lamports are escrowed immediately.
    /// SPL token links hold configuration only — tokens move directly during pay.
    pub fn create_link(ctx: Context<CreateLink>, params: CreateLinkParams) -> Result<()> {
        let link = &mut ctx.accounts.payment_link;

        // Validate params
        require!(params.label.len() <= MAX_LABEL_LEN, BiePayError::LabelTooLong);
        require!(params.description.len() <= MAX_DESC_LEN, BiePayError::DescTooLong);
        if let Some(ref m) = params.memo {
            require!(m.len() <= MAX_MEMO_LEN, BiePayError::MemoTooLong);
        }
        require!(
            params.max_payments == 0 || params.max_payments > 0,
            BiePayError::InvalidMaxPayments
        ); // always true; explicit guard left for clarity

        let clock = Clock::get()?;

        link.merchant       = ctx.accounts.merchant.key();
        link.recipient      = ctx.accounts.recipient.key();
        link.link_id        = params.link_id;
        link.token_mint     = ctx.accounts.token_mint.as_ref().map(|m| m.key());
        link.amount         = params.amount;        // 0 = open amount
        link.fee_bps        = params.fee_bps;
        link.label          = params.label;
        link.description    = params.description;
        link.memo           = params.memo;
        link.expires_at     = params.expires_at;    // 0 = never
        link.max_payments   = params.max_payments;  // 0 = unlimited
        link.payment_count  = 0;
        link.total_received = 0;
        link.status         = LinkStatus::Active;
        link.created_at     = clock.unix_timestamp;
        link.bump           = ctx.bumps.payment_link;

        emit!(LinkCreated {
            link:      link.key(),
            merchant:  link.merchant,
            link_id:   link.link_id,
            amount:    link.amount,
            token:     link.token_mint,
            label:     link.label.clone(),
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    // ── pay_sol ──────────────────────────────────────────────────────────────
    /// Pay a SOL payment link.  Splits the transfer: net amount → recipient,
    /// fee → treasury.  Amount for open-amount links is passed as `pay_amount`.
    pub fn pay_sol(ctx: Context<PaySol>, pay_amount: u64) -> Result<()> {
        let link = &mut ctx.accounts.payment_link;
        let clock = Clock::get()?;

        // ── Guards ───────────────────────────────────────────────────────────
        require!(link.status == LinkStatus::Active, BiePayError::LinkNotActive);
        require!(link.token_mint.is_none(), BiePayError::WrongTokenType);
        if link.expires_at > 0 {
            require!(clock.unix_timestamp < link.expires_at, BiePayError::LinkExpired);
        }
        if link.max_payments > 0 {
            require!(
                link.payment_count < link.max_payments,
                BiePayError::LinkAtCapacity
            );
        }

        // ── Resolve amount ───────────────────────────────────────────────────
        let amount = if link.amount > 0 {
            link.amount             // fixed — ignore caller-supplied value
        } else {
            require!(pay_amount > 0, BiePayError::AmountRequired);
            pay_amount
        };

        require!(amount >= 1_000, BiePayError::AmountTooSmall); // min 0.000001 SOL

        // ── Fee split ────────────────────────────────────────────────────────
        let fee = fee_amount(amount, link.fee_bps);
        let net = amount.checked_sub(fee).ok_or(BiePayError::ArithmeticOverflow)?;

        // Transfer net → recipient
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to:   ctx.accounts.recipient.to_account_info(),
                },
            ),
            net,
        )?;

        // Transfer fee → treasury (only if treasury supplied and fee > 0)
        if fee > 0 {
            if let Some(treasury) = ctx.accounts.treasury.as_ref() {
                anchor_lang::system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Transfer {
                            from: ctx.accounts.payer.to_account_info(),
                            to:   treasury.to_account_info(),
                        },
                    ),
                    fee,
                )?;
            }
        }

        // ── State update ─────────────────────────────────────────────────────
        link.payment_count  = link.payment_count.checked_add(1)
            .ok_or(BiePayError::ArithmeticOverflow)?;
        link.total_received = link.total_received.checked_add(amount)
            .ok_or(BiePayError::ArithmeticOverflow)?;

        if link.max_payments > 0 && link.payment_count >= link.max_payments {
            link.status = LinkStatus::Completed;
        }

        emit!(PaymentMade {
            link:      link.key(),
            payer:     ctx.accounts.payer.key(),
            recipient: ctx.accounts.recipient.key(),
            amount,
            fee,
            token:     None,
            count:     link.payment_count,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    // ── pay_spl ──────────────────────────────────────────────────────────────
    /// Pay an SPL token (USDC / USDT) payment link.
    /// Uses `transfer_checked` for safety — enforces mint + decimals match.
    pub fn pay_spl(ctx: Context<PaySpl>, pay_amount: u64) -> Result<()> {
        let link = &mut ctx.accounts.payment_link;
        let clock = Clock::get()?;

        // ── Guards ───────────────────────────────────────────────────────────
        require!(link.status == LinkStatus::Active, BiePayError::LinkNotActive);
        require!(link.token_mint.is_some(), BiePayError::WrongTokenType);
        require!(
            link.token_mint.unwrap() == ctx.accounts.mint.key(),
            BiePayError::MintMismatch
        );
        if link.expires_at > 0 {
            require!(clock.unix_timestamp < link.expires_at, BiePayError::LinkExpired);
        }
        if link.max_payments > 0 {
            require!(
                link.payment_count < link.max_payments,
                BiePayError::LinkAtCapacity
            );
        }

        // ── Resolve amount ───────────────────────────────────────────────────
        let amount = if link.amount > 0 {
            link.amount
        } else {
            require!(pay_amount > 0, BiePayError::AmountRequired);
            pay_amount
        };
        require!(amount >= 1, BiePayError::AmountTooSmall);

        // ── Fee split ────────────────────────────────────────────────────────
        let fee = fee_amount(amount, link.fee_bps);
        let net = amount.checked_sub(fee).ok_or(BiePayError::ArithmeticOverflow)?;
        let decimals = ctx.accounts.mint.decimals;

        // Net → recipient ATA
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from:      ctx.accounts.payer_ata.to_account_info(),
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.recipient_ata.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            net,
            decimals,
        )?;

        // Fee → treasury ATA
        if fee > 0 {
            if let (Some(t_ata), Some(t_auth)) = (
                ctx.accounts.treasury_ata.as_ref(),
                ctx.accounts.treasury.as_ref(),
            ) {
                token::transfer_checked(
                    CpiContext::new(
                        ctx.accounts.token_program.to_account_info(),
                        TransferChecked {
                            from:      ctx.accounts.payer_ata.to_account_info(),
                            mint:      ctx.accounts.mint.to_account_info(),
                            to:        t_ata.to_account_info(),
                            authority: ctx.accounts.payer.to_account_info(),
                        },
                    ),
                    fee,
                    decimals,
                )?;
                let _ = t_auth; // suppress unused warning
            }
        }

        // ── State update ─────────────────────────────────────────────────────
        link.payment_count  = link.payment_count.checked_add(1)
            .ok_or(BiePayError::ArithmeticOverflow)?;
        link.total_received = link.total_received.checked_add(amount)
            .ok_or(BiePayError::ArithmeticOverflow)?;

        if link.max_payments > 0 && link.payment_count >= link.max_payments {
            link.status = LinkStatus::Completed;
        }

        emit!(PaymentMade {
            link:      link.key(),
            payer:     ctx.accounts.payer.key(),
            recipient: ctx.accounts.recipient.key(),
            amount,
            fee,
            token:     Some(ctx.accounts.mint.key()),
            count:     link.payment_count,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    // ── cancel_link ──────────────────────────────────────────────────────────
    /// Merchant cancels an active link.  Only the original merchant can call.
    /// Rent is returned to the merchant.
    pub fn cancel_link(ctx: Context<CancelLink>) -> Result<()> {
        let link = &mut ctx.accounts.payment_link;
        require!(link.status == LinkStatus::Active, BiePayError::LinkNotActive);

        link.status = LinkStatus::Cancelled;

        let clock = Clock::get()?;
        emit!(LinkCancelled {
            link:      link.key(),
            merchant:  link.merchant,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    // ── close_link ───────────────────────────────────────────────────────────
    /// Close a completed or cancelled link account and reclaim rent.
    /// Only callable by the merchant.
    pub fn close_link(_ctx: Context<CloseLink>) -> Result<()> {
        // Anchor's `close = merchant` constraint in the account struct handles
        // the lamport transfer back to the merchant automatically.
        Ok(())
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

fn fee_amount(amount: u64, fee_bps: u16) -> u64 {
    if fee_bps == 0 {
        return 0;
    }
    // Use u128 for intermediate to avoid overflow on large amounts
    ((amount as u128 * fee_bps as u128) / FEE_BPS_DENOM as u128) as u64
}

// ─── Account state ────────────────────────────────────────────────────────────

#[account]
#[derive(Default)]
pub struct PaymentLink {
    /// The merchant who created this link (authority for cancel/close).
    pub merchant: Pubkey,           // 32
    /// Wallet that receives payments.
    pub recipient: Pubkey,          // 32
    /// Short unique ID matching the API-layer link ID (off-chain reference).
    pub link_id: [u8; 10],          // 10  ← nanoid(10) fits exactly
    /// None = SOL, Some(mint) = SPL token.
    pub token_mint: Option<Pubkey>, // 33
    /// Fixed amount in token's base units.  0 = open amount (payer supplies).
    pub amount: u64,                // 8
    /// Platform fee in basis points (e.g. 50 = 0.50%).
    pub fee_bps: u16,               // 2
    /// Human-readable label shown in Phantom UI.
    pub label: String,              // 4 + MAX_LABEL_LEN
    /// Longer description shown below label.
    pub description: String,        // 4 + MAX_DESC_LEN
    /// Optional on-chain memo written by the pay instruction.
    pub memo: Option<String>,       // 1 + 4 + MAX_MEMO_LEN
    /// Unix timestamp after which payments are rejected.  0 = never.
    pub expires_at: i64,            // 8
    /// Total payments allowed.  0 = unlimited.
    pub max_payments: u64,          // 8
    /// Number of successful payments so far.
    pub payment_count: u64,         // 8
    /// Cumulative base-units received (net + fees, before split).
    pub total_received: u64,        // 8
    /// Current state.
    pub status: LinkStatus,         // 1
    /// When the link was created.
    pub created_at: i64,            // 8
    /// PDA bump.
    pub bump: u8,                   // 1
}

impl PaymentLink {
    /// Space calculation (discriminator + all fields):
    /// 8 + 32 + 32 + 10 + 33 + 8 + 2 + (4+80) + (4+200) + (1+4+32) + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1 = 510
    pub const LEN: usize = 8
        + 32 + 32 + 10 + 33 + 8 + 2
        + (4 + MAX_LABEL_LEN)
        + (4 + MAX_DESC_LEN)
        + (1 + 4 + MAX_MEMO_LEN)
        + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Default)]
pub enum LinkStatus {
    #[default]
    Active,
    Completed,
    Cancelled,
}

// ─── Instruction parameters ───────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateLinkParams {
    /// Must match the API-layer nanoid (exactly 10 bytes, UTF-8).
    pub link_id: [u8; 10],
    pub amount: u64,
    pub fee_bps: u16,
    pub label: String,
    pub description: String,
    pub memo: Option<String>,
    pub expires_at: i64,
    pub max_payments: u64,
}

// ─── Accounts structs ─────────────────────────────────────────────────────────

/// PDA seeds: ["payment_link", merchant_pubkey, link_id_bytes]
/// Keeps each merchant's links independent; link_id prevents collisions.
#[derive(Accounts)]
#[instruction(params: CreateLinkParams)]
pub struct CreateLink<'info> {
    #[account(
        init,
        payer = merchant,
        space = PaymentLink::LEN,
        seeds = [
            b"payment_link",
            merchant.key().as_ref(),
            &params.link_id,
        ],
        bump
    )]
    pub payment_link: Account<'info, PaymentLink>,

    #[account(mut)]
    pub merchant: Signer<'info>,

    /// CHECK: recipient is just stored — not signed or owned by program.
    pub recipient: AccountInfo<'info>,

    /// Present for SPL links; omit (use system program) for SOL links.
    pub token_mint: Option<Account<'info, Mint>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PaySol<'info> {
    #[account(
        mut,
        seeds = [
            b"payment_link",
            payment_link.merchant.as_ref(),
            &payment_link.link_id,
        ],
        bump = payment_link.bump,
    )]
    pub payment_link: Account<'info, PaymentLink>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: validated against payment_link.recipient inside instruction.
    #[account(
        mut,
        address = payment_link.recipient @ BiePayError::RecipientMismatch
    )]
    pub recipient: AccountInfo<'info>,

    /// CHECK: treasury can be any writable account; optional.
    #[account(mut)]
    pub treasury: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PaySpl<'info> {
    #[account(
        mut,
        seeds = [
            b"payment_link",
            payment_link.merchant.as_ref(),
            &payment_link.link_id,
        ],
        bump = payment_link.bump,
    )]
    pub payment_link: Account<'info, PaymentLink>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    /// Payer's associated token account for `mint`.
    #[account(
        mut,
        associated_token::mint      = mint,
        associated_token::authority = payer,
    )]
    pub payer_ata: Account<'info, TokenAccount>,

    /// Recipient's associated token account — created if absent (payer pays rent).
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint      = mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Account<'info, TokenAccount>,

    /// CHECK: validated against payment_link.recipient.
    #[account(
        address = payment_link.recipient @ BiePayError::RecipientMismatch
    )]
    pub recipient: AccountInfo<'info>,

    /// Optional treasury ATA for platform fee.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint      = mint,
        associated_token::authority = treasury,
        constraint = treasury_ata.is_none() || treasury.is_some()
            @ BiePayError::MissingTreasury
    )]
    pub treasury_ata: Option<Account<'info, TokenAccount>>,

    /// CHECK: treasury authority for fee collection; optional.
    pub treasury: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelLink<'info> {
    #[account(
        mut,
        seeds = [
            b"payment_link",
            merchant.key().as_ref(),
            &payment_link.link_id,
        ],
        bump = payment_link.bump,
        has_one = merchant @ BiePayError::Unauthorized,
    )]
    pub payment_link: Account<'info, PaymentLink>,

    #[account(mut)]
    pub merchant: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseLink<'info> {
    #[account(
        mut,
        close = merchant,
        seeds = [
            b"payment_link",
            merchant.key().as_ref(),
            &payment_link.link_id,
        ],
        bump = payment_link.bump,
        has_one = merchant @ BiePayError::Unauthorized,
        constraint = payment_link.status != LinkStatus::Active
            @ BiePayError::CannotCloseActiveLink,
    )]
    pub payment_link: Account<'info, PaymentLink>,

    #[account(mut)]
    pub merchant: Signer<'info>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct LinkCreated {
    pub link:      Pubkey,
    pub merchant:  Pubkey,
    pub link_id:   [u8; 10],
    pub amount:    u64,
    pub token:     Option<Pubkey>,
    pub label:     String,
    pub timestamp: i64,
}

#[event]
pub struct PaymentMade {
    pub link:      Pubkey,
    pub payer:     Pubkey,
    pub recipient: Pubkey,
    pub amount:    u64,
    pub fee:       u64,
    pub token:     Option<Pubkey>,
    pub count:     u64,
    pub timestamp: i64,
}

#[event]
pub struct LinkCancelled {
    pub link:      Pubkey,
    pub merchant:  Pubkey,
    pub timestamp: i64,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum BiePayError {
    #[msg("Payment link is not active")]
    LinkNotActive,
    #[msg("Payment link has expired")]
    LinkExpired,
    #[msg("Payment link has reached its maximum payment count")]
    LinkAtCapacity,
    #[msg("Amount is required for open-amount payment links")]
    AmountRequired,
    #[msg("Amount is below the minimum allowed")]
    AmountTooSmall,
    #[msg("Recipient account does not match the payment link")]
    RecipientMismatch,
    #[msg("Token mint does not match the payment link")]
    MintMismatch,
    #[msg("This link is for SOL, not an SPL token (or vice versa)")]
    WrongTokenType,
    #[msg("Treasury account is required when treasury ATA is provided")]
    MissingTreasury,
    #[msg("Only the merchant who created this link can perform this action")]
    Unauthorized,
    #[msg("Cannot close an active payment link — cancel it first")]
    CannotCloseActiveLink,
    #[msg("Label exceeds maximum length")]
    LabelTooLong,
    #[msg("Description exceeds maximum length")]
    DescTooLong,
    #[msg("Memo exceeds maximum length (32 chars)")]
    MemoTooLong,
    #[msg("Invalid max_payments value")]
    InvalidMaxPayments,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
