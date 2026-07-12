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
    group_name: product.prospectGroupName,
    has_google_business_url: Boolean(lead.googleBusinessUrl),
    has_city: Boolean(lead.city),
  });

  const groupId = await getMailerLiteGroupIdByName({
    apiKey,
    groupName: product.prospectGroupName,
  });

  if (!groupId) {
    console.error("Purchase checkout: continuing without MailerLite group because it was not found", {
      email: lead.email,
      group_name: product.prospectGroupName,
    });
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
    console.log("Purchase checkout: MailerLite prospect saved with full fields", {
      email: lead.email,
      group_id: groupId || null,
    });
    return { ok: true, groupId };
  }

  console.log("Purchase checkout: retrying MailerLite with safe fields only", {
    email: lead.email,
    group_id: groupId || null,
  });

  const fallbackResponse = await sendSubscriberToMailerLite({
    apiKey,
    email: lead.email,
    groupId,
    fields: safeFields,
  });

  if (!fallbackResponse.ok) {
    console.log("Purchase checkout: retrying MailerLite with minimal fields only", {
      email: lead.email,
      group_id: groupId || null,
    });

    const minimalResponse = await sendSubscriberToMailerLite({
      apiKey,
      email: lead.email,
      groupId,
      fields: {
        name: lead.fullName,
      },
    });

    if (minimalResponse.ok) {
      return {
        ok: true,
        groupId,
        warning: "MailerLite custom fields were rejected. Subscriber was saved with minimal fields only.",
      };
    }

    return {
      ok: false,
      error: "MailerLite subscriber request failed.",
      details: minimalResponse.details,
    };
  }

  return {
    ok: true,
    groupId,
    warning: "Some MailerLite custom fields were rejected. Subscriber was saved with known fields only.",
  };
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
