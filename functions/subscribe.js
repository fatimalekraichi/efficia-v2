import {
  normalizeDiagnosticSubmission,
  updateDiagnosticMailerLiteStatus,
} from "./lib/diagnosticRequests.js";
import {
  resolveMailerLiteGroupId,
  resolvePublicSite,
} from "./lib/environmentIsolation.js";

const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const ERROR_MESSAGE = "Une erreur est survenue. Merci de réessayer dans quelques instants.";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
});

const cleanText = (value, maxLength) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const sendToMailerLite = (apiKey, payload) => fetch(MAILERLITE_ENDPOINT, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  body: JSON.stringify(payload),
});

async function createDiagnosticAnalysis(context, submission) {
  const connectorToken = cleanText(context.env.CONNECTOR_TOKEN, 500);
  if (!connectorToken || !context.env.ORDERS_DB) {
    return { ok: false, status: 500 };
  }

  const origin = new URL(context.request.url).origin;
  const response = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${connectorToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      nom: submission.googleBusinessUrl ? "" : submission.companyName,
      ville: submission.googleBusinessUrl ? "" : submission.city,
      activite: "",
      googleBusinessUrl: submission.googleBusinessUrl,
      diagnosticRequest: {
        requestId: crypto.randomUUID(),
        idempotencyKey: submission.idempotencyKey,
        firstName: submission.firstName,
        email: submission.email,
        companyName: submission.companyName,
        city: submission.city,
        googleBusinessUrl: submission.googleBusinessUrl,
      },
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.analysisId || data.status !== "awaiting_review") {
    return { ok: false, status: response.status || 502, phase: "analysis_request" };
  }

  const benchmarkResponse = await fetch(`${origin}/api/benchmark`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${connectorToken}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ analysisId: data.analysisId }),
  });
  if (!benchmarkResponse.ok) {
    return { ok: false, status: benchmarkResponse.status || 502, phase: "benchmark_request" };
  }
  return {
    ok: true,
    analysisId: data.analysisId,
    status: data.status,
    idempotent: Boolean(data.idempotent),
    mailerLiteStatus: data.mailerLiteStatus || "pending",
  };
}

async function safelyUpdateMailerLiteStatus(db, analysisId, status) {
  try {
    await updateDiagnosticMailerLiteStatus(db, analysisId, status);
  } catch {
    console.error("Diagnostic request: MailerLite status update failed.");
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const step = cleanText(payload.step, 40);
  if (!["lead_capture", "diagnostic_request"].includes(step)) {
    return jsonResponse({ success: false, error: "Invalid submission step." }, 400);
  }

  let submission;
  if (step === "diagnostic_request") {
    const normalized = normalizeDiagnosticSubmission(payload);
    if (!normalized.ok) {
      return jsonResponse({ success: false, error: "Invalid diagnostic request." }, 400);
    }
    submission = normalized.data;
  } else {
    const email = cleanText(payload.email, 254).toLowerCase();
    const firstName = cleanText(payload.first_name || payload.firstName, 100);
    if (!isValidEmail(email) || !firstName) {
      return jsonResponse({ success: false, error: "Missing required fields." }, 400);
    }
    submission = { email, firstName, companyName: "", city: "", googleBusinessUrl: "" };
  }

  const site = resolvePublicSite(context.request, context.env);
  if (!site.ok) {
    console.error("Diagnostic site configuration rejected.", { error: site.error });
    return jsonResponse({ success: false, error: site.error }, site.status);
  }

  const mailerLiteGroup = resolveMailerLiteGroupId(context.env, site.environment, {
    purpose: "diagnostic",
  });
  if (!mailerLiteGroup.ok && step === "lead_capture") {
    console.error("Diagnostic MailerLite group configuration rejected.", {
      error: mailerLiteGroup.error,
      variable: mailerLiteGroup.variable || null,
      conflicting_variable: mailerLiteGroup.conflictingVariable || null,
    });
    return jsonResponse({
      success: false,
      error: mailerLiteGroup.error,
      variable: mailerLiteGroup.variable || null,
    }, 500);
  }

  let diagnostic = null;
  if (step === "diagnostic_request") {
    try {
      diagnostic = await createDiagnosticAnalysis(context, submission);
    } catch (error) {
      diagnostic = {
        ok: false,
        status: 502,
        phase: typeof error?.phase === "string" ? error.phase : "internal_request",
      };
    }
    if (!diagnostic.ok) {
      console.error("Diagnostic request failed.", {
        phase: diagnostic.phase || "analysis_request",
      });
      return jsonResponse({ success: false, error: ERROR_MESSAGE }, 502);
    }
    if (diagnostic.idempotent && diagnostic.mailerLiteStatus === "synced") {
      return jsonResponse({
        success: true,
        analysisId: diagnostic.analysisId,
        status: diagnostic.status,
      });
    }
    if (!mailerLiteGroup.ok) {
      console.error("Diagnostic MailerLite group configuration rejected after D1 persistence.", {
        error: mailerLiteGroup.error,
        variable: mailerLiteGroup.variable || null,
        conflicting_variable: mailerLiteGroup.conflictingVariable || null,
      });
      await safelyUpdateMailerLiteStatus(context.env.ORDERS_DB, diagnostic.analysisId, "failed");
      return jsonResponse({
        success: true,
        analysisId: diagnostic.analysisId,
        status: diagnostic.status,
        warning: mailerLiteGroup.error,
      });
    }
  }

  const apiKey = context.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    if (diagnostic) {
      await safelyUpdateMailerLiteStatus(context.env.ORDERS_DB, diagnostic.analysisId, "failed");
      return jsonResponse({
        success: true,
        analysisId: diagnostic.analysisId,
        status: diagnostic.status,
        warning: "Marketing synchronization unavailable.",
      });
    }
    console.error("MailerLite API key is not configured.");
    return jsonResponse({ success: false, error: ERROR_MESSAGE }, 500);
  }

  const source = cleanText(payload.source, 120) || "Score Efficia gratuit";
  const auditStatus = cleanText(payload.audit_status, 120)
    || (step === "diagnostic_request" ? "diagnostic demandé" : "lead capturé");
  const fields = {
    name: submission.firstName,
    source,
    audit_status: auditStatus,
  };
  if (step === "diagnostic_request") {
    fields.company = submission.companyName;
    fields.google_business_url = submission.googleBusinessUrl;
    fields.city = submission.city;
  }

  const mailerLitePayload = {
    email: submission.email,
    status: "active",
    resubscribe: true,
    fields,
    groups: [mailerLiteGroup.groupId],
  };

  let response;
  try {
    response = await sendToMailerLite(apiKey, mailerLitePayload);
  } catch {
    response = null;
  }

  if (!response?.ok) {
    console.error("MailerLite request failed", { status: response?.status || null });
    const fallbackPayload = {
      email: submission.email,
      status: "active",
      resubscribe: true,
      fields: { name: submission.firstName },
      groups: [mailerLiteGroup.groupId],
    };
    let fallbackResponse;
    try {
      fallbackResponse = await sendToMailerLite(apiKey, fallbackPayload);
    } catch {
      fallbackResponse = null;
    }

    if (!fallbackResponse?.ok) {
      console.error("MailerLite fallback request failed", { status: fallbackResponse?.status || null });
      if (diagnostic) {
        await safelyUpdateMailerLiteStatus(context.env.ORDERS_DB, diagnostic.analysisId, "failed");
        return jsonResponse({
          success: true,
          analysisId: diagnostic.analysisId,
          status: diagnostic.status,
          warning: "Marketing synchronization unavailable.",
        });
      }
      return jsonResponse({ success: false, error: "MailerLite request failed." }, 502);
    }
  }

  if (diagnostic) {
    await safelyUpdateMailerLiteStatus(context.env.ORDERS_DB, diagnostic.analysisId, "synced");
    return jsonResponse({
      success: true,
      analysisId: diagnostic.analysisId,
      status: diagnostic.status,
    });
  }

  return jsonResponse({ success: true });
}
