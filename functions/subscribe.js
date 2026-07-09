const MAILERLITE_GROUP_ID = "192513600183600154";
const MAILERLITE_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.MAILERLITE_API_KEY) {
    return jsonResponse({ error: "MailerLite API key is not configured." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
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
    return jsonResponse({ ok: false, error: "Invalid submission step." }, 400);
  }

  if (!isValidEmail(email) || !firstName) {
    return jsonResponse({ ok: false, error: "Missing required fields." }, 400);
  }

  if (step === "diagnostic_request" && !hasBusinessLookup) {
    return jsonResponse({ ok: false, error: "Missing required fields." }, 400);
  }

  const fields = {
    name: firstName,
    first_name: firstName,
    prenom: firstName,
    created_at: createdAt,
    source,
    lead_status: leadStatus,
  };

  if (companyName) {
    fields.company_name = companyName;
    fields.entreprise = companyName;
  }

  if (googleBusinessUrl) {
    fields.google_business_url = googleBusinessUrl;
  }

  if (businessLocation) {
    fields.business_location = businessLocation;
    fields.city = businessLocation;
    fields.ville = businessLocation;
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

  const response = await fetch(MAILERLITE_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MAILERLITE_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(mailerLitePayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("MailerLite request failed", response.status, errorText);
    return jsonResponse({ ok: false, error: "MailerLite request failed." }, 502);
  }

  return jsonResponse({ ok: true, group_id: MAILERLITE_GROUP_ID });
}
