import { Request, Response, NextFunction } from "express";

/**
 * Solana Actions requires these CORS headers on every endpoint —
 * GET, POST, and OPTIONS preflight — or wallets like Phantom will
 * silently reject the request.
 */
export function actionsHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids"
  );
  res.setHeader("Access-Control-Expose-Headers", "X-Action-Version, X-Blockchain-Ids");
  // Declare Actions protocol version and Solana chain
  res.setHeader("X-Action-Version", "2.4");
  res.setHeader("X-Blockchain-Ids", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  next();
}

/**
 * Handle all OPTIONS preflight requests uniformly across the API.
 */
export function optionsPreflight(
  _req: Request,
  res: Response
): void {
  res.status(200).end();
}

/**
 * Error response helper that conforms to the ActionError spec.
 */
export function actionError(res: Response, status: number, message: string): void {
  res.status(status).json({ message });
}
