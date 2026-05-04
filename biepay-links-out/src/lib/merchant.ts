import { prisma } from "./db";
import { MerchantProfile, UpdateMerchantProfileInput } from "../types";

/**
 * Retrieves a merchant profile from the database.
 * If no profile exists for the given ID, it creates a default one.
 */
export async function getMerchantProfile(merchantId: string): Promise<MerchantProfile> {
  const profile = await prisma.merchantProfile.findUnique({
    where: { merchantId },
  });
  
  if (!profile) {
    // Create a default profile if none exists
    const defaultProfile = await prisma.merchantProfile.create({
      data: {
        merchantId,
        businessName: null,
        logoUrl: null,
        accentColor: "#c5a36e",
        webhookUrl: null,
      },
    });
    return defaultProfile as unknown as MerchantProfile;
  }
  
  return profile as unknown as MerchantProfile;
}

/**
 * Updates an existing merchant profile.
 */
export async function updateMerchantProfile(
  merchantId: string,
  input: UpdateMerchantProfileInput
): Promise<MerchantProfile> {
  const updated = await prisma.merchantProfile.upsert({
    where: { merchantId },
    update: {
      ...input,
      updatedAt: new Date(),
    },
    create: {
      merchantId,
      ...input,
    },
  });
  
  return updated as unknown as MerchantProfile;
}
