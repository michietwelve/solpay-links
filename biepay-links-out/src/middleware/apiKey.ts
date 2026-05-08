import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/db";

export interface ApiKeyRequest extends Request {
  merchantId?: string;
}

export async function requireApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-biepay-key"];

  if (!apiKey || typeof apiKey !== "string") {
    res.status(401).json({ message: "X-BiePay-Key header is required" });
    return;
  }

  try {
    const merchant = await prisma.merchantProfile.findUnique({
      where: { apiKey }
    });

    if (!merchant) {
      res.status(401).json({ message: "Invalid API Key" });
      return;
    }

    // Update last used
    await prisma.merchantProfile.update({
      where: { merchantId: merchant.merchantId },
      data: { apiKeyLastUsed: new Date() }
    });

    req.merchantId = merchant.merchantId;
    next();
  } catch (err) {
    res.status(500).json({ message: "Auth failed" });
  }
}
