(() => {
  "use strict";
  if (window.efficiaAds || !["/", "/index.html", "/diagnostic-gratuit", "/diagnostic-gratuit/"].includes(location.pathname)) return;
  const SCRIPT_ID = "efficia-openai-ads-sdk";
  const SENT_KEY = "efficiaOpenAILeadEvents";
  const pending = new Set();
  const sent = new Set();
  let allowed = false;
  let started = false;
  let ready = false;

  const call = (...args) => {
    try {
      if (typeof window.oaiq !== "function") return false;
      window.oaiq(...args);
      return true;
    } catch { return false; }
  };
  const flush = () => {
    if (!allowed || !ready) return;
    for (const eventId of pending) {
      pending.delete(eventId);
      if (sent.has(eventId)) continue;
      if (call("measure", "lead_created", { type: "customer_action" }, { event_id: eventId })) {
        sent.add(eventId);
        try { sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent])); } catch { /* Storage may be blocked. */ }
      }
    }
  };
  const setConsent = (value) => {
    allowed = value === true;
    if (!allowed) {
      pending.clear(); // Never replay a conversion after withdrawal.
      if (started) call("consent", false);
      for (const domain of ["", location.hostname, `.${location.hostname}`]) {
        document.cookie = `__oppref=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
      }
      return;
    }
    if (started) {
      if (ready) { call("consent", true); flush(); }
      return;
    }
    started = true;
    try {
      const stored = JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]");
      if (Array.isArray(stored)) stored.filter(id => typeof id === "string").forEach(id => sent.add(id));
    } catch { /* In-memory deduplication remains available. */ }
    try {
      if (!window.oaiq) {
        const q = function () { q.q.push(arguments); };
        q.q = [];
        window.oaiq = q;
      }
      call("consent", false); // The official SDK defaults to granted otherwise.
      call("init", { pixelId: "Ug6mafU2YhS9VBJMUtPSim" });
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
      script.addEventListener("load", () => {
        ready = true;
        call("consent", allowed);
        flush();
      }, { once: true });
      script.addEventListener("error", () => { pending.clear(); }, { once: true });
      document.head.appendChild(script);
    } catch { pending.clear(); }
  };
  const leadCreated = (result) => {
    if (!allowed || result?.success !== true || result.status !== "awaiting_review"
      || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.analysisId || "")) return;
    const eventId = `free_diagnostic_${result.analysisId}`;
    if (sent.has(eventId)) return;
    pending.add(eventId);
    flush();
  };
  window.efficiaAds = Object.freeze({ setConsent, leadCreated });
})();
