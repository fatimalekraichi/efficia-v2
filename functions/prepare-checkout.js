const STRIPE_CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const MAILERLITE_GROUPS_ENDPOINT = "https://connect.mailerlite.com/api/groups?limit=100";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const SUCCESS_URL = "https://efficiadigital.com/paiement-reussi?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://efficiadigital.com/#offres";

const PRODUCTS = {
  audit: {
    envKey: "STRIPE_PRICE_AUDIT",
    name: "Audit fiche Google",
    prospectGroupName: "Prospects - Audit fiche Google",
  },
  visibility: {
    envKey: "STRIPE_PRICE_VISIBILITY",
    name: "Pack Visibilité Google",
    prospectGroupName: "Prospects - Pack Visibilité Google",
  },
  performance: {
    envKey: "STRIPE_PRICE_PERFORMANCE",
    name: "Pack Performance",
    prospectGroupName: "Prospects - Pack Performance",
  },
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const splitFullName = (fullName) => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || fullName;
  return {
    firstName,
    lastName: parts.join(" "),
  };
};

const getMailerLiteGroupIdByName = async ({ apiKey, groupName }) => {
  const response = await fetch(MAILERLITE_GROUPS_ENDPOINT, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite groups request failed", response.status, responseText);
    return "";
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("MailerLite groups response was not JSON.", responseText);
    return "";
  }

  const group = data?.data?.find((item) => item?.name === groupName);
  return normalizeText(group?.id);
};

const sendSubscriberToMailerLite = async ({ apiKey, email, groupId, fields }) => {
  const response = await fetch(MAILERLITE_SUBSCRIBERS_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      email,
      status: "active",
      resubscribe: true,
      fields,
      groups: [groupId],
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite subscriber request failed", response.status, responseText);
    return {
      ok: false,
      status: response.status,
      details: responseText,
    };
  }

  return {
    ok: true,
    details: responseText,
  };
};

const saveProspectToMailerLite = async ({ apiKey, product, lead }) => {
  const groupId = await getMailerLiteGroupIdByName({
    apiKey,
    groupName: product.prospectGroupName,
  });

  if (!groupId) {
    return {
      ok: false,
      error: "MailerLite prospect group was not found.",
    };
  }

  const { firstName, lastName } = splitFullName(lead.fullName);
  const safeFields = {
    name: lead.fullName,
    company: lead.companyName,
    source: "Achat offre Efficia Digital",
    audit_status: "prospect avant paiement",
  };

  if (lead.city) safeFields.city = lead.city;
  if (lead.googleBusinessUrl) safeFields.google_business_url = lead.googleBusinessUrl;

  const fullFields = {
    ...safeFields,
    first_name: firstName,
    last_name: lastName,
    prenom: firstName,
    nom: lastName,
    entreprise: lead.companyName,
    offre_choisie: product.name,
    selected_offer: product.name,
  };

  const response = await sendSubscriberToMailerLite({
    apiKey,
    email: lead.email,
    groupId,
    fields: fullFields,
  });

  if (response.ok) {
    return { ok: true, groupId };
  }

  const fallbackResponse = await sendSubscriberToMailerLite({
    apiKey,
    email: lead.email,
    groupId,
    fields: safeFields,
  });

  if (!fallbackResponse.ok) {
    return {
      ok: false,
      error: "MailerLite subscriber request failed.",
      details: fallbackResponse.details,
    };
  }

  return {
    ok: true,
    groupId,
    warning: "Some MailerLite custom fields were rejected. Subscriber was saved with known fields only.",
  };
};

const createStripeCheckoutSession = async ({ apiKey, priceId, productCode, product, lead }) => {
  const formData = new URLSearchParams();
  formData.set("mode", "payment");
  formData.set("line_items[0][price]", priceId);
  formData.set("line_items[0][quantity]", "1");
  formData.set("success_url", SUCCESS_URL);
  formData.set("cancel_url", CANCEL_URL);
  formData.set("billing_address_collection", "required");
  formData.set("customer_email", lead.email);
  formData.set("metadata[product_code]", productCode);
  formData.set("metadata[product_name]", product.name);
  formData.set("metadata[source]", "efficiadigital.com");
  formData.set("metadata[customer_name]", lead.fullName);
  formData.set("metadata[company_name]", lead.companyName);
  if (lead.googleBusinessUrl) formData.set("metadata[google_business_url]", lead.googleBusinessUrl);
  if (lead.city) formData.set("metadata[city]", lead.city);

  const response = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: formData,
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("Stripe Checkout request failed", response.status, responseText);
    return {
      ok: false,
      error: "Stripe Checkout request failed.",
      status: response.status,
    };
  }

  if (!data?.url) {
    console.error("Stripe Checkout did not return a URL.", responseText);
    return {
      ok: false,
      error: "Stripe Checkout URL is missing.",
    };
  }

  return {
    ok: true,
    url: data.url,
  };
};

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
  const stripeSecretKey = context.env.STRIPE_SECRET_KEY;
  const mailerLiteApiKey = context.env.MAILERLITE_API_KEY;

  if (!stripeSecretKey || !mailerLiteApiKey) {
    console.error("Checkout preparation configuration is missing.", {
      hasStripeSecretKey: Boolean(stripeSecretKey),
      hasMailerLiteApiKey: Boolean(mailerLiteApiKey),
    });
    return jsonResponse({ success: false, error: "Checkout configuration is missing." }, 500);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  const productCode = normalizeText(payload.product);
  const product = PRODUCTS[productCode];
  const priceId = product ? normalizeText(context.env[product.envKey]) : "";
  const lead = {
    fullName: normalizeText(payload.full_name),
    email: normalizeText(payload.email).toLowerCase(),
    companyName: normalizeText(payload.company_name),
    googleBusinessUrl: normalizeText(payload.google_business_url),
    city: normalizeText(payload.city),
    unknownGoogleBusiness: Boolean(payload.unknown_google_business),
  };

  if (!product || !priceId) {
    return jsonResponse({ success: false, error: "Invalid product." }, 400);
  }

  if (!lead.fullName || !isValidEmail(lead.email) || !lead.companyName) {
    return jsonResponse({ success: false, error: "Missing required fields." }, 400);
  }

  if (lead.unknownGoogleBusiness) {
    if (!lead.city) {
      return jsonResponse({ success: false, error: "Missing required fields." }, 400);
    }
    lead.googleBusinessUrl = "";
  } else if (!lead.googleBusinessUrl || !isValidUrl(lead.googleBusinessUrl)) {
    return jsonResponse({ success: false, error: "Missing required fields." }, 400);
  } else {
    lead.city = "";
  }

  const mailerLiteResult = await saveProspectToMailerLite({
    apiKey: mailerLiteApiKey,
    product,
    lead,
  });

  if (!mailerLiteResult.ok) {
    console.error("MailerLite prospect save failed.", mailerLiteResult);
    return jsonResponse({ success: false, error: "MailerLite prospect save failed." }, 502);
  }

  const checkoutResult = await createStripeCheckoutSession({
    apiKey: stripeSecretKey,
    priceId,
    productCode,
    product,
    lead,
  });

  if (!checkoutResult.ok) {
    return jsonResponse({ success: false, error: checkoutResult.error }, 502);
  }

  return jsonResponse({
    success: true,
    url: checkoutResult.url,
    mailerlite_group_id: mailerLiteResult.groupId,
    warning: mailerLiteResult.warning || null,
  });
}
