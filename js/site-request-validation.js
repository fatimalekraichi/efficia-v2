// Shared validation: no credentials or delivery configuration in the browser.
// Two sources share the same endpoint: the redesign page (default) and the contact page.
export const CONTACT_TOPICS = { google: 'Ma fiche Google', site: 'Mon site internet', 'les-deux': 'Les deux', 'ne-sait-pas': 'Je ne sais pas encore' };
export function validateSiteRequest(input) {
  const data = {};
  const source = input?.source === 'contact' ? 'contact' : 'refonte';
  const limits = { name: 120, company: 200, website: 2048, message: 4000, contact: 254 };
  const optional = source === 'contact' ? ['website', 'company', 'message'] : ['website'];
  for (const [field, limit] of Object.entries(limits)) {
    const value = input?.[field] ?? (optional.includes(field) && source === 'contact' ? '' : undefined);
    if (typeof value !== 'string' || value.length > limit) return { error: 'Veuillez vérifier les champs du formulaire.', field };
    data[field] = value.trim();
    if (!optional.includes(field) && !data[field]) return { error: 'Veuillez remplir ce champ.', field };
  }
  if (data.website) {
    try {
      const url = new URL(data.website);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error();
    } catch { return { error: 'Indiquez une adresse de site complète, commençant par https://.', field: 'website' }; }
  }
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact);
  const digits = data.contact.replace(/\D/g, '');
  const phone = /^\+?[\d\s().-]+$/.test(data.contact) && digits.length >= 8 && digits.length <= 15;
  if (!email && !phone) return { error: 'Indiquez une adresse e-mail valide ou un numéro de téléphone valide.', field: 'contact' };
  if (source === 'contact') {
    const topic = input?.topic ?? '';
    if (typeof topic !== 'string' || (topic && !Object.hasOwn(CONTACT_TOPICS, topic))) return { error: 'Veuillez vérifier les champs du formulaire.', field: 'topic' };
    data.source = 'contact';
    data.topic = topic;
  }
  return { data };
}
