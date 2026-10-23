const COPIES = {
  "audit": {
    "subject": "Votre commande d’audit de fiche Google est restée en attente",
    "body": "{greeting}\n\nVous aviez commencé votre commande de l’Audit Google Business à 99 € TTC, sans la terminer.\n\n{resume}\n\nCet audit vous permet de comprendre les points forts de votre fiche et les améliorations à apporter. Vous recevez un rapport PDF personnalisé comprenant :\n– votre Score Efficia™ ;\n– une comparaison avec les concurrents de votre zone ;\n– vos points forts et les éléments à améliorer ;\n– un plan d’action classé par priorité, que vous pouvez appliquer vous-même.\n\nJe n’ai pas besoin d’accéder à votre fiche. Le rapport vous est envoyé sous 3 à 5 jours ouvrés après réception de votre commande complète : paiement confirmé et informations nécessaires pour identifier votre entreprise et votre fiche. Si une précision manque, je vous contacte avant de commencer.\n\nSi vous choisissez ensuite un Pack Visibilité ou Performance dans les 30 jours suivant l’achat de cet audit, les 99 € sont déduits du prix du pack, pour la même entreprise et la même fiche. Avant de payer le pack, répondez à ce mail avec la référence de votre audit : je vous prépare une facture avec la déduction.\n\nUne question avant de vous décider ? Répondez simplement à ce mail, je vous répondrai personnellement.\n\nBonne journée,\nFatima – Efficia Digital\ncontact@efficiadigital.com\n\n{stop}"
  },
  "visibility": {
    "subject": "Votre commande du Pack Visibilité est restée en attente",
    "body": "{greeting}\n\nVous aviez commencé votre commande du Pack Visibilité Google à 349 € TTC, sans la terminer.\n\n{resume}\n\nAvec ce pack, je prends en charge la création ou l’optimisation de votre fiche Google :\n– description, catégories et services ;\n– zone d’intervention et horaires ;\n– ajout des premières photos et d’une première publication ;\n– création d’un QR code pour demander des avis à vos clients ;\n– aide aux démarches de validation de votre fiche auprès de Google.\n\nCette aide comprend la vérification des informations, les indications pour préparer les justificatifs demandés par Google et une relecture des éléments avant leur transmission. Elle ne garantit pas la validation et ne comprend pas des recours ou une assistance illimités.\n\nVous validez les contenus avant leur publication, et je vous tiens informé à chaque étape. Le paiement est unique, sans abonnement.\n\nVous vous demandez si cette formule correspond à votre situation ? Répondez simplement à ce mail, nous regarderons cela ensemble.\n\nBonne journée,\nFatima – Efficia Digital\ncontact@efficiadigital.com\n\n{stop}"
  },
  "performance": {
    "subject": "Votre commande du Pack Performance est restée en attente",
    "body": "{greeting}\n\nVous aviez commencé votre commande du Pack Performance Google à 499 € TTC, sans la terminer.\n\n{resume}\n\nCe pack comprend tout le Pack Visibilité, avec un mois d’accompagnement supplémentaire. Pour une nouvelle fiche, il commence à sa mise en ligne ; pour une fiche déjà en ligne, à compter du démarrage du suivi convenu ensemble :\n– une publication par semaine, soit quatre publications ;\n– une analyse approfondie des concurrents de votre zone ;\n– un suivi de votre fiche et une aide aux ajustements si Google modifie ou refuse une information ;\n– des conseils pour demander des avis à vos clients et y répondre ;\n– un bilan final des actions réalisées et des prochaines étapes recommandées.\n\nPendant ce mois, je prépare les publications et je suis l’évolution de votre fiche. Le paiement est unique, sans abonnement.\n\nVous hésitez entre le Pack Visibilité et le Pack Performance ? Répondez à ce mail en me précisant votre activité et votre situation. Je vous aiderai à choisir la formule qui vous convient.\n\nBonne journée,\nFatima – Efficia Digital\ncontact@efficiadigital.com\n\n{stop}"
  }
};
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reminderCopy(offer,link,stopLink,firstName='') {
 const copy=COPIES[offer];if(!copy)throw Error('UNKNOWN_OFFER');
 for(const url of [link,stopLink]){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_EMAIL_LINK');}
 const name=String(firstName||'').replace(/[\r\n\t]/g,' ').trim().slice(0,80);
 const greeting=name?`Bonjour ${name},`:'Bonjour,';
 const stopLabel='Ne plus recevoir de relances commerciales Efficia Digital';
 const text=copy.body.replace('{greeting}',greeting).replace('{resume}',`Reprendre ma commande : ${link}`).replace('{stop}',`${stopLabel} : ${stopLink}`);
 const body=copy.body.replace('{greeting}',greeting).split('\n\n').map(p=>{
  if(p==='{resume}')return `<p style="margin:24px 0"><a href="${escapeHTML(link)}" style="display:inline-block;background:#153e75;color:white;padding:14px 20px;border-radius:6px;text-decoration:none">Reprendre ma commande</a></p>`;
  if(p==='{stop}')return `<p style="font-size:13px;margin-top:28px"><a href="${escapeHTML(stopLink)}">${stopLabel}</a></p>`;
  return `<p style="margin:0 0 18px">${escapeHTML(p).replace(/\n/g,'<br>')}</p>`;
 }).join('');
 const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:20px;background:#f4f6f8;font-family:Arial,sans-serif;color:#172b42"><div style="max-width:600px;margin:auto;background:white;padding:24px;line-height:1.6;font-size:16px;overflow-wrap:anywhere">${body}</div></body></html>`;
 return {subject:copy.subject,text,html};
}
