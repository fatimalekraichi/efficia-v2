const MAILERLITE_GROUP_ID = "192513600183600154";
const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const ERROR_MESSAGE = "Une erreur est survenue. Merci de réessayer dans quelques instants.";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

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
  const { request } = context;
  const apiKey = context.env.MAILERLITE_API_KEY;

  if (!apiKey) {
    console.error("MailerLite API key is not configured.");
    return jsonResponse({ success: false, error: ERROR_MESSAGE }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const step = normalizeText(payload.step);
  const email = normalizeText(payload.email).toLowerCase();
  const firstName = normalizeText(payload.first_name || payload.firstName);
  const companyName = normalizeText(payload.company_name || payload.company);
  const googleBusinessUrl = normalizeText(payload.google_business_url || payload.googleBusiness);
  const businessLocation = normalizeText(payload.business_location || payload.city);
  const source = normalizeText(payload.source) || "Score Efficia gratuit";
  const auditStatus = normalizeText(payload.audit_status)
    || (step === "diagnostic_request" ? "diagnostic demandé" : "lead capturé");
  const hasBusinessLookup = Boolean(googleBusinessUrl || (companyName && businessLocation));

  if (!["lead_capture", "diagnostic_request"].includes(step)) {
    return jsonResponse({ success: false, error: "Invalid submission step." }, 400);
  }

  if (!isValidEmail(email) || !firstName) {
    return jsonResponse({ success: false, error: "Missing required fields." }, 400);
  }

  if (step === "diagnostic_request" && !hasBusinessLookup) {
    return jsonResponse({ success: false, error: "Missing required fields." }, 400);
  }

  const fields = {
    name: firstName,
    source,
    audit_status: auditStatus,
  };

  if (step === "diagnostic_request") {
    fields.company = companyName;
    fields.google_business_url = googleBusinessUrl;
    fields.city = businessLocation;
  }

  const mailerLitePayload = {
    email,
    status: "active",
    resubscribe: true,
    fields,
    groups: [MAILERLITE_GROUP_ID],
  };

  const response = await sendToMailerLite(apiKey, mailerLitePayload);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MailerLite request failed", response.status, errorText);

    const fallbackPayload = {
      email,
      status: "active",
      resubscribe: true,
      fields: {
        name: firstName,
      },
      groups: [MAILERLITE_GROUP_ID],
    };
    const fallbackResponse = await sendToMailerLite(apiKey, fallbackPayload);

    if (!fallbackResponse.ok) {
      const fallbackErrorText = await fallbackResponse.text();
      console.error("MailerLite fallback request failed", fallbackResponse.status, fallbackErrorText);
      return jsonResponse({
        success: false,
        error: "MailerLite request failed.",
        status: fallbackResponse.status,
        details: fallbackErrorText,
      }, 502);
    }

    return jsonResponse({
      success: true,
      group_id: MAILERLITE_GROUP_ID,
      warning: "MailerLite custom fields were rejected. Subscriber was saved with standard fields only.",
      details: errorText,
    });
  }

  let mailerLiteData = null;
  try {
    mailerLiteData = await response.json();
  } catch {
    mailerLiteData = null;
  }

  return jsonResponse({
    success: true,
    group_id: MAILERLITE_GROUP_ID,
    subscriber_id: mailerLiteData?.data?.id || null,
    subscriber_status: mailerLiteData?.data?.status || null,
  });
}
