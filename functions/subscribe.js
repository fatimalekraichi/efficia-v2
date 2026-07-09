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

  const email = normalizeText(payload.email).toLowerCase();
  const firstName = normalizeText(payload.firstName);
  const company = normalizeText(payload.company);
  const googleBusiness = normalizeText(payload.googleBusiness);
  const city = normalizeText(payload.city);
  const industry = normalizeText(payload.industry);
  const goal = normalizeText(payload.goal);
  const comments = normalizeText(payload.message);
  const website = normalizeText(payload.website);
  const phone = normalizeText(payload.phone);
  const problems = Array.isArray(payload.problems) ? payload.problems.join(", ") : "";

  if (!isValidEmail(email) || !firstName || !company || !googleBusiness || !city || !industry || !goal) {
    return jsonResponse({ error: "Missing required fields." }, 400);
  }

  const mailerLitePayload = {
    email,
    fields: {
      name: firstName,
      prenom: firstName,
      entreprise: company,
      google_business_url: googleBusiness,
      ville: city,
      secteur: industry,
      objectif: goal,
      commentaires: comments,
      site_internet: website,
      telephone: phone,
      problemes: problems,
      source: "score-efficia-modal",
    },
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
    return jsonResponse({ error: "MailerLite request failed.", details: errorText }, 502);
  }

  return jsonResponse({ ok: true });
}
