import assert from "node:assert/strict";
import test from "node:test";

const runLiveTests = process.env.RUN_LIVE_REDIRECT_TESTS === "1";
const canonicalOrigin = "https://efficiadigital.com";

const cases = [
  ["racine", "/"],
  ["route interne", "/audit-google-business"],
  ["route légale", "/mentions-legales"],
  ["paramètres", "/audit-google-business?source=redirect-test&mode=live"],
];

for (const [label, path] of cases) {
  test(`www redirige en 301 vers l’URL canonique — ${label}`, { skip: !runLiveTests }, async () => {
    const source = new URL(path, "https://www.efficiadigital.com");
    const expected = new URL(path, canonicalOrigin);
    const response = await fetch(source, { redirect: "manual" });
    const location = response.headers.get("location");

    assert.equal(response.status, 301);
    assert.equal(location, expected.href);
    assert.doesNotMatch(location ?? "", /\/s(?:[/?#]|$)/u);

    const destination = new URL(location);
    assert.equal(destination.origin, canonicalOrigin);
    assert.notEqual(destination.hostname, source.hostname, "la destination ne doit pas créer de boucle www");
  });
}

test("le domaine canonique sans www ne redirige pas vers www", { skip: !runLiveTests }, async () => {
  const response = await fetch(`${canonicalOrigin}/`, { redirect: "manual" });
  const location = response.headers.get("location");

  assert.ok(response.status < 300 || response.status >= 400, `statut inattendu : ${response.status}`);
  assert.ok(!location || new URL(location, canonicalOrigin).hostname !== "www.efficiadigital.com");
});
