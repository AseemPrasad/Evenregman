import "server-only";

export type ProductTier = "COMMUNITY" | "TEAM" | "ENTERPRISE";

export type FeatureFlag =
  | "UNLIMITED_RESOURCES"
  | "ENTERPRISE_SSO"
  | "SCIM_PROVISIONING"
  | "LIVE_AUDIT_STREAM"
  | "CLOUD_WASTE_ANALYTICS"
  | "CUSTOM_WEBHOOKS"
  | "DEDICATED_SUPPORT";

export interface EntitlementConfig {
  tier: ProductTier;
  maxResources: number;
  maxConcurrentLeasesPerUser: number;
  enabledFeatures: Set<FeatureFlag>;
}

const TIER_ENTITLEMENTS: Record<ProductTier, EntitlementConfig> = {
  COMMUNITY: {
    tier: "COMMUNITY",
    maxResources: 10,
    maxConcurrentLeasesPerUser: 2,
    enabledFeatures: new Set([
      "UNLIMITED_RESOURCES" // Community is self-hosted and generous
    ])
  },
  TEAM: {
    tier: "TEAM",
    maxResources: 50,
    maxConcurrentLeasesPerUser: 5,
    enabledFeatures: new Set([
      "UNLIMITED_RESOURCES",
      "CUSTOM_WEBHOOKS",
      "CLOUD_WASTE_ANALYTICS"
    ])
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    maxResources: 999999,
    maxConcurrentLeasesPerUser: 50,
    enabledFeatures: new Set([
      "UNLIMITED_RESOURCES",
      "ENTERPRISE_SSO",
      "SCIM_PROVISIONING",
      "LIVE_AUDIT_STREAM",
      "CLOUD_WASTE_ANALYTICS",
      "CUSTOM_WEBHOOKS",
      "DEDICATED_SUPPORT"
    ])
  }
};

/**
 * Retrieves the active entitlement configuration.
 * By default in self-hosted mode without a license key, it defaults to COMMUNITY.
 */
export function getActiveEntitlements(): EntitlementConfig {
  const licenseKey = process.env.RESMESH_ENTERPRISE_LICENSE_KEY;

  if (licenseKey && licenseKey.startsWith("rmsh_ent_")) {
    return TIER_ENTITLEMENTS.ENTERPRISE;
  }

  if (process.env.RESMESH_TIER === "TEAM") {
    return TIER_ENTITLEMENTS.TEAM;
  }

  return TIER_ENTITLEMENTS.COMMUNITY;
}

/**
 * Non-blocking entitlement check for premium/enterprise features.
 */
export function checkFeatureEntitlement(feature: FeatureFlag): boolean {
  const entitlements = getActiveEntitlements();
  return entitlements.enabledFeatures.has(feature);
}

