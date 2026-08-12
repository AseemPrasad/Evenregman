import "server-only";

import { connectToDatabase } from "@/lib/db";
import { OrganizationModel } from "@/models/Organization";
import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";
import { provisionUserFromSCIM, deactivateUserInOrg } from "@/lib/enterprise-provisioning";
import { revokeUserSessions } from "@/lib/session-management";
import { env } from "@/lib/env";
import crypto from "crypto";

interface SCIMListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: any[];
}

interface SCIMError {
  schemas: string[];
  detail: string;
  status: number;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function authenticateSCIM(authHeader: string | null): Promise<any> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const tokenHash = hashToken(token);

    const org = await OrganizationModel.findOne({
      "identityProvider.scimBearerTokenHash": tokenHash,
      "identityProvider.enabled": true,
      isActive: true
    });

    return org || null;
  } catch (err) {
    console.error("[SCIM] Auth error:", err);
    return null;
  }
}

function toSCIMUser(user: any, membership: any) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user._id.toString(),
    userName: user.email,
    name: {
      givenName: user.name?.split(" ")[0] || "",
      familyName: user.name?.split(" ").slice(1).join(" ") || ""
    },
    emails: [{ value: user.email, type: "work", primary: true }],
    active: membership?.isActive || false,
    meta: {
      resourceType: "User",
      created: user.createdAt?.toISOString(),
      lastModified: user.updatedAt?.toISOString()
    }
  };
}

function scimError(status: number, detail: string): SCIMError {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail,
    status
  };
}

export async function GET(req: Request, { params }: any) {
  const authHeader = req.headers.get("authorization");
  const org = await authenticateSCIM(authHeader);

  if (!org) {
    return new Response(JSON.stringify(scimError(401, "Unauthorized")), {
      status: 401,
      headers: { "Content-Type": "application/scim+json" }
    });
  }

  await connectToDatabase();

  try {
    const url = new URL(req.url);
    const pathParts = (params.scim || []) as string[];
    const resource = pathParts[0];
    const resourceId = pathParts[1];

    if (resource === "Users" && resourceId === "undefined") {
      const startIndex = parseInt(url.searchParams.get("startIndex") || "1");
      const count = parseInt(url.searchParams.get("count") || "20");

      const memberships = await MembershipModel.find({ orgId: org._id })
        .skip((startIndex - 1))
        .limit(count);

      const userIds = memberships.map((m) => m.userId);
      const users = await UserModel.find({ _id: { $in: userIds } });

      const resources = memberships.map((m) => {
        const user = users.find((u) => u._id.equals(m.userId));
        return toSCIMUser(user, m);
      });

      const response: SCIMListResponse = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: await MembershipModel.countDocuments({ orgId: org._id }),
        startIndex,
        itemsPerPage: count,
        Resources: resources
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    if (resource === "Users" && resourceId) {
      const user = await UserModel.findById(resourceId);
      if (!user) {
        return new Response(JSON.stringify(scimError(404, "User not found")), {
          status: 404,
          headers: { "Content-Type": "application/scim+json" }
        });
      }

      const membership = await MembershipModel.findOne({ userId: user._id, orgId: org._id });
      return new Response(JSON.stringify(toSCIMUser(user, membership)), {
        status: 200,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    if (resource === "ServiceProviderConfig") {
      return new Response(
        JSON.stringify({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
          documentationUri: "https://example.com/scim",
          authenticationSchemes: [
            {
              name: "Bearer",
              description: "Authentication via bearer token",
              specUri: "https://tools.ietf.org/html/rfc6750",
              type: "oauth2",
              primary: true
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/scim+json" } }
      );
    }

    return new Response(JSON.stringify(scimError(404, "Not found")), {
      status: 404,
      headers: { "Content-Type": "application/scim+json" }
    });
  } catch (err) {
    console.error("[SCIM] GET error:", err);
    return new Response(JSON.stringify(scimError(500, "Internal server error")), {
      status: 500,
      headers: { "Content-Type": "application/scim+json" }
    });
  }
}

export async function POST(req: Request, { params }: any) {
  const authHeader = req.headers.get("authorization");
  const org = await authenticateSCIM(authHeader);

  if (!org) {
    return new Response(JSON.stringify(scimError(401, "Unauthorized")), {
      status: 401,
      headers: { "Content-Type": "application/scim+json" }
    });
  }

  await connectToDatabase();

  try {
    const body = await req.json();
    const pathParts = (params.scim || []) as string[];
    const resource = pathParts[0];

    if (resource === "Users") {
      const { user, membership } = await provisionUserFromSCIM(body, org._id);
      return new Response(JSON.stringify(toSCIMUser(user, membership)), {
        status: 201,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    return new Response(JSON.stringify(scimError(400, "Bad request")), {
      status: 400,
      headers: { "Content-Type": "application/scim+json" }
    });
  } catch (err) {
    console.error("[SCIM] POST error:", err);
    return new Response(JSON.stringify(scimError(500, "Internal server error")), {
      status: 500,
      headers: { "Content-Type": "application/scim+json" }
    });
  }
}

export async function PATCH(req: Request, { params }: any) {
  const authHeader = req.headers.get("authorization");
  const org = await authenticateSCIM(authHeader);

  if (!org) {
    return new Response(JSON.stringify(scimError(401, "Unauthorized")), {
      status: 401,
      headers: { "Content-Type": "application/scim+json" }
    });
  }

  await connectToDatabase();

  try {
    const body = await req.json();
    const pathParts = (params.scim || []) as string[];
    const resourceId = pathParts[1];

    if (!resourceId) {
      return new Response(JSON.stringify(scimError(400, "Missing resource ID")), {
        status: 400,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    const user = await UserModel.findById(resourceId);
    if (!user) {
      return new Response(JSON.stringify(scimError(404, "User not found")), {
        status: 404,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    const membership = await MembershipModel.findOne({ userId: user._id, orgId: org._id });
    if (!membership) {
      return new Response(JSON.stringify(scimError(404, "User not in organization")), {
        status: 404,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    const operations = body.Operations || [];
    for (const op of operations) {
      if (op.op === "replace" && op.path === "active") {
        const active = op.value;
        if (active === false) {
          await deactivateUserInOrg(user._id, org._id);
          await revokeUserSessions(user._id, org._id);
        }
      }
    }

    return new Response(JSON.stringify(toSCIMUser(user, membership)), {
      status: 200,
      headers: { "Content-Type": "application/scim+json" }
    });
  } catch (err) {
    console.error("[SCIM] PATCH error:", err);
    return new Response(JSON.stringify(scimError(500, "Internal server error")), {
      status: 500,
      headers: { "Content-Type": "application/scim+json" }
    });
  }
}

export async function DELETE(req: Request, { params }: any) {
  const authHeader = req.headers.get("authorization");
  const org = await authenticateSCIM(authHeader);

  if (!org) {
    return new Response(JSON.stringify(scimError(401, "Unauthorized")), {
      status: 401,
      headers: { "Content-Type": "application/scim+json" }
    });
  }

  await connectToDatabase();

  try {
    const pathParts = (params.scim || []) as string[];
    const resourceId = pathParts[1];

    if (!resourceId) {
      return new Response(JSON.stringify(scimError(400, "Missing resource ID")), {
        status: 400,
        headers: { "Content-Type": "application/scim+json" }
      });
    }

    await deactivateUserInOrg(resourceId, org._id);
    await revokeUserSessions(resourceId, org._id);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[SCIM] DELETE error:", err);
    return new Response(JSON.stringify(scimError(500, "Internal server error")), {
      status: 500,
      headers: { "Content-Type": "application/scim+json" }
    });
  }
}
