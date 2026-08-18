const PRODUCTION_ORIGIN = "https://efficiadigital.com";
const PREVIEW_HOST = "efficiadigital.pages.dev";

const MAILERLITE_GROUP_VARIABLES = {
  production: {
    diagnostic: "MAILERLITE_PRODUCTION_DIAGNOSTIC_GROUP_ID",
    audit: {
      prospect: "MAILERLITE_PRODUCTION_AUDIT_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PRODUCTION_AUDIT_CLIENT_GROUP_ID",
    },
    visibility: {
      prospect: "MAILERLITE_PRODUCTION_VISIBILITY_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PRODUCTION_VISIBILITY_CLIENT_GROUP_ID",
    },
    performance: {
      prospect: "MAILERLITE_PRODUCTION_PERFORMANCE_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PRODUCTION_PERFORMANCE_CLIENT_GROUP_ID",
    },
  },
  preview: {
    diagnostic: "MAILERLITE_PREVIEW_DIAGNOSTIC_GROUP_ID",
    audit: {
      prospect: "MAILERLITE_PREVIEW_AUDIT_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PREVIEW_AUDIT_CLIENT_GROUP_ID",
    },
    visibility: {
      prospect: "MAILERLITE_PREVIEW_VISIBILITY_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PREVIEW_VISIBILITY_CLIENT_GROUP_ID",
    },
    performance: {
      prospect: "MAILERLITE_PREVIEW_PERFORMANCE_PROSPECT_GROUP_ID",
      client: "MAILERLITE_PREVIEW_PERFORMANCE_CLIENT_GROUP_ID",
    },
  },
};

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function environmentForOrigin(origin) {
  if (origin === PRODUCTION_ORIGIN) return "production";
  const hostname = new URL(origin).hostname.toLowerCase();
  if (hostname === PREVIEW_HOST || hostname.endsWith(`.${PREVIEW_HOST}`)) return "preview";
  return "";
}

export function resolvePublicSite(request, env = {}) {
  const configured = clean(env.SITE_URL).replace(/\/$/, "");
  if (!configured) {
    return { ok: false, status: 500, error: "SITE_URL_NOT_CONFIGURED" };
  }

  let configuredUrl;
  let requestUrl;
  try {
    configuredUrl = new URL(configured);
    requestUrl = new URL(request.url);
  } catch {
    return { ok: false, status: 500, error: "SITE_URL_INVALID" };
  }

  const configuredIsOriginOnly = configuredUrl.origin === configured
    && configuredUrl.protocol === "https:"
    && !configuredUrl.username
    && !configuredUrl.password
    && configuredUrl.pathname === "/"
    && !configuredUrl.search
    && !configuredUrl.hash;
  if (!configuredIsOriginOnly) {
    return { ok: false, status: 500, error: "SITE_URL_INVALID" };
  }

  const environment = environmentForOrigin(configuredUrl.origin);
  if (!environment) {
    return { ok: false, status: 500, error: "SITE_URL_NOT_ALLOWED" };
  }

  if (requestUrl.protocol !== "https:" || requestUrl.origin !== configuredUrl.origin) {
    return { ok: false, status: 403, error: "SITE_ORIGIN_MISMATCH" };
  }

  return {
    ok: true,
    environment,
    origin: configuredUrl.origin,
    successUrl: `${configuredUrl.origin}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${configuredUrl.origin}/#offres`,
  };
}

function groupVariable(environment, { purpose, productCode, role }) {
  const scoped = MAILERLITE_GROUP_VARIABLES[environment];
  if (!scoped) return "";
  if (purpose === "diagnostic") return scoped.diagnostic;
  return scoped[productCode]?.[role] || "";
}

export function resolveMailerLiteGroupId(env = {}, environment, selector) {
  const variable = groupVariable(environment, selector);
  if (!variable) {
    return { ok: false, error: "MAILERLITE_GROUP_MAPPING_INVALID" };
  }

  const groupId = clean(env[variable]);
  if (!groupId) {
    return { ok: false, error: "MAILERLITE_GROUP_NOT_CONFIGURED", variable };
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(groupId)) {
    return { ok: false, error: "MAILERLITE_GROUP_INVALID", variable };
  }

  const otherEnvironment = environment === "preview" ? "production" : "preview";
  const otherVariable = groupVariable(otherEnvironment, selector);
  if (otherVariable && clean(env[otherVariable]) === groupId) {
    return {
      ok: false,
      error: "MAILERLITE_GROUP_ENVIRONMENT_COLLISION",
      variable,
      conflictingVariable: otherVariable,
    };
  }

  return { ok: true, groupId, variable };
}

export const __test__ = {
  MAILERLITE_GROUP_VARIABLES,
  PREVIEW_HOST,
  PRODUCTION_ORIGIN,
};
