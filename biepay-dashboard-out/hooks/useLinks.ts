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
  const { getAccessToken, authenticated, user } = usePrivy();
  const { data, error, isLoading } = useSWR<PaymentLink[]>(
    authenticated && user && merchantId ? [`/api/links`, merchantId, user.id] : null,
    async ([url, mId, uId]: [string, string, string]) => {
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

export function useAllPayments() {
  const { getAccessToken, authenticated, user } = usePrivy();
  const { data, error, isLoading, mutate } = useSWR(
    authenticated && user ? [`/api/links/all/payments`, user.id] : null,
    async () => {
      const token = await getAccessToken();
      return linksApi.allPayments(token ?? "");
    },
    { refreshInterval: 15_000 }
  );
  return { payments: data ?? [], error, isLoading, mutate };
}

export function useAnalytics(merchantId: string | undefined) {
  const { user, getAccessToken } = usePrivy();
  const { data, error, isLoading } = useSWR(
    user && merchantId ? ["/api/analytics", merchantId, user.id] : null,
    async ([_, id]) => {
      const token = await getAccessToken();
      return linksApi.analytics(token ?? "", id);
    },
    { refreshInterval: 60_000 }
  );
  return { analytics: data ?? [], error, isLoading };
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

export async function triggerSync(token: string): Promise<{ success: boolean; count: number }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/links/all/sync`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error("Sync failed");
  const data = await res.json();
  
  // Invalidate payments list to show new confirmed transactions
  await globalMutate(key => Array.isArray(key) && key[0] === "/api/links/all/payments");
  
  return data;
}
