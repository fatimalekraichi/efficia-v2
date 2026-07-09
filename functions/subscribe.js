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

const goalLabels = {
  calls: "Recevoir plus d'appels",
  clients: "Attirer plus de clients",
  reviews: "Obtenir plus d'avis",
  visibility: "Améliorer ma visibilité",
  unsure: "Je ne sais pas encore",
};

const problemLabels = {
  visibility: "Je manque de visibilité",
  reviews: "Je reçois peu d'avis",
  incomplete: "Ma fiche est incomplète",
  competition: "Mes concurrents apparaissent avant moi",
  unknown: "Je ne sais pas",
};

const mapChoice = (value, labels) => labels[value] || value;

const mapChoices = (values, labels) => (
  Array.isArray(values)
    ? values.map((value) => mapChoice(normalizeText(value), labels)).filter(Boolean).join(", ")
    : mapChoice(normalizeText(values), labels)
);

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
  const firstName = normalizeText(payload.first_name || payload.firstName);
  const companyName = normalizeText(payload.company_name || payload.company);
  const googleBusinessUrl = normalizeText(payload.google_business_url || payload.googleBusiness);
  const city = normalizeText(payload.city);
  const website = normalizeText(payload.website);
  const phone = normalizeText(payload.phone);
  const businessSector = normalizeText(payload.business_sector || payload.industry);
  const mainGoal = mapChoice(normalizeText(payload.main_goal || payload.goal), goalLabels);
  const additionalNotes = normalizeText(payload.additional_notes || payload.message);
  const mainProblems = mapChoices(payload.main_problems || payload.problems, problemLabels);
  const submittedAt = normalizeText(payload.submittedAt || payload.submitted_at) || new Date().toISOString();

  if (!isValidEmail(email) || !firstName || !companyName || !city || !businessSector || !mainGoal) {
    return jsonResponse({ ok: false, error: "Missing required fields." }, 400);
  }

  const mailerLitePayload = {
    email,
    fields: {
      name: firstName,
      first_name: firstName,
      company_name: companyName,
      google_business_url: googleBusinessUrl,
      city,
      website,
      phone,
      business_sector: businessSector,
      main_goal: mainGoal,
      main_problems: mainProblems,
      additional_notes: additionalNotes,
      prenom: firstName,
      entreprise: companyName,
      ville: city,
      secteur: businessSector,
      objectif: mainGoal,
      commentaires: additionalNotes,
      site_internet: website,
      telephone: phone,
      problemes: mainProblems,
      submitted_at: submittedAt,
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
    console.error("MailerLite request failed", response.status, errorText);
    return jsonResponse({ ok: false, error: "MailerLite request failed." }, 502);
  }

  return jsonResponse({ ok: true, group_id: MAILERLITE_GROUP_ID });
}
