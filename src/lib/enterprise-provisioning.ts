import "server-only";

import { UserModel } from "@/models/User";
import { MembershipModel } from "@/models/Membership";
import { OrganizationModel } from "@/models/Organization";
import type { Types } from "mongoose";

export interface SAMLAssertion {
  nameID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
  [key: string]: any;
}

export interface SCIMUser {
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{ value: string; type?: string }>;
  groups?: string[];
  active?: boolean;
  phoneNumber?: string;
}

export async function provisionUserFromAssertion(
  assertion: SAMLAssertion,
  orgId: Types.ObjectId | string
): Promise<any> {
  try {
    const email = assertion.email || assertion.nameID;
    if (!email) {
      throw new Error("No email in assertion");
    }

    let user = await UserModel.findOne({ email });

    if (!user) {
      user = await UserModel.create({
        name: `${assertion.firstName || ""} ${assertion.lastName || ""}`.trim() || email,
        email,
        role: "HOST",
        provisionedVia: "SAML"
      });
    } else {
      await UserModel.updateOne(
        { _id: user._id },
        {
          name: `${assertion.firstName || ""} ${assertion.lastName || ""}`.trim() || user.name,
          updatedAt: new Date()
        }
      );
    }

    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      throw new Error("Organization not found");
    }

    let membership = await MembershipModel.findOne({ userId: user._id, orgId });

    if (!membership) {
      const roleFromGroups = org.identityProvider?.groupRoleMapping
        ? Object.entries(org.identityProvider.groupRoleMapping).find(([group]) =>
            assertion.groups?.includes(group)
          )?.[1]
        : null;

      const role = (roleFromGroups as any) || org.identityProvider?.ssoDefaultRole || "VIEWER";

      membership = await MembershipModel.create({
        userId: user._id,
        orgId,
        role,
        isActive: true,
        joinedAt: new Date()
      });
    }

    return { user, membership };
  } catch (err) {
    console.error("[Provisioning] Error provisioning user from assertion:", err);
    throw err;
  }
}

export async function provisionUserFromSCIM(
  scimUser: SCIMUser,
  orgId: Types.ObjectId | string
): Promise<any> {
  try {
    const email = scimUser.emails?.[0]?.value || scimUser.userName;
    if (!email) {
      throw new Error("No email in SCIM user");
    }

    let user = await UserModel.findOne({ email });

    if (!user) {
      user = await UserModel.create({
        name: scimUser.name
          ? `${scimUser.name.givenName || ""} ${scimUser.name.familyName || ""}`.trim()
          : email,
        email,
        role: "HOST",
        provisionedVia: "SCIM"
      });
    } else {
      await UserModel.updateOne(
        { _id: user._id },
        {
          name: scimUser.name
            ? `${scimUser.name.givenName || ""} ${scimUser.name.familyName || ""}`.trim()
            : user.name,
          updatedAt: new Date()
        }
      );
    }

    const org = await OrganizationModel.findById(orgId);
    if (!org) {
      throw new Error("Organization not found");
    }

    let membership = await MembershipModel.findOne({ userId: user._id, orgId });

    if (!membership) {
      const roleFromGroups = org.identityProvider?.groupRoleMapping
        ? Object.entries(org.identityProvider.groupRoleMapping).find(([group]) =>
            scimUser.groups?.includes(group)
          )?.[1]
        : null;

      const role = (roleFromGroups as any) || org.identityProvider?.ssoDefaultRole || "VIEWER";

      membership = await MembershipModel.create({
        userId: user._id,
        orgId,
        role,
        isActive: scimUser.active !== false,
        joinedAt: new Date()
      });
    }

    return { user, membership };
  } catch (err) {
    console.error("[Provisioning] Error provisioning user from SCIM:", err);
    throw err;
  }
}

export async function updateUserFromAssertion(
  userId: Types.ObjectId | string,
  assertion: SAMLAssertion
): Promise<void> {
  try {
    await UserModel.updateOne(
      { _id: userId },
      {
        name: `${assertion.firstName || ""} ${assertion.lastName || ""}`.trim(),
        updatedAt: new Date()
      }
    );
  } catch (err) {
    console.error("[Provisioning] Error updating user from assertion:", err);
  }
}

export async function deactivateUserInOrg(
  userId: Types.ObjectId | string,
  orgId: Types.ObjectId | string
): Promise<void> {
  try {
    await MembershipModel.updateOne({ userId, orgId }, { isActive: false });
  } catch (err) {
    console.error("[Provisioning] Error deactivating user:", err);
  }
}
