const STRIPE_CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const MAILERLITE_GROUPS_ENDPOINT = "https://connect.mailerlite.com/api/groups?limit=100";
const MAILERLITE_FIELDS_ENDPOINT = "https://connect.mailerlite.com/api/fields?limit=100";
const MAILERLITE_SUBSCRIBERS_ENDPOINT = "https://connect.mailerlite.com/api/subscribers";
const SUCCESS_URL = "https://efficiadigital.com/paiement-reussi?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://efficiadigital.com/#offres";

const PRODUCTS = {
  audit: {
    envKey: "STRIPE_PRICE_AUDIT",
    name: "Audit fiche Google",
    mailerLiteGroupName: "Prospects - Audit (paiement en cours)",
  },
  visibility: {
    envKey: "STRIPE_PRICE_VISIBILITY",
    name: "Pack Visibilité Google",
    mailerLiteGroupName: "Prospects - Pack Visibilité (paiement en cours)",
  },
  performance: {
    envKey: "STRIPE_PRICE_PERFORMANCE",
    name: "Pack Performance",
    mailerLiteGroupName: "Prospects - Pack Performance (paiement en cours)",
  },
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeForMatch = (value) => normalizeText(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

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
  console.log("Purchase checkout: searching MailerLite group", { group_name: groupName });

  let response;
  try {
    response = await fetch(MAILERLITE_GROUPS_ENDPOINT, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });
  } catch (error) {
    console.error("MailerLite groups request threw an exception.", error);
    return "";
  }

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

  const expectedName = normalizeForMatch(groupName);
  const group = data?.data?.find((item) => normalizeForMatch(item?.name) === expectedName);
  const groupId = normalizeText(group?.id);

  if (!groupId) {
    console.error("Purchase checkout: MailerLite group not found by name", {
      expected_group_name: groupName,
      available_group_names: Array.isArray(data?.data) ? data.data.map((item) => item?.name).filter(Boolean) : [],
    });
  }

  return groupId;
};

const getMailerLiteFieldKeys = async ({ apiKey }) => {
  console.log("Purchase checkout: fetching MailerLite custom field keys");

  let response;
  try {
    response = await fetch(MAILERLITE_FIELDS_ENDPOINT, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
    });
  } catch (error) {
    console.error("MailerLite fields request threw an exception.", error);
    return {
      ok: false,
      keys: new Set(),
    };
  }

  const responseText = await response.text();
  if (!response.ok) {
    console.error("MailerLite fields request failed", response.status, responseText);
    return {
      ok: false,
      keys: new Set(),
    };
  }

  let data = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("MailerLite fields response was not JSON.", responseText);
    return {
      ok: false,
      keys: new Set(),
    };
  }

  const keys = new Set(
    (Array.isArray(data?.data) ? data.data : [])
      .map((field) => normalizeText(field?.key))
      .filter(Boolean),
  );

  console.log("Purchase checkout: MailerLite field keys fetched", {
    field_keys: Array.from(keys),
  });

  return {
    ok: true,
    keys,
  };
};

const setFirstAvailableField = ({ fields, fieldKeys, candidates, value, label }) => {
  const cleanValue = typeof value === "boolean" ? (value ? "true" : "false") : normalizeText(value);
  const key = candidates.find((candidate) => fieldKeys.has(candidate));

  if (!key) {
    console.error("Purchase checkout: MailerLite custom field key not found", {
      field_label: label,
      candidate_keys: candidates,
    });
    return "";
  }

  fields[key] = cleanValue;
  return key;
};

const buildMailerLiteFields = ({ product, lead, fieldKeys }) => {
  const { firstName, lastName } = splitFullName(lead.fullName);
  const googleBusinessLinkKnown = Boolean(lead.googleBusinessUrl);
  const fields = {
    name: lead.fullName,
  };
  const mappedKeys = {
    full_name: "name",
  };

  mappedKeys.first_name = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["first_name", "prenom", "prénom"],
    value: firstName,
    label: "prénom",
  });
  mappedKeys.last_name = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["last_name", "nom"],
    value: lastName,
    label: "nom",
  });
  mappedKeys.company = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["company", "company_name", "entreprise"],
    value: lead.companyName,
    label: "nom de l'entreprise",
  });
  mappedKeys.city = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["city", "ville"],
    value: lead.city,
    label: "ville",
  });
  mappedKeys.google_business_url = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["google_business_url", "google_business_link", "lien_google_business"],
    value: lead.googleBusinessUrl,
    label: "lien Google Business",
  });
  mappedKeys.selected_offer = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["selected_offer", "offre_choisie", "offer", "product"],
    value: product.name,
    label: "offre choisie",
  });
  mappedKeys.prospect_status = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["prospect_status", "audit_status", "lead_status", "statut_prospect"],
    value: "paiement en cours",
    label: "statut du prospect",
  });
  mappedKeys.google_business_link_known = setFirstAvailableField({
    fields,
    fieldKeys,
    candidates: ["google_business_link_known", "google_business_url_known", "lien_google_business_connu"],
    value: googleBusinessLinkKnown,
    label: "google_business_link_known",
  });

  console.log("Purchase checkout: MailerLite field mapping prepared", {
    mapped_keys: mappedKeys,
    sent_field_keys: Object.keys(fields),
  });

  return fields;
};

const sendSubscriberToMailerLite = async ({ apiKey, email, groupId, fields }) => {
  console.log("Purchase checkout: sending subscriber to MailerLite", {
    email,
    group_id: groupId || null,
    field_keys: Object.keys(fields),
  });

  const requestBody = {
    email,
    status: "active",
    resubscribe: true,
    fields,
  };

  if (groupId) {
    requestBody.groups = [groupId];
  }

  let response;
  try {
    response = await fetch(MAILERLITE_SUBSCRIBERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    console.error("MailerLite subscriber request threw an exception.", error);
    return {
      ok: false,
      status: 0,
      details: "MailerLite request exception.",
    };
  }

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
  console.log("Purchase checkout: saving prospect before Stripe", {
    email: lead.email,
    product: product.name,
    group_name: product.mailerLiteGroupName,
    has_google_business_url: Boolean(lead.googleBusinessUrl),
    has_city: Boolean(lead.city),
  });

  const groupId = await getMailerLiteGroupIdByName({
    apiKey,
    groupName: product.mailerLiteGroupName,
  });

  if (!groupId) {
    console.error("Purchase checkout: MailerLite group is required but was not found", {
      email: lead.email,
      group_name: product.mailerLiteGroupName,
    });
    return {
      ok: false,
      error: "MailerLite group was not found.",
    };
  }

  const fieldKeysResult = await getMailerLiteFieldKeys({ apiKey });

  if (!fieldKeysResult.ok) {
    console.error("Purchase checkout: could not verify MailerLite custom fields");
    return {
      ok: false,
      error: "MailerLite fields could not be verified.",
    };
  }

  const fields = buildMailerLiteFields({
    product,
    lead,
    fieldKeys: fieldKeysResult.keys,
  });

  const response = await sendSubscriberToMailerLite({
    apiKey,
    email: lead.email,
    groupId,
    fields,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: "MailerLite subscriber request failed.",
      details: response.details,
    };
  }

  console.log("Purchase checkout: MailerLite prospect saved before Stripe", {
    email: lead.email,
    group_id: groupId,
    group_name: product.mailerLiteGroupName,
    response_details: response.details,
  });

  return { ok: true, groupId };
};

const createStripeCheckoutSession = async ({ apiKey, priceId, productCode, product, lead }) => {
  console.log("Purchase checkout: creating Stripe Checkout session", {
    email: lead.email,
    product_code: productCode,
    product: product.name,
    has_price_id: Boolean(priceId),
  });

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

  let response;
  try {
    response = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formData,
    });
  } catch (error) {
    console.error("Stripe Checkout request threw an exception.", error);
    return {
      ok: false,
      error: "Stripe Checkout request failed.",
    };
  }

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
  try {
    return await handleCheckoutPreparation(context);
  } catch (error) {
    console.error("Unhandled checkout preparation error.", error);
    return jsonResponse({ success: false, error: "Checkout preparation failed." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return onRequestOptions();
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method Not Allowed" }, 405);
  }

  return onRequestPost(context);
}

const handleCheckoutPreparation = async (context) => {
  console.log("Purchase checkout: request received");

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
    console.error("Purchase checkout: invalid product or missing Stripe price", {
      product_code: productCode,
      has_product: Boolean(product),
      expected_price_env_key: product?.envKey || null,
      has_price_id: Boolean(priceId),
    });
    return jsonResponse({ success: false, error: "Invalid product." }, 400);
  }

  if (!lead.fullName || !isValidEmail(lead.email) || !lead.companyName) {
    console.error("Purchase checkout: validation failed for identity fields", {
      has_full_name: Boolean(lead.fullName),
      has_valid_email: isValidEmail(lead.email),
      has_company_name: Boolean(lead.companyName),
    });
    return jsonResponse({ success: false, error: "Missing required fields." }, 400);
  }

  if (lead.unknownGoogleBusiness) {
    if (!lead.city) {
      console.error("Purchase checkout: validation failed, city is required when Google link is unknown");
      return jsonResponse({ success: false, error: "Missing required fields." }, 400);
    }
    lead.googleBusinessUrl = "";
  } else if (!lead.googleBusinessUrl || !isValidUrl(lead.googleBusinessUrl)) {
    console.error("Purchase checkout: validation failed, Google Business URL is required");
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
    console.error("Purchase checkout: Stripe Checkout creation failed.", checkoutResult);
    return jsonResponse({ success: false, error: checkoutResult.error }, 502);
  }

  console.log("Purchase checkout: completed successfully", {
    email: lead.email,
    product: product.name,
    mailerlite_group_id: mailerLiteResult.groupId,
  });

  return jsonResponse({
    success: true,
    url: checkoutResult.url,
    mailerlite_group_id: mailerLiteResult.groupId,
    warning: mailerLiteResult.warning || null,
  });
};
