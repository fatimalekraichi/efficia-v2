import assert from "node:assert/strict";
import test from "node:test";

import { GOOGLE_MAPS_RESOLUTION, resolveGoogleMapsUrl } from "../functions/lib/googleMapsUrl.js";

test("résout un lien maps.app.goo.gl vers une URL Google Maps canonique", async () => {
  const calls = [];
  const result = await resolveGoogleMapsUrl("https://maps.app.goo.gl/short", {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(null, {
        status: 302,
        headers: { Location: "https://www.google.com/maps/place/Maison-Test/@50,4,15z" },
      });
    },
  });
  assert.deepEqual(result, {
    ok: true,
    url: "https://www.google.com/maps/place/Maison-Test/@50,4,15z",
    resolved: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.method, "GET");
});

test("refuse une redirection du lien court vers une origine non autorisée", async () => {
  const result = await resolveGoogleMapsUrl("https://maps.app.goo.gl/short", {
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { Location: "https://example.org/collect" },
    }),
  });
  assert.deepEqual(result, { ok: false, error: GOOGLE_MAPS_RESOLUTION.FORBIDDEN_REDIRECT });
});

test("bloque les boucles et l’excès de redirections", async () => {
  const loop = await resolveGoogleMapsUrl("https://maps.app.goo.gl/a", {
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { Location: "https://maps.app.goo.gl/a" },
    }),
  });
  assert.deepEqual(loop, { ok: false, error: GOOGLE_MAPS_RESOLUTION.TOO_MANY_REDIRECTS });

  let calls = 0;
  const excessive = await resolveGoogleMapsUrl("https://maps.app.goo.gl/0", {
    maxRedirects: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://maps.app.goo.gl/${calls}` },
      });
    },
  });
  assert.deepEqual(excessive, { ok: false, error: GOOGLE_MAPS_RESOLUTION.TOO_MANY_REDIRECTS });
  assert.equal(calls, 2);
});

test("refuse HTTP, les identifiants intégrés et les ports non standards", async () => {
  for (const value of [
    "http://maps.app.goo.gl/short",
    "https://user@maps.app.goo.gl/short",
    "https://maps.app.goo.gl:8443/short",
  ]) {
    assert.deepEqual(await resolveGoogleMapsUrl(value), {
      ok: false,
      error: GOOGLE_MAPS_RESOLUTION.INVALID_URL,
    });
  }
});

test("interrompt la résolution à l’expiration du délai", async () => {
  const result = await resolveGoogleMapsUrl("https://maps.app.goo.gl/slow", {
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  assert.deepEqual(result, { ok: false, error: GOOGLE_MAPS_RESOLUTION.TIMEOUT });
});

test("une URL canonique HTTPS est conservée sans appel réseau", async () => {
  const result = await resolveGoogleMapsUrl("https://www.google.com/maps/place/Maison-Test", {
    fetchImpl: async () => { throw new Error("aucun appel attendu"); },
  });
  assert.deepEqual(result, {
    ok: true,
    url: "https://www.google.com/maps/place/Maison-Test",
    resolved: false,
  });
});
