import { Router, Request, Response } from "express";
import { optionsPreflight } from "../middleware/actions";

const router = Router();

/**
 * actions.json maps URL path patterns on your domain to Action API endpoints.
 * Wallets fetch this file to discover which URLs on your site are Actions.
 *
 * Must be served at the root: GET https://yourdomain.com/actions.json
 * Must return Access-Control-Allow-Origin: * (set by actionsHeaders middleware)
 *
 * Docs: https://solana.com/developers/guides/advanced/actions#actionsjson
 */

router.options("/", optionsPreflight);

router.get("/", (_req: Request, res: Response): void => {
  const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

  res.status(200).json({
    rules: [
      // All /pay/:linkId pages map to the Actions API
      {
        pathPattern: "/pay/**",
        apiPath: `${API_BASE}/actions/**`,
      },
      // Direct action API paths pass through as-is
      {
        pathPattern: "/actions/**",
        apiPath: "/actions/**",
      },
    ],
  });
});

export default router;
