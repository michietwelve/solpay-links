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

const fetcher = {
  links: () => linksApi.list(),
  link: (id: string) => linksApi.get(id),
  payments: (id: string) => linksApi.payments(id),
};

export function useLinks(merchantId?: string) {
  const { data, error, isLoading } = useSWR<PaymentLink[]>(
    merchantId ? [`/api/links`, merchantId] : null,
    ([url, mId]: [string, string]) => linksApi.list(mId),
    { refreshInterval: 15_000 }
  );

  return {
    links: data ?? [],
    error,
    isLoading,
  };
}

export function useLink(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/links/${id}` : null,
    () => fetcher.link(id!),
    { refreshInterval: 10_000 }
  );
  return { link: data, error, isLoading };
}

export function useLinkPayments(id: string | null) {
  const { data, error, isLoading } = useSWR(
    id ? `/api/links/${id}/payments` : null,
    () => fetcher.payments(id!),
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
  payload: CreateLinkPayload
): Promise<CreateLinkResponse> {
  const result = await linksApi.create(payload);
  // Invalidate the links list so all consumers re-fetch
  await globalMutate("/api/links");
  return result;
}
