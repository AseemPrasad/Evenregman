import "server-only";

import { OrganizationModel } from "@/models/Organization";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export async function resolveIdentityProviderByEmail(email: string) {
  if (env.ENABLE_ENTERPRISE_SSO !== "true") {
    return null;
  }

  try {
    const domain = email.split("@")[1];
    if (!domain) return null;

    const org = await OrganizationModel.findOne({
      "identityProvider.emailDomain": `@${domain}`,
      "identityProvider.enabled": true,
      isActive: true
    });

    if (!org || !org.identityProvider) {
      return null;
    }

    return {
      orgId: org._id,
      org,
      idp: org.identityProvider
    };
  } catch (err) {
    console.error("[AuthEnterprise] Error resolving IdP by email:", err);
    return null;
  }
}

export async function resolveIdentityProviderByOrgId(orgId: Types.ObjectId | string) {
  if (env.ENABLE_ENTERPRISE_SSO !== "true") {
    return null;
  }

  try {
    const org = await OrganizationModel.findOne({
      _id: orgId,
      "identityProvider.enabled": true,
      isActive: true
    });

    if (!org || !org.identityProvider) {
      return null;
    }

    return {
      orgId: org._id,
      org,
      idp: org.identityProvider
    };
  } catch (err) {
    console.error("[AuthEnterprise] Error resolving IdP by org ID:", err);
    return null;
  }
}

export function isSAMLProvider(idp: any): boolean {
  return idp?.type === "SAML";
}

export function isOIDCProvider(idp: any): boolean {
  return idp?.type === "OIDC";
}

export function isSSOConfigured(): boolean {
  return env.ENABLE_ENTERPRISE_SSO === "true";
}
