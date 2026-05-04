/**
 * hooks/useLinks.ts
 * SWR data hooks — every component that needs live data imports from here.
 */
import useSWR, { mutate as globalMutate } from "swr";
import {
  linksApi,
  PaymentLink,
  CreateLinkPayload,
  CreateLinkResponse,
  computeStats,
  DashboardStats,
} from "../lib/api";
import { usePrivy } from "@privy-io/react-auth";

export function useLinks(merchantId?: string) {
  const { getAccessToken } = usePrivy();
  const { data, error, isLoading } = useSWR<PaymentLink[]>(
    merchantId ? [`/api/links`, merchantId] : null,
    async ([url, mId]: [string, string]) => {
      const token = await getAccessToken();
      return linksApi.list(token ?? "", mId);
    },
    { refreshInterval: 15_000 }
  );

  return {
    links: data ?? [],
    error,
    isLoading,
  };
}

export function useLink(id: string | null) {
  const { getAccessToken } = usePrivy();
  const { data, error, isLoading } = useSWR(
    id ? `/api/links/${id}` : null,
    async () => {
      const token = await getAccessToken();
      return linksApi.get(token ?? "", id!);
    },
    { refreshInterval: 10_000 }
  );
  return { link: data, error, isLoading };
}

export function useLinkPayments(id: string | null) {
  const { getAccessToken } = usePrivy();
  const { data, error, isLoading } = useSWR(
    id ? `/api/links/${id}/payments` : null,
    async () => {
      const token = await getAccessToken();
      return linksApi.payments(token ?? "", id!);
    },
    { refreshInterval: 10_000 }
  );
  return { data, error, isLoading };
}

export function useStats(merchantId?: string): { stats: DashboardStats; isLoading: boolean } {
  const { links, isLoading } = useLinks(merchantId);
  return { stats: computeStats(links), isLoading };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createLink(
  token: string,
  payload: CreateLinkPayload
): Promise<CreateLinkResponse> {
  const result = await linksApi.create(token, payload);
  // Invalidate any links list keys to ensure the dashboard updates immediately
  await globalMutate(key => Array.isArray(key) && key[0] === "/api/links");
  return result;
}

export async function deleteLink(token: string, id: string): Promise<void> {
  await linksApi.delete(token, id);
  await globalMutate(key => Array.isArray(key) && key[0] === "/api/links");
}
