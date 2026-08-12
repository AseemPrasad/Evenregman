import "server-only";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { OrganizationModel } from "@/models/Organization";
import { getUserMembership, canUserAccessOrg } from "@/lib/permissions";
import crypto from "crypto";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateSCIMToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { orgId } = await params;

  try {
    await connectToDatabase();

    const canAccess = await canUserAccessOrg(session.user.id, orgId);
    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    const idp = org.identityProvider;
    if (!idp) {
      return new Response(
        JSON.stringify({
          message: "No identity provider configured"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({
        type: idp.type,
        enabled: idp.enabled,
        emailDomain: idp.emailDomain,
        ssoDefaultRole: idp.ssoDefaultRole,
        autoProvisioningEnabled: idp.autoProvisioningEnabled,
        scimTokenCreatedAt: idp.scimTokenCreatedAt,
        groupRoleMapping: idp.groupRoleMapping || {}
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Failed to fetch IdP config" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { orgId } = await params;

  try {
    await connectToDatabase();

    const membership = await getUserMembership(session.user.id, orgId);
    if (!membership || membership.role !== "OWNER") {
      return new Response(JSON.stringify({ error: "Forbidden: Only org owner can configure SSO" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();

    const org = await OrganizationModel.findByIdAndUpdate(
      orgId,
      {
        "identityProvider.type": body.type,
        "identityProvider.enabled": body.enabled || false,
        "identityProvider.emailDomain": body.emailDomain,
        "identityProvider.config": body.config,
        "identityProvider.ssoDefaultRole": body.ssoDefaultRole || "VIEWER",
        "identityProvider.groupRoleMapping": body.groupRoleMapping || {},
        "identityProvider.autoProvisioningEnabled": body.autoProvisioningEnabled || false
      },
      { new: true }
    );

    return new Response(
      JSON.stringify({
        message: "IdP configuration updated",
        idp: org?.identityProvider
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Failed to update IdP config" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { orgId } = await params;

  try {
    await connectToDatabase();

    const membership = await getUserMembership(session.user.id, orgId);
    if (!membership || membership.role !== "OWNER") {
      return new Response(JSON.stringify({ error: "Forbidden: Only org owner can disable SSO" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    await OrganizationModel.findByIdAndUpdate(orgId, {
      "identityProvider.enabled": false
    });

    return new Response(JSON.stringify({ message: "IdP disabled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Failed to disable IdP" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { orgId } = await params;

  try {
    await connectToDatabase();

    const membership = await getUserMembership(session.user.id, orgId);
    if (!membership || membership.role !== "OWNER") {
      return new Response(JSON.stringify({ error: "Forbidden: Only org owner can manage SCIM" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();

    if (body.action === "generate-scim-token") {
      const newToken = generateSCIMToken();
      const tokenHash = hashToken(newToken);

      const org = await OrganizationModel.findByIdAndUpdate(
        orgId,
        {
          "identityProvider.scimBearerTokenHash": tokenHash,
          "identityProvider.scimTokenCreatedAt": new Date()
        },
        { new: true }
      );

      return new Response(
        JSON.stringify({
          message: "SCIM token generated",
          scimToken: newToken,
          scimUrl: `/api/scim/v2/Users`,
          note: "Store this token securely. You won't be able to see it again."
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Failed to process request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
