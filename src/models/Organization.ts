import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const ORG_TIERS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;
export type OrgTier = (typeof ORG_TIERS)[number];

export const IdP_TYPES = ["SAML", "OIDC"] as const;
export type IdPType = (typeof IdP_TYPES)[number];

export interface SAMLConfig {
  entryPoint: string;
  cert: string;
  issuer: string;
  identifierFormat?: string;
  wantAssertionsSigned?: boolean;
  logoutUrl?: string;
}

export interface OIDCConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
}

export interface IdentityProvider {
  type: IdPType;
  enabled: boolean;
  emailDomain?: string;
  config: SAMLConfig | OIDCConfig;
  ssoDefaultRole?: "OWNER" | "ADMIN" | "EVENT_MANAGER" | "VIEWER";
  groupRoleMapping?: Record<string, string>;
  autoProvisioningEnabled?: boolean;
  scimBearerTokenHash?: string;
  scimTokenCreatedAt?: Date;
}

export interface Organization {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  tier: OrgTier;
  customDomain?: string;
  ownerId: Types.ObjectId;
  isActive: boolean;
  identityProvider?: IdentityProvider;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationModel extends Model<Organization> {}

const organizationSchema = new Schema<Organization, OrganizationModel>(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name must be at most 100 characters"]
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Invalid slug format"]
    },
    tier: {
      type: String,
      enum: {
        values: ORG_TIERS,
        message: "Tier must be STARTER, PROFESSIONAL, or ENTERPRISE"
      },
      default: "STARTER"
    },
    customDomain: {
      type: String,
      sparse: true,
      lowercase: true,
      match: [/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "Invalid domain format"]
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner is required"],
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    identityProvider: {
      type: {
        type: String,
        enum: IdP_TYPES,
        sparse: true
      },
      enabled: {
        type: Boolean,
        default: false
      },
      emailDomain: {
        type: String,
        sparse: true,
        lowercase: true,
        index: true
      },
      config: Schema.Types.Mixed,
      ssoDefaultRole: {
        type: String,
        enum: ["OWNER", "ADMIN", "EVENT_MANAGER", "VIEWER"],
        default: "VIEWER"
      },
      groupRoleMapping: Schema.Types.Mixed,
      autoProvisioningEnabled: {
        type: Boolean,
        default: false
      },
      scimBearerTokenHash: {
        type: String,
        sparse: true
      },
      scimTokenCreatedAt: {
        type: Date,
        sparse: true
      }
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

organizationSchema.index({ ownerId: 1, createdAt: -1 });
organizationSchema.index({ "identityProvider.emailDomain": 1, "identityProvider.enabled": 1 });

export const OrganizationModel: OrganizationModel =
  models.Organization || model<Organization, OrganizationModel>("Organization", organizationSchema);
