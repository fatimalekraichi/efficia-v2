const GOOGLE_HOST_PATTERN = /(^|\.)google\.(?:com|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i;
const GOOGLE_MAPS_HOST_PATTERN = /(^|\.)googleapis\.com$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i;
const GOOGLE_CONTENT_HOST_PATTERN = /(^|\.)googleusercontent\.com$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value, maxLength) => (typeof value === "string" ? value.trim().slice(0, maxLength) : "");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const d1Nullable = (value) => (value === undefined ? null : value);

function persistenceError(phase, error) {
  if (error?.phase) return error;
  const wrapped = new Error(
    typeof error?.message === "string" ? error.message : "D1 persistence failed.",
    { cause: error },
  );
  wrapped.name = typeof error?.name === "string" ? error.name : "Error";
  wrapped.phase = phase;
  return wrapped;
}

export function isValidGoogleBusinessUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return GOOGLE_HOST_PATTERN.test(host)
      || GOOGLE_MAPS_HOST_PATTERN.test(host)
      || GOOGLE_CONTENT_HOST_PATTERN.test(host);
  } catch {
    return false;
  }
}

export function normalizeDiagnosticSubmission(payload = {}) {
  const idempotencyKey = cleanText(payload.idempotency_key || payload.idempotencyKey, 80);
  const firstName = cleanText(payload.first_name || payload.firstName, 100);
  const email = cleanText(payload.email, 254).toLowerCase();
  const companyName = cleanText(payload.company_name || payload.company, 180);
  const city = cleanText(payload.business_location || payload.city, 120);
  const googleBusinessUrl = cleanText(payload.google_business_url || payload.googleBusiness, 2000);

  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: "INVALID_IDEMPOTENCY_KEY" };
  }
  if (!firstName || !isValidEmail(email)) {
    return { ok: false, error: "MISSING_REQUIRED_FIELDS" };
  }
  if (googleBusinessUrl && !isValidGoogleBusinessUrl(googleBusinessUrl)) {
    return { ok: false, error: "INVALID_GOOGLE_BUSINESS_URL" };
  }
  if (!googleBusinessUrl && !(companyName && city)) {
    return { ok: false, error: "MISSING_BUSINESS_LOOKUP" };
  }

  return {
    ok: true,
    data: {
      idempotencyKey,
      firstName,
      email,
      companyName,
      city,
      googleBusinessUrl,
    },
  };
}

export function normalizeInternalDiagnosticRequest(value = {}) {
  const requestId = cleanText(value.requestId, 80);
  const normalized = normalizeDiagnosticSubmission({
    idempotencyKey: value.idempotencyKey,
    firstName: value.firstName,
    email: value.email,
    company: value.companyName,
    city: value.city,
    googleBusiness: value.googleBusinessUrl,
  });
  if (!IDEMPOTENCY_KEY_PATTERN.test(requestId) || !normalized.ok) {
    return { ok: false, error: normalized.error || "INVALID_REQUEST_ID" };
  }
  return { ok: true, data: { requestId, ...normalized.data } };
}

export async function loadDiagnosticRequestByIdempotency(db, idempotencyKey) {
  return db.prepare(`
    SELECT request_id, analysis_id, status, mailerlite_status
    FROM diagnostic_requests
    WHERE idempotency_key = ?
    LIMIT 1
  `).bind(idempotencyKey).first();
}

export async function persistDiagnosticRequestAtomically(db, { analysisStatement, request }) {
  let requestStatement;
  try {
    requestStatement = db.prepare(`
      INSERT INTO diagnostic_requests (
        request_id, idempotency_key, analysis_id, first_name, email,
        company_name, city, google_business_url, status, mailerlite_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_review', 'pending', ?, ?)
    `).bind(
      request.requestId,
      request.idempotencyKey,
      request.analysisId,
      request.firstName,
      request.email,
      d1Nullable(request.companyName || null),
      d1Nullable(request.city || null),
      d1Nullable(request.googleBusinessUrl || null),
      request.createdAt,
      request.createdAt,
    );
  } catch (error) {
    throw persistenceError("diagnostic_request_insert", error);
  }

  try {
    await db.batch([analysisStatement, requestStatement]);
    return {
      analysisId: request.analysisId,
      status: "awaiting_review",
      mailerLiteStatus: "pending",
      idempotent: false,
    };
  } catch (error) {
    const existing = await loadDiagnosticRequestByIdempotency(db, request.idempotencyKey).catch(() => null);
    if (existing?.analysis_id) {
      return {
        analysisId: existing.analysis_id,
        status: existing.status || "awaiting_review",
        mailerLiteStatus: existing.mailerlite_status || "pending",
        idempotent: true,
      };
    }
    throw persistenceError("atomic_batch", error);
  }
}

export async function updateDiagnosticMailerLiteStatus(db, analysisId, status) {
  const updatedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE diagnostic_requests
    SET mailerlite_status = ?, updated_at = ?
    WHERE analysis_id = ?
  `).bind(status, updatedAt, analysisId).run();
}

export async function loadDiagnosticRequestContext(db, analysisId) {
  return db.prepare(`
    SELECT request_id, analysis_id, email, first_name, company_name, city, google_business_url
    FROM diagnostic_requests
    WHERE analysis_id = ?
    LIMIT 1
  `).bind(analysisId).first();
}
