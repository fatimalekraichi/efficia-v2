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
  const createdAt = normalizeText(payload.created_at || payload.createdAt) || new Date().toISOString();
  const leadStatus = normalizeText(payload.lead_status)
    || (step === "diagnostic_request" ? "diagnostic demandé" : "étape 1 complétée");
  const submittedAt = normalizeText(payload.submitted_at || payload.submittedAt);
  const completedStepTwo = payload.completed_step_2 === true || payload.completed_step_2 === "true";
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
    lead_status: leadStatus,
  };

  if (companyName) {
    fields.company_name = companyName;
  }

  if (googleBusinessUrl) {
    fields.google_business_url = googleBusinessUrl;
  }

  if (businessLocation) {
    fields.city = businessLocation;
  }

  if (step === "diagnostic_request") {
    fields.completed_step_2 = completedStepTwo;
    fields.submitted_at = submittedAt || new Date().toISOString();
  }

  const mailerLitePayload = {
    email,
    fields,
    groups: [MAILERLITE_GROUP_ID],
  };

  const response = await sendToMailerLite(apiKey, mailerLitePayload);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MailerLite request failed", response.status, errorText);

    const fallbackPayload = {
      email,
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

  return jsonResponse({ success: true, group_id: MAILERLITE_GROUP_ID });
}
