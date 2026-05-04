import { Request, Response, NextFunction } from "express";
import { PrivyClient } from "@privy-io/server-auth";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

const privy = PRIVY_APP_ID && PRIVY_APP_SECRET
  ? new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  : null;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    allowedIds: string[]; // The privy user ID + all linked wallet addresses
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!privy) {
    console.warn("⚠️  Privy Auth is bypassed because PRIVY_APP_ID and PRIVY_APP_SECRET are not set. The API is INSECURE.");
    // In dev, if bypassed, just set dummy IDs based on the query or body so it doesn't break entirely
    req.user = { 
      id: "bypassed", 
      allowedIds: (req.query.merchantId as string)?.split(",") || [req.body.merchantId, req.body.recipientWallet].filter(Boolean)
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;
    
    // Fetch the full user object from Privy to get their linked wallets
    const privyUser = await privy.getUser(userId);
    
    const allowedIds = [userId];
    privyUser.linkedAccounts.forEach((account) => {
      if (account.type === 'wallet') {
        allowedIds.push(account.address);
      }
    });

    req.user = {
      id: userId,
      allowedIds,
    };
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
