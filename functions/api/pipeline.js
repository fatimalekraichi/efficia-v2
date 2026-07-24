// Cloudflare Pages Function — /api/pipeline
// Orchestre Observation → Benchmark → Knowledge sans dupliquer leur logique.

import { verifyConnectorToken } from "./_auth.js";
import { runPipelineEngine } from "../lib/pipelineEngine.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
});

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function readPipelineInput(request) {
  try {
    const payload = await request.json();
    return {
      nom: cleanString(payload?.nom),
      ville: cleanString(payload?.ville),
      activite: cleanString(payload?.activite),
    };
  } catch {
    return { nom: "", ville: "", activite: "" };
  }
}

function validatePipelineInput(input) {
  return Boolean(input.nom && input.ville && input.activite);
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function endpointForStage(origin, stage) {
  if (stage === "observation") return `${origin}/api/analyze`;
  if (stage === "benchmark") return `${origin}/api/benchmark`;
  if (stage === "knowledge") return `${origin}/api/knowledge`;
  throw new Error(`Unknown pipeline stage: ${stage}`);
}

async function callStage({ origin, authorization }, stage, payload) {
  const response = await fetch(endpointForStage(origin, stage), {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        status: response.status,
        body: data,
      },
    };
  }

  return { ok: true, data };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const auth = verifyConnectorToken(context);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  const input = await readPipelineInput(context.request);
  if (!validatePipelineInput(input)) {
    return jsonResponse({ success: false, error: "Missing required parameters: nom, ville, activite." }, 400);
  }

  const origin = new URL(context.request.url).origin;
  const authorization = context.request.headers.get("Authorization") || "";
  const result = await runPipelineEngine(
    input,
    (stage, payload) => callStage({ origin, authorization }, stage, payload),
    console,
  );

  if (result.status === "failed") {
    return jsonResponse(result, 502);
  }

  return jsonResponse(result);
}
