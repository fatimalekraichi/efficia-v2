const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
  },
});

const parseStripeSignature = (signatureHeader) => {
  if (!signatureHeader) return null;

  return signatureHeader.split(",").reduce((signature, item) => {
    const [key, value] = item.split("=");
    if (key === "t") signature.timestamp = value;
    if (key === "v1") signature.signatures.push(value);
    return signature;
  }, {
    timestamp: "",
    signatures: [],
  });
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
};

const verifyStripeSignature = async ({ payload, signatureHeader, secret }) => {
  const parsedSignature = parseStripeSignature(signatureHeader);
  if (!parsedSignature?.timestamp || !parsedSignature.signatures.length) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${parsedSignature.timestamp}.${payload}`;
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expectedSignature = toHex(digest);

  return parsedSignature.signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
    },
  });
}

const handleStripeWebhook = async (context) => {
  const webhookSecret = context.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Stripe webhook secret is not configured.");
    return jsonResponse({ success: false, error: "Stripe webhook secret is not configured." }, 500);
  }

  const signatureHeader = context.request.headers.get("stripe-signature");
  const payload = await context.request.text();
  const isSignatureValid = await verifyStripeSignature({
    payload,
    signatureHeader,
    secret: webhookSecret,
  });

  if (!isSignatureValid) {
    console.error("Invalid Stripe webhook signature.");
    return jsonResponse({ success: false, error: "Invalid signature." }, 400);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body." }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    console.log("Stripe checkout.session.completed", {
      session_id: session?.id,
      product: session?.metadata?.product_code || session?.metadata?.product_name || null,
      email: session?.customer_details?.email || session?.customer_email || null,
      payment_status: session?.payment_status || null,
    });
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data?.object;
    console.log("Stripe payment_intent.payment_failed", {
      payment_intent_id: paymentIntent?.id,
      email: paymentIntent?.receipt_email || null,
      payment_status: paymentIntent?.status || null,
      failure_message: paymentIntent?.last_payment_error?.message || null,
    });
  }

  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data?.object;
    console.log("Stripe checkout.session.async_payment_failed", {
      session_id: session?.id,
      product: session?.metadata?.product_code || session?.metadata?.product_name || null,
      email: session?.customer_details?.email || session?.customer_email || null,
      payment_status: session?.payment_status || null,
    });
  }

  return jsonResponse({ received: true });
};

export async function onRequestPost(context) {
  return handleStripeWebhook(context);
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return onRequestOptions();
  }

  if (context.request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method Not Allowed" }, 405);
  }

  return handleStripeWebhook(context);
}
