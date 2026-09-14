const TITLE = "Diagnostic Google gratuit | Efficia Digital";
const DESCRIPTION = "Obtenez gratuitement votre Score Efficia™.";
const CANONICAL = "https://efficiadigital.com/diagnostic-gratuit";

// Project the existing home-page form, rather than maintaining a second form.
// Only this response loses the home-page content and the modal presentation.
export async function onRequestGet({ request, env }) {
  const home = await env.ASSETS.fetch(new URL("/", request.url));
  if (!home.ok) return new Response("Service temporairement indisponible.", { status: 503 });
  let formFound = false;
  const remove = { element: element => element.remove() };
  const rewriter = new HTMLRewriter()
    .on("title", { element: element => element.setInnerContent(TITLE) })
    .on("meta", {
      element(element) {
        const key = element.getAttribute("name") || element.getAttribute("property");
        if (["og:title", "twitter:title"].includes(key)) element.setAttribute("content", TITLE);
        if (["description", "og:description", "twitter:description"].includes(key)) element.setAttribute("content", DESCRIPTION);
        if (key === "og:url") element.setAttribute("content", CANONICAL);
      },
    })
    .on('link[rel="canonical"]', { element: element => element.setAttribute("href", CANONICAL) })
    .on('head script[type="application/ld+json"]', remove)
    .on("link[href], script[src]", {
      element(element) {
        const attribute = element.tagName === "link" ? "href" : "src";
        const value = element.getAttribute(attribute);
        if (value && !/^(?:[a-z]+:|\/|#)/i.test(value)) element.setAttribute(attribute, `/${value}`);
        // The new page must not reuse an older cached version without standalone support.
        if (element.getAttribute("src")?.startsWith("/js/app.js")) {
          element.setAttribute("src", "/js/app.js?v=20260914-ads");
        }
      },
    })
    .on("body > *", {
      element(element) {
        if (element.getAttribute("id") !== "diagnostic-modal" && element.tagName !== "script") element.remove();
      },
    })
    .on("#diagnostic-modal", {
      element(element) {
        formFound = true;
        element.removeAttribute("inert");
        element.setAttribute("aria-hidden", "false");
        element.setAttribute("data-diagnostic-page", "");
        element.setAttribute("role", "main");
      },
    })
    .on("#diagnostic-modal .conversion-modal__dialog", {
      element(element) {
        element.removeAttribute("role");
        element.removeAttribute("aria-modal");
      },
    })
    .on("#diagnostic-modal .conversion-modal__backdrop, #diagnostic-modal .conversion-modal__close", remove)
    .on("head", {
      element(element) {
        element.append(`<style>
          #diagnostic-modal[data-diagnostic-page] {
            position: relative; inset: auto; z-index: auto; min-height: 100vh;
            min-height: 100svh; opacity: 1; pointer-events: auto; align-items: center;
          }
          #diagnostic-modal[data-diagnostic-page] .conversion-modal__dialog {
            max-height: none; transform: none;
          }
        </style>`, { html: true });
      },
    });
  const html = await rewriter.transform(home).text();
  if (!formFound) return new Response("Service temporairement indisponible.", { status: 503 });
  const headers = new Headers(home.headers);
  for (const key of ["etag", "last-modified", "content-length", "content-encoding"]) headers.delete(key);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache");
  return new Response(html, { headers });
}

export async function onRequestHead(context) {
  const response = await onRequestGet(context);
  return new Response(null, response);
}
