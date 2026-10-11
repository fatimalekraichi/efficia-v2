import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createSessionCookie } from "../functions/admin/_shared.js";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) result.push(...await files(url));
    else if (entry.name.endsWith(".js")) result.push(url);
  }
  return result;
}

for (const url of await files(new URL("../functions/api/admin/", import.meta.url))) {
  const route = await import(url.href);
  const handlers = Object.entries(route).filter(([name]) => /^onRequest(?:Get|Post|Put|Patch|Delete)$/.test(name));
  for (const [name, handler] of handlers) {
    test(`${url.pathname.split("/functions/")[1]} ${name} refuse toute session invalide avant D1/fournisseur`, async () => {
      const secret = "local-boundary-fixture";
      const originalNow = Date.now;
      let expired;
      try {
        Date.now = () => originalNow() - 9 * 60 * 60 * 1000;
        expired = (await createSessionCookie({ ADMIN_SESSION_SECRET: secret })).split(";")[0];
      } finally {
        Date.now = originalNow;
      }
      const wrong = (await createSessionCookie({ ADMIN_SESSION_SECRET: "wrong-boundary-fixture" })).split(";")[0];
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new Error("No outbound fetch permitted"); };
      try {
        for (const cookie of ["", "efficia_admin_session=invalid.invalid", wrong, expired]) {
          const env = {
            ADMIN_SESSION_SECRET: secret,
            get ORDERS_DB() { throw new Error("Unauthenticated database access"); },
          };
          const response = await handler({
            env,
            params: { analysisId: "boundary-analysis", draftId: "boundary-draft" },
            request: new Request("https://preview.local/api/admin/test", {
              method: name.slice(9).toUpperCase(),
              headers: cookie ? { Cookie: cookie } : {},
            }),
          });
          assert.equal(response.status, 401);
          assert.equal((await response.json()).error, "UNAUTHORIZED");
        }
        assert.equal(calls, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
}
