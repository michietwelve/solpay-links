import { Router, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user,
    env: {
      PRIVY_APP_ID: process.env.PRIVY_APP_ID ? "set" : "missing",
      RPC_ENDPOINT: process.env.RPC_ENDPOINT ? "set" : "missing",
    }
  });
});

export default router;
