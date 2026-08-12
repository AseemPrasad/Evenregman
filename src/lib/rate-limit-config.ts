import "server-only";

export type IdentifierType = "ip" | "user" | "email" | "composite";

export type RateLimitPolicy = {
  name: string;
  window_ms: number;
  max_requests: number;
  identifier_type: IdentifierType;
  key_prefix: string;
  enabled: boolean;
};

export const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  AUTH_SIGNUP: {
    name: "auth_signup",
    window_ms: 60000,
    max_requests: 5,
    identifier_type: "ip",
    key_prefix: "rate_limit:auth_signup",
    enabled: true
  },

  AUTH_SIGNIN: {
    name: "auth_signin",
    window_ms: 60000,
    max_requests: 10,
    identifier_type: "ip",
    key_prefix: "rate_limit:auth_signin",
    enabled: true
  },

  REGISTRATION: {
    name: "registration",
    window_ms: 60000,
    max_requests: 10,
    identifier_type: "composite",
    key_prefix: "rate_limit:registration",
    enabled: true
  },

  PUBLIC_READ: {
    name: "public_read",
    window_ms: 60000,
    max_requests: 100,
    identifier_type: "ip",
    key_prefix: "rate_limit:public_read",
    enabled: true
  },

  SERVER_ACTION: {
    name: "server_action",
    window_ms: 60000,
    max_requests: 30,
    identifier_type: "user",
    key_prefix: "rate_limit:server_action",
    enabled: true
  }
};

export function getRateLimitPolicy(policyName: string): RateLimitPolicy | null {
  return RATE_LIMIT_POLICIES[policyName] || null;
}
