// Shared validation: no credentials or delivery configuration in the browser.
export function validateSiteRequest(input) {
  const data = {};
  const limits = { name: 120, company: 200, website: 2048, message: 4000, contact: 254 };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof input?.[field] !== 'string' || input[field].length > limit) return { error: 'Veuillez vérifier les champs du formulaire.', field };
    data[field] = input[field].trim();
    if (field !== 'website' && !data[field]) return { error: 'Veuillez remplir ce champ.', field };
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
  return { data };
}
