import { MerchantProfile, UpdateMerchantProfileInput } from "../types";

// In-memory store for demo purposes
// In a real app, this would be a database like PostgreSQL or MongoDB
const merchantProfiles = new Map<string, MerchantProfile>();

export async function getMerchantProfile(merchantId: string): Promise<MerchantProfile> {
  let profile = merchantProfiles.get(merchantId);
  
  if (!profile) {
    // Return a default profile if none exists
    profile = {
      merchantId,
      businessName: null,
      logoUrl: null,
      accentColor: "#c5a36e", // Default gold
      webhookUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    merchantProfiles.set(merchantId, profile);
  }
  
  return profile;
}

export async function updateMerchantProfile(
  merchantId: string,
  input: UpdateMerchantProfileInput
): Promise<MerchantProfile> {
  const existing = await getMerchantProfile(merchantId);
  
  const updated: MerchantProfile = {
    ...existing,
    ...input,
    updatedAt: new Date(),
  };
  
  merchantProfiles.set(merchantId, updated);
  return updated;
}
