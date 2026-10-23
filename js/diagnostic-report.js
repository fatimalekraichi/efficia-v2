/* Free diagnostic only. Score calculation remains in score-efficia-core. */
(function(root){
  'use strict';
  const E=root.EfficiaDiagnosticEvidence,C=root.EfficiaDiagnosticToneConfig;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format=v=>typeof v==='number'?v.toLocaleString('fr-FR',{maximumFractionDigits:1}):String(v??'Non renseigné');
  function renderDiagnostic({model,score,domains=[],identity={},contact={},searchTest={},override=(id,s)=>s,header=()=>'',gauge=()=>'',payment=()=>''}){
    const blocks=[];
    function text(id,automatic,evidence=null,polarity=null,comparison=null){
      const final=override(id,automatic);
      // Every final block, including manual copy, passes through the same gate.
      blocks.push({id,text:final,kind:evidence?'finding':'copy',evidence,polarity,comparison,edited:final!==automatic,
        reviewed:evidence?.validatedText===final});
      return `<span data-editorial-block="${escape(id)}">${escape(final)}</span>`;
    }
    const templates={
      descriptionRemplie:['Ajouter une description de votre activité','Votre description présente votre activité.','Votre fiche ne contient aucune description : un prospect ne voit ni vos services ni votre zone d’intervention.'],
      horaires:['Indiquer vos horaires','Vos horaires sont renseignés.','Les horaires sont absents ou nécessitent une correction.'],
      contact:['Relier un site ou une page de présentation','Les moyens de contact contrôlés sont renseignés.','Un moyen de contact reste à compléter.'],
      categoriePrincipale:['Préciser votre activité principale','La catégorie principale correspond à votre activité.','La catégorie principale mérite une vérification.'],
      categoriesSecondaires:['Compléter vos catégories secondaires','Des catégories secondaires pertinentes sont définies.','Les catégories secondaires sont absentes ou incomplètes.'],
      attributs:['Renseigner les attributs utiles','Les attributs de votre fiche sont renseignés.','Les attributs de votre fiche restent à compléter.'],
      nap:['Harmoniser vos coordonnées','Les coordonnées contrôlées sont cohérentes.','Les coordonnées de la fiche et du site présentent des différences.'],
      nomConforme:['Vérifier le nom affiché','Le nom affiché correspond au nom réel de votre entreprise.','Le nom affiché nécessite une vérification.'],
      logoCouverture:['Compléter votre identité visuelle','Le logo et la photo de couverture sont présents.','Votre identité visuelle reste à compléter.'],
      nombrePhotos:['Enrichir votre galerie photo','Votre galerie présente des photos.','Votre galerie peut être enrichie.'],
      photoRecente:['Actualiser vos photos','Une photo récente est visible sur votre fiche.','Votre galerie mérite une actualisation.'],
      varietePhotos:['Diversifier vos photos','Vos photos montrent différents aspects de votre activité.','Les types de photos présentés sont peu variés.'],
      qualitePhotos:['Améliorer vos photos','Les photos répondent aux critères de qualité contrôlés.','Les photos ne répondent pas à tous les critères de qualité contrôlés.'],
      noteMoyenne:['Renforcer la satisfaction de vos clients','Votre note est un point d’appui.','Votre note mérite une attention particulière.'],
      volumeAvis:['Développer les avis authentiques','Votre volume d’avis est un point d’appui.','Votre volume d’avis peut être développé.'],
      recenceAvis:['Solliciter des avis récents','Un avis récent est visible sur votre fiche.','Le dernier avis visible date de plus d’un mois.'],
      tauxReponseAvis:['Répondre aux avis de vos clients','Vous répondez à la plupart des avis contrôlés.','Vous répondez rarement ou jamais aux avis contrôlés.'],
      qualiteReponsesAvis:['Personnaliser vos réponses aux avis','Les réponses répondent aux critères de qualité contrôlés.','Les réponses peuvent être davantage personnalisées.'],
      descriptionQualite:['Préciser votre présentation','La description répond aux critères de qualité contrôlés.','La description peut mieux présenter votre activité.'],
      servicesPresents:['Présenter vos services','Les services sont présentés sur votre fiche.','Les services sont absents ou incomplets sur votre fiche.'],
      servicesDecrits:['Décrire vos services','Les descriptions expliquent vos services.','Les descriptions de vos services restent à compléter.'],
      questionsReponses:['Répondre aux questions fréquentes','La rubrique Questions/Réponses est alimentée.','La rubrique Questions/Réponses reste à compléter.'],
      liensAction:['Ajouter les liens d’action utiles','Les liens d’action ont été vérifiés selon votre activité.','Les liens d’action utiles sont manquants.'],
      publicationRecente:['Publier une actualité','Une actualité récente est visible sur votre fiche.','Aucune publication récente n’a été relevée.'],
      rythmePublication:['Régulariser vos publications','Des publications régulières ont été relevées.','Le rythme de publication reste à renforcer.'],
      classementLocal:['Suivre votre visibilité','Votre fiche est visible dans les résultats du test.','Votre fiche est moins visible sur cette recherche.'],
      revendiquee:['Vérifier la gestion de votre fiche','Le statut de gestion de la fiche a été vérifié.','Le statut de gestion nécessite une vérification.'],
      adresse:['Vérifier les informations de localisation','Les informations de localisation contrôlées sont conformes.','Les informations de localisation contrôlées nécessitent une correction.']
    };
    const wording=o=>{
      const value=o.evidence.observedValue, t=templates[o.key];
      if(o.key==='nap'&&o.evidence.siteState?.etat==='inaccessible'){
        const issue=o.evidence.siteState.problemeTechnique;
        return issue==='dns'?'Le site officiel était inaccessible lors de notre contrôle. La vérification indique un problème de configuration DNS.':issue==='erreur_serveur'?'Le site officiel renvoie actuellement une erreur serveur.':'Le site officiel était inaccessible lors de notre contrôle.';
      }
      if(o.key==='noteMoyenne'&&typeof value==='number'){
        const average=model.benchmark.metrics.note.mean;
        return average===null?`Note de ${format(value)}/5.`:`Note de ${format(value)}/5, ${value>average?'au-dessus de':'contre'} la moyenne du panel (${format(average)}).`;
      }
      if(o.key==='volumeAvis'&&typeof value==='number'){
        const median=model.benchmark.metrics.avis.median;
        return median===null?`${format(value)} avis.`:`${format(value)} avis, contre ${format(median)} pour la fiche médiane.`;
      }
      if(o.key==='tauxReponseAvis'){
        const counts=o.evidence.reviewCounts;
        if(Number.isInteger(counts?.total)&&counts.total>0&&Number.isInteger(counts.unanswered)&&counts.unanswered>=0&&counts.unanswered<=counts.total)return counts.complete?`${counts.unanswered} de vos ${counts.total} avis sans réponse.`:`Sur les ${counts.total} avis examinés, ${counts.unanswered} restent sans réponse.`;
        if(/^(?:jamais|aucune réponse visible(?: aux avis récents)?)$/i.test(String(value).trim()))return 'Aucune réponse visible aux avis récents.';
        return o.status==='ok'?'Vous répondez aux avis récents.':'Des avis récents restent sans réponse.';
      }
      if(o.key==='classementLocal'&&typeof value==='number')return `Résultat observé au rang ${format(value)} lors du test.`;
      if(o.key==='nombrePhotos'&&typeof value==='number')return `${format(value)} photos visibles sur votre fiche.`;
      if(o.key==='descriptionRemplie')return value===0||value==='Vide'?templates.descriptionRemplie[2]:typeof value==='number'?`Votre description comporte ${format(value)} caractères.`:o.status==='ok'?templates.descriptionRemplie[1]:'Votre description est courte : précisez vos services et votre zone d’intervention.';
      if(o.key==='horaires'&&/horaires habituels non renseignés/i.test(String(value)))return 'Aucun horaire n’est affiché sur votre fiche.';
      if(o.key==='contact'&&/site/i.test(o.evidence.field)&&/non renseigné|absent/i.test(String(value)))return 'Aucun lien vers un site n’est renseigné.';
      if(o.evidence.operatorAnswer&&o.evidence.period&&['recenceAvis','photoRecente'].includes(o.key))return `${o.key==='recenceAvis'?'L’avis le plus récent':'La photo la plus récente'} date de ${String(value).toLocaleLowerCase('fr-FR')}.`;
      return t?.[o.status==='ok'?1:2]||'Ce point a été contrôlé sur votre fiche.';
    };
    const finding=(o,id)=>text(id,wording(o),o.evidence,o.status==='ok'?'positive':'negative');
    const support=(o,id)=>{
      const value=o.evidence.observedValue, metrics=model.benchmark.metrics;
      if(o.key==='noteMoyenne'&&typeof value==='number'&&metrics.note.mean!==null&&value>metrics.note.mean)return text(id,'Note supérieure à la moyenne locale',o.evidence,'positive','rating-above');
      const median=metrics.avis.median,ratio=median>0?Math.round(value/median):0;
      if(o.key==='volumeAvis'&&typeof value==='number'&&ratio>=2)return text(id,`Près de ${ratio} fois plus d'avis que la fiche médiane`,o.evidence,'positive','review-ratio');
      // No invented ratio when the panel is absent, zero or not sufficiently different.
      return text(id,o.key==='volumeAvis'?'Des avis clients pour éclairer les prospects':o.key==='noteMoyenne'?'Une note visible pour vos prospects':wording(o),o.evidence,'positive', ['volumeAvis','noteMoyenne'].includes(o.key)?'metric-visible':null);
    };
    const diagnosticDate=E.clientDate(identity.diagnosticDate||searchTest.observedAt);
    const remaining=Math.max(0,model.counts.ko+model.counts.warn-model.priorities.length);
    const whatsappNumber=String(contact.whatsapp||'').replace(/[+\s]/g,'');
    const whatsapp=/^[1-9]\d{6,14}$/.test(whatsappNumber)?`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Bonjour, j'ai reçu le Diagnostic Efficia pour ${identity.company||'votre entreprise'} et j'ai une question.`).replace(/'/g,'%27')}`:null;
    const footer=i=>`<div class="pied"><span>Efficia Digital — Diagnostic Efficia™</span><span class="pagination-rapport">Page ${i}/3</span></div>`;
    const page=(i,cls,title,body)=>`<div class="page report-v3 report-v4 report-client-v4 ${cls}" data-report-page="${i}">${header()}<div class="chapitre">Étape ${i} · Diagnostic Efficia™</div><h1 class="rapport-title">${title}</h1>${body}${footer(i)}</div>`;
    const good=model.observations.filter(o=>o.status==='ok').sort((a,b)=>['volumeAvis','noteMoyenne'].indexOf(b.key)-['volumeAvis','noteMoyenne'].indexOf(a.key)).slice(0,2),bad=(model.priorities.length?model.priorities:model.observations.filter(o=>['warn','ko'].includes(o.status))).slice(0,2);
    const confirmed=E.organicConfirmationMatches(searchTest);
    const rankLine=Number.isInteger(searchTest.rank)&&searchTest.rank>0?`${searchTest.rank===1?'1er':searchTest.rank+'e'} résultat sur « ${searchTest.query||'recherche non renseignée'} »`:'Votre fiche Google en un regard';
    const stats=model.benchmark;
    const rows=[['Note','note','mean',identity.facts?.Note],['Nombre d’avis','avis','median',identity.facts?.['Nombre d’avis']],['Photos','photos','mean',identity.facts?.Photos]];
    let html=page(1,'page-hero',text('page1.title','Votre situation'),`
      <p class="rapport-subtitle">${escape(identity.company)}${identity.activity?' — '+escape(identity.activity):''}${identity.city?' · '+escape(identity.city):''}</p>
      <p class="diagnostic-context">${text('page1.search_context',`Diagnostic réalisé le ${diagnosticDate} · Recherche « ${searchTest.query||'non renseignée'} » centrée sur ${searchTest.location||identity.city||'un lieu non renseigné'}`)}</p>
      <section class="v3-situation"><div>${gauge(score)}</div><div class="v3-verdict">${confirmed&&model.profile.code!=='indeterminate'?`<span class="profile-badge" style="color:${model.profile.color}">Profil ${escape(model.profile.code)}</span>`:''}<h2>${text('page1.verdict_title',confirmed?model.profile.verdict:rankLine)}</h2><p class="hero-analysis-text">${text('summary.general',(identity.contact?'Bonjour '+identity.contact+', ':'')+'Voici les points d’appui de votre fiche et les actions à privilégier.')}</p></div></section>
      <section class="v3-signals"><div><h2>${text('page1.strengths_heading','Vos points d’appui')}</h2>${good.map((o,i)=>`<p class="v3-signal v3-signal--ok"><span>${support(o,`page1.strength.${i+1}`)}</span></p>`).join('')||'<p>Les points d’appui restent à préciser.</p>'}</div><div><h2>${text('page1.weaknesses_heading','Les points à améliorer')}</h2>${bad.map((o,i)=>`<p class="v3-signal"><span>${finding(o,`page1.weakness.${i+1}`)}</span></p>`).join('')||'<p>Les actions restent à préciser.</p>'}</div></section>
      <table class="evidence-table"><thead><tr><th>Indicateur</th><th>Votre fiche</th><th>Repère</th></tr></thead><tbody>${rows.map(([label,k,op,value])=>`<tr><td>${label}</td><td>${escape(format(value))}</td><td>${stats.metrics[k].provided?`${escape(format(stats.metrics[k][op]))}<small>Médiane fournie · effectif non renseigné</small>`:stats.metrics[k].count?`${escape(format(stats.metrics[k][op]))}<small>${op==='median'?'Médiane':'Moyenne'} des ${stats.metrics[k].count} fiches</small>`:'Non disponible'}</td></tr>`).join('')}</tbody></table>
      <p class="comparison-caption">${text('page1.comparison_note',Number.isInteger(stats.count)?`Comparaison indicative sur ${stats.count} fiches proches.`:'Comparaison indicative avec les repères disponibles.')}</p>`);
    // Editorial sector terminology is independent of the scoring profile.
    const sector=C.responseSectors.find(s=>s.activity.test(identity.activity||''));
    const service=sector?.service||C.responseDefaultService;
    const action=o=>o.key==='nap'&&o.evidence.siteState?.etat==='inaccessible'?'Faites vérifier le fonctionnement du site par votre prestataire, puis testez le lien depuis votre fiche Google.':o.key==='descriptionRemplie'?'Présentez vos services et votre zone d’intervention en quelques phrases.':o.key==='horaires'?'Renseignez vos horaires habituels et ceux des jours fériés.':'Complétez ce point avec les informations à jour de votre entreprise.';
    const compact=o=>o.key==='descriptionRemplie'&&(o.evidence.observedValue===0||o.evidence.observedValue==='Vide')?'Aucune description : présentez vos services et votre zone d’intervention en quelques phrases.':o.key==='horaires'&&/horaires habituels non renseignés/i.test(String(o.evidence.observedValue))?'Aucun horaire affiché : renseignez vos horaires habituels et ceux des jours fériés.':`${wording(o)} ${action(o)}`;
    const priorities=model.priorities.map((o,i)=>`<article data-priority-key="${escape(o.key)}" class="v5-priority ${i===0?'priority-expanded':'priority-short'}"><div class="v3-eyebrow">${i+1} · ${o.priority.label}</div><h2>${text(`priority.${i+1}.title`,(o.key==='nap'&&o.evidence.siteState?.etat==='inaccessible'?'Rétablir l’accès à votre site':templates[o.key]?.[0])||'Compléter cet élément de votre fiche')}</h2>${i===0?`<p>${finding(o,'priority.1.observation')}</p>${o.key==='tauxReponseAvis'?`<p>${text('priority.1.why','Les prospects lisent vos réponses autant que les avis. Répondre montre que vous êtes disponible et attentif, et prend moins de deux minutes par avis.')}</p><p>${text('priority.1.first_action',`Commencez par les plus récents ; personnalisez chaque réponse avec le prénom et le ${service}.`)}</p><aside class="reply-examples"><b>Exemple de réponse</b><p><b>Avis positif :</b> ${text('priority.1.example.positive',`Merci beaucoup [Prénom] pour votre avis ! Nous sommes ravis que le résultat de votre [${service}] vous plaise. Au plaisir de vous accompagner pour vos prochains travaux. — [Signataire], ${identity.company||'[Entreprise]'}`)}</p><p><b>Avis mitigé :</b> ${text('priority.1.example.mixed',`Bonjour [Prénom], merci pour votre retour. Nous regrettons que [point soulevé]. N'hésitez pas à nous appeler au [téléphone] pour en parler. — [Signataire], ${identity.company||'[Entreprise]'}`)}</p></aside>`:`<p>${text('priority.1.first_action',action(o))}</p>`}`:`<p class="priority-compact-copy">${text(`priority.${i+1}.observation`,compact(o),o.evidence,'negative')}</p>`}</article>`).join('');
    html+=page(2,'page-reading',text('page2.title','Lecture du score et vos priorités'),`
      <section class="v3-score-lines domain-grid">${domains.map(d=>`<div class="evidence-domain"><b>${escape(d.label)} <span>${d.points===null?'Non évalué':escape(format(d.points))+'/'+escape(format(d.maximum))}</span></b><div class="v3-bar"><i style="width:${d.maximum>0?Math.max(0,Math.min(100,100*d.points/d.maximum)):0}%"></i></div><small>${escape(C.compactDomains[d.key]||'Critères évalués dans ce domaine.')}</small></div>`).join('')}</section>
      <p class="checks-line"><b>Ce que nous avons vérifié</b> — ${model.counts.total} contrôles, ${model.counts.ok} conformes, ${model.counts.warn} à renforcer, ${model.counts.ko} défauts observés.</p>
      ${priorities||'<p>Les actions prioritaires restent à préciser.</p>'}
      ${remaining>=1?`<aside class="audit-teaser"><strong>${text('page2.teaser_title',`${remaining} autres points à corriger ont été identifiés sur votre fiche.`)}</strong> ${text('page2.teaser_copy',"Ils sont détaillés, classés et accompagnés des corrections recommandées dans l'Audit complet.")}</aside>`:''}`);
    html+=page(3,'page-offres',text('page6.title','Choisir la suite'),`
      <p class="v3-solution-lead">${text('conclusion.commercial','Choisissez un plan d’action à appliquer vous-même ou faites réaliser les optimisations par Efficia.')}</p>
      <section class="v3-offer-grid"><article class="v3-offer"><span class="v3-offer-tag">À appliquer vous-même</span><h2>Audit complet Google Business</h2><div class="offer-price">99 € <small>TTC</small></div><p>${text('page6.audit_description','Analyse approfondie, recommandations personnalisées et plan d’action complet.')}</p><ul><li>Benchmark et priorités détaillées</li><li>Textes et corrections recommandés</li><li>Vérifications à mener dans le compte</li></ul><p class="offer-note">Les 99 € de l’audit sont déduits du Pack Visibilité ou Performance commandé dans les 30 jours suivant l’achat de l’audit, pour la même entreprise et la même fiche. Contactez-nous avant le paiement du pack pour recevoir une facture avec la déduction.</p>${payment('audit')}</article>
      <article class="v3-offer v3-offer--pack"><span class="v3-offer-tag">Optimisations réalisées par Efficia</span><h2>Pack Visibilité Google</h2><div class="offer-price">349 € <small>TTC</small></div><p>${text('page6.pack_description','Audit inclus, description, services et catégories retravaillés selon votre activité, puis validation avant publication.')}</p><ul><li>Optimisations de la fiche et outils de suivi des avis</li><li>QR code pour faciliter la demande d’avis authentiques</li><li>Paiement unique, sans abonnement</li></ul><p class="offer-note"><strong>${text('page6.pack_priorities',`Les ${model.priorities.length} priorités identifiées dans ce diagnostic font partie des optimisations incluses.`)}</strong> ${text('page6.after_pack','Votre seule tâche : nous transmettre quelques informations, puis valider.')}</p>${payment('pack')}</article></section>
      <section class="after-order"><p><strong>Après votre commande — Audit</strong> : ${text('page6.after_audit','Vous recevez votre rapport complet sous 5 jours ouvrables.')}</p><p><strong>Après votre commande — Pack</strong> : ${text('page6.after_order_pack','Nous préparons les optimisations, puis nous vous les soumettons pour validation avant toute publication.')}</p></section>
      <p class="report-contact"><strong>Diagnostic réalisé par l'équipe Efficia Digital</strong> · Une question ? ${whatsapp?`Répondez simplement à l'e-mail ou écrivez-nous sur <a data-pdf-link="whatsapp" href="${escape(whatsapp)}">WhatsApp</a>.`:"Répondez simplement à l'e-mail."}</p>
      <p class="v3-legal">${text('page6.legal',`Ce Diagnostic Efficia™ est offert, sans engagement. Les constats reposent sur l'état public de votre fiche Google Business au ${diagnosticDate}, et sur des données publiques de fiches concurrentes de votre zone. Efficia Digital n'est pas affilié à Google. Conformément à notre charte : aucun faux avis, uniquement des optimisations conformes aux règles Google. Aucun classement, nombre d'avis ou résultat commercial n'est garanti.`)}</p>`);
    const errors=E.lintDiagnosticText(blocks,{counts:model.counts,benchmark:model.benchmark});
    // Include client identity, benchmark and header text; URLs in link targets stay internal.
    errors.push(...E.lintDiagnosticText([{id:'client-surface',kind:'copy',text:html.replace(/<[^>]*>/g,' ')}]).filter(error=>['technical-client-copy','defensive-client-copy'].includes(error.rule)));
    // New factual assertions in non-evidence copy must be explicitly re-evidenced too.
    for(const b of blocks.filter(b=>b.edited&&b.kind==='copy')){
      if(/\d|(?:est|sont|reste|restent|avez).{0,40}(?:absen|manqu|incomplet|parfait|insuffisant)|perdez.{0,20}clients|première place|classé|classée/i.test(b.text))errors.push({blockId:b.id,rule:'unsupported-edit',correction:'Rétablir le texte automatique ou rattacher ce constat à une preuve dans les données du diagnostic.'});
    }
    return {html,blocks,errors};
  }
  root.EfficiaDiagnosticReport={renderDiagnostic};
})(globalThis);
