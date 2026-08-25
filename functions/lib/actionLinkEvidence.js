const ACTION_FIELD_TYPES = Object.freeze({
  reservation_links: "réservation",
  reservation_link: "réservation",
  booking_appointment_link: "rendez-vous",
  booking_appointment_links: "rendez-vous",
  appointment_link: "rendez-vous",
  appointment_links: "rendez-vous",
  quote_link: "devis",
  quote_links: "devis",
  request_quote_link: "devis",
  request_quote_links: "devis",
  order_links: "commande",
  order_link: "commande",
});

const DIRECTORY_DOMAINS = Object.freeze([
  "heures.be",
  "infobel.com",
  "starofservice.be",
  "tafsquare.com",
  "tafsquare.be",
]);

function hasOwn(object, key){
  return Boolean(object && typeof object === "object" && Object.prototype.hasOwnProperty.call(object, key));
}

function values(value){
  if(Array.isArray(value)) return value.flatMap(values);
  if(value && typeof value === "object") {
    return values(value.url ?? value.link ?? value.href ?? "");
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function domainFor(url){
  try{
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  }catch{
    return "";
  }
}

function domainMatches(domain, expected){
  return domain === expected || domain.endsWith(`.${expected}`);
}

function classifyUrl(url){
  const domain = domainFor(url);
  if(!domain) return { domain:"", status:"non vérifiable" };
  if(DIRECTORY_DOMAINS.some((expected) => domainMatches(domain, expected))){
    return { domain, status:"annuaire" };
  }
  if(domainMatches(domain, "google.com") || domainMatches(domain, "google.be") || domainMatches(domain, "maps.app.goo.gl")){
    return { domain, status:"indirect" };
  }
  return { domain, status:"direct" };
}

export function extractActionLinkEvidence(place = {}){
  const availableFields = Object.keys(ACTION_FIELD_TYPES).filter((field) => hasOwn(place, field));
  const links = [];
  availableFields.forEach((field) => {
    values(place[field]).forEach((url) => {
      const classification = classifyUrl(url);
      links.push({
        type: ACTION_FIELD_TYPES[field],
        url,
        domain: classification.domain,
        source: field,
        status: classification.status,
      });
    });
  });
  return {
    availability: availableFields.length ? "available" : "unavailable",
    observedFields: availableFields,
    links,
    directLinks: links.filter((link) => link.status === "direct"),
  };
}

export function normalizeStoredActionLinkEvidence(normalized = {}){
  const observed = Array.isArray(normalized.observed_fields)
    && normalized.observed_fields.includes("action_links");
  const available = normalized.action_links_status === "available" || observed;
  const links = Array.isArray(normalized.action_links)
    ? normalized.action_links.map((link) => {
        const url = String(link?.url || "").trim();
        const classification = classifyUrl(url);
        return {
          type: String(link?.type || "action").trim() || "action",
          url,
          domain: classification.domain,
          source: String(link?.source || "provider").trim() || "provider",
          status: classification.status,
        };
      }).filter((link) => link.url)
    : [];
  return {
    availability: available ? "available" : "unavailable",
    links,
    directLinks: links.filter((link) => link.status === "direct"),
  };
}

export const ACTION_LINK_EVIDENCE_FIELDS = Object.freeze(Object.keys(ACTION_FIELD_TYPES));
