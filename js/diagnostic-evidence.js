(function(root){
  'use strict';
  const config = root.EfficiaDiagnosticToneConfig;
  const number = v => (typeof v==='number'||typeof v==='string'&&v.trim()!=='') && Number.isFinite(Number(v)) ? Number(v) : null;
  const date = v => {
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)||!Number.isFinite(Date.parse(v)))return null;
    const [y,m,d]=v.slice(0,10).split('-').map(Number);
    return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===v.slice(0,10)?v:null;
  };
  const median = values => {
    const xs=values.filter(v=>number(v)!==null).map(Number).sort((a,b)=>a-b);
    if(!xs.length)return null;
    const i=Math.floor(xs.length/2);return xs.length%2 ? xs[i] : (xs[i-1]+xs[i])/2;
  };
  function benchmarkStatistics(competitors=[]){
    const rows=(Array.isArray(competitors)?competitors:[]).filter(c=>c&&c.comparable!==false).slice(0,config.benchmark.maxCompetitors);
    const result={count:rows.length,metrics:{}};
    for(const field of ['note','avis','photos','services']){
      const known=rows.filter(c=>number(c[field])!==null && number(c[field])>=0);
      const values=known.map(c=>Number(c[field]));
      result.metrics[field]={count:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,median:median(values),
        weakRating:field==='note'&&known.some(c=>number(c.avis)===null||Number(c.avis)<config.benchmark.ratingMinimumReviews)};
    }
    return result;
  }
  function normalizeEvidence(record={}){
    const r=record&&typeof record==='object'?record:{};
    const value=r.observedValue??null;
    const usable=value!==null && value!==undefined && !(typeof value==='string'&&!value.trim());
    const source=typeof r.source==='string'?r.source.trim():'';
    const confidence=usable&&source&&!['not_retrieved','unavailable'].includes(r.availability)&&r.observed!==false&&['certain','partial'].includes(r.confidence)?r.confidence:'uncertain';
    return {criterionId:r.criterionId||'',field:r.field||'',observedValue:value,source,observedAt:date(r.observedAt),confidence,
      availability:r.availability|| (usable?'observed':'not_retrieved'),period:r.period||null,complete:r.complete===true,
      relevant:r.relevant===true,comparison:r.comparison||null,validatedText:r.validatedText||null,operatorAnswer:r.operatorAnswer===true,operator:r.operator||null,url:r.url||null,reviewCounts:r.reviewCounts||null,siteState:r.siteState?.etat==='inaccessible'?{etat:'inaccessible',problemeTechnique:['dns','erreur_serveur','incident_technique'].includes(r.siteState.problemeTechnique)?r.siteState.problemeTechnique:null}:null};
  }
  function competitiveFactor(evidence,comparison={}){
    const e=normalizeEvidence(evidence);
    if(e.confidence==='uncertain')return config.priority.neutral;
    if(comparison.clientAbove===true)return config.priority.ahead;
    const peers=(comparison.peers||[]).filter(p=>p&&p.comparable===true&&typeof p.satisfied==='boolean');
    const majority=peers.length>=config.benchmark.majorityMinimum&&peers.filter(p=>p.satisfied).length>peers.length/2;
    if(comparison.clientDefect===true && (comparison.leaderSatisfied===true || majority))return config.priority.behind;
    return config.priority.neutral;
  }
  function calculatePriority({missingPoints,normalizedDomainMaximum,rawDomainMaximum,evidence,comparison}={}){
    // Criterion points are raw grid points. Convert to their /100 contribution ONCE.
    const missing=number(missingPoints),max=number(normalizedDomainMaximum),raw=number(rawDomainMaximum);
    if(missing===null||missing<0||max===null||max<0||raw===null||raw<=0||normalizeEvidence(evidence).confidence==='uncertain')return null;
    const lost=missing*max/raw, factor=competitiveFactor(evidence,comparison), importance=lost*factor;
    return {missingWeightedPoints:lost,factor,importance,label:importance>=config.priority.highMinimum?'Priorité élevée':importance>=config.priority.mediumMinimum?'Priorité intermédiaire':'À renforcer'};
  }
  // `observed` alone does NOT certify exclusion of sponsored results (collectCompetitors).
  function isOrganicSearch(test={}){
    return organicConfirmationMatches(test)||test.positionKind==='organic'||test.positionKind==='observed'&&test.rankEvidence?.organicResultsOnly===true;
  }
  function organicConfirmationMatches(test={}){
    const p=test.organicConfirmation;
    return Boolean(p?.confirmed===true&&p.confidence==='certain'&&Boolean(date(p.observedAt))&&
      Boolean(test.query&&date(test.observedAt))&&number(test.rank)>0&&
      p.rank===test.rank&&p.query===test.query&&p.searchObservedAt===test.observedAt&&p.location===test.location&&p.observedAt.slice(0,10)>=test.observedAt.slice(0,10)&&p.observedAt.slice(0,10)<=new Date().toLocaleDateString('sv-SE')&&p.source);
  }
  function confirmOrganicRank(test={},confirmed=false,observedAt=null){
    return {confirmed:confirmed===true,confidence:confirmed&&date(observedAt)?'certain':'uncertain',
      observedAt:date(observedAt),source:"Fiche Google publique consultée par l'opérateur",operator:'Opérateur',
      field:'rang organique',observedValue:test.rank??null,rank:test.rank,query:test.query,
      searchObservedAt:test.observedAt,location:test.location};
  }
  function searchLocation(actual,anchor){
    if(typeof actual==='string'&&actual.trim())return actual.trim();
    return anchor?.locality?.city||anchor?.label||null;
  }
  function clientDate(value){
    const d=date(value);return d?d.slice(0,10).split('-').reverse().join('/'):'non renseignée';
  }
  function operatorEvidence({criterionId,field,answer,observedAt,operator='Opérateur',url=null}={}){
    if(!answer||answer==='Non vérifiable')return normalizeEvidence({criterionId,field,availability:'not_retrieved'});
    const interval=/\d+\s*(?:à|-)|moins|plus|jusqu|ou moins|partiel|une partie|rarement|incompl|douteux|un seul/i.test(answer);
    return {...normalizeEvidence({criterionId,field:field||criterionId,observedValue:answer,
      source:"Fiche Google publique consultée par l'opérateur",observedAt,confidence:interval?'partial':'certain',
      relevant:true,period:interval?{kind:'operator_interval',label:answer}:null}),operator,url,operatorAnswer:true};
  }
  function classifyProfile(listing={},competitors=[],searchTest={}){
    const rank=number(searchTest.rank ?? listing.position);
    const documented=Boolean(searchTest.rankConfirmed===true || searchTest.query && date(searchTest.observedAt));
    const observed=documented && isOrganicSearch(searchTest) && Number.isInteger(rank) && rank>0;
    let code='indeterminate';
    if(observed)code=['A','B','C','D'].find(k=>rank<=config.profiles[k].max);
    else if(documented && searchTest.absenceConfirmed===true && searchTest.scope)code='D';
    const unclassifiedRank=code==='indeterminate'&&documented&&Number.isInteger(rank)&&rank>0;
    return {code,...config.profiles[code],...(unclassifiedRank?{verdict:rank===1?'Votre fiche apparaît en tête dans les résultats observés. Le type de classement reste à confirmer.':'Votre fiche est visible sur cette recherche. Le type de classement reste à confirmer.'}:{}),rank:observed?rank:null};
  }
  function leaderForSearch(competitors=[],searchTest={}){
    // Rank must be explicit; order in the input array is never ranking evidence.
    if(!Array.isArray(competitors)||!searchTest.query||!date(searchTest.observedAt))return null;
    return competitors.find(c=>c.rank===1 && c.positionKind==='organic' && c.query===searchTest.query &&
      c.observedAt===searchTest.observedAt && c.location===searchTest.location && c.comparable===true) || null;
  }
  function buildDiagnosticModel({listing={},competitors=[],searchTest={},controls=[],referenceSummary=null}={}){
    competitors=(Array.isArray(competitors)?competitors:[]).slice(0,config.benchmark.maxCompetitors);
    controls=Array.isArray(controls)?controls:[];
    const profile=classifyProfile(listing,competitors,searchTest), benchmark=benchmarkStatistics(competitors);
    if(!benchmark.count && referenceSummary?.source && number(referenceSummary.avisMedian)!==null){
      benchmark.count=null;
      benchmark.metrics.avis={...benchmark.metrics.avis,median:Number(referenceSummary.avisMedian),provided:true};
    }
    const leader=leaderForSearch(competitors,searchTest);
    controls=controls.filter((c,i,all)=>all.findIndex(other=>other.key===c.key)===i);
    const counts={total:controls.length,ok:0,warn:0,ko:0,unknown:0};
    const observations=controls.map(c=>{
      const evidence=normalizeEvidence(c.evidence);
      const status=evidence.confidence==='uncertain'?'unknown':(['ok','warn','ko'].includes(c.status)?c.status:'unknown');
      counts[status]++;
      return {...c,evidence,status};
    });
    const candidates=observations.filter(c=>['warn','ko'].includes(c.status)&&c.actionable!==false).map(c=>{
      const metric=config.metricFields[c.key], val=number(c.evidence.observedValue);
      const reference=metric?.competitor?benchmark.metrics[metric.competitor]?.[metric.statistic]:null;
      const comparable=metric && c.evidence.comparison?.comparable===true;
      const comparison=comparable?{clientAbove:val!==null&&reference!==null&&val>reference,clientDefect:true,
        leaderSatisfied:leader?.criteria?.[c.key]?.satisfied===true,
        peers:competitors.map(p=>({comparable:p.criteria?.[c.key]?.comparable===true,satisfied:p.criteria?.[c.key]?.satisfied}))}:{};
      return {...c,priority:calculatePriority({...c,evidence:c.evidence,comparison})};
    }).filter(c=>c.priority && c.priority.importance>0);
    // Stable tie break: criterion key. A superior review volume is never a high priority by itself.
    candidates.forEach(c=>{if(c.key==='volumeAvis'&&c.priority.factor===config.priority.ahead)c.priority.label='À renforcer';});
    candidates.sort((a,b)=>b.priority.importance-a.priority.importance||a.key.localeCompare(b.key));
    const priorities=candidates.slice(0,config.priority.maximumDisplayed);
    const gaps=profile.code==='B'&&leader ? Object.entries(config.metricFields).flatMap(([key,m])=>{
      const a=number(listing[m.field]),b=number(leader[m.competitor]);
      return leader.criteria?.[key]?.comparable===true && a!==null && b!==null && a<b ? [{key,label:m.label,client:a,leader:b}]:[];
    }).slice(0,2):[];
    return {profile,benchmark,leader,gaps,counts,observations,priorities,remainingControls:counts.warn+counts.ko-priorities.length};
  }
  function lintDiagnosticText(blocks=[],context={}){
    const errors=[];
    const add=(b,rule,correction)=>errors.push({blockId:b.id||'sans-identifiant',rule,correction});
    const facts=[];
    for(const b of blocks){
      const text=String(b.text||'').replace(/<[^>]*>/g,' ').trim();
      if(/https?:\/\/|www\.|\b\d{4}-\d{2}-\d{2}(?:T\S*)?|Donnée renseignée dans le diagnostic|Observation partielle|\b(?:Partiel|Certain)\b|:\s*0(?:\D|$)/i.test(text))add(b,'technical-client-copy','Retirer les détails techniques du texte client ; les conserver dans la preuve interne.');
      if(/absences de données ne valent pas zéro|ajustés seulement lorsqu[’']une comparaison est documentée|le classement des actions ne modifie pas le score|données non vérifiables ne constituent pas des défauts|profil indéterminé|type de classement.{0,15}confirmer|\bannonces?\b/i.test(text))add(b,'defensive-client-copy','Garder cette explication dans le back-office.');
      if(b.evidence?.criterionId==='tauxReponseAvis'&&/\bou\b|contrôlés/i.test(text))add(b,'review-response-copy','Employer un constat direct sans alternative ni jargon de contrôle.');
      if(config.lint.placeholders.test(text))add(b,'placeholder','Remplacer la valeur provisoire par une donnée vérifiée.');
      if(config.lint.template.test(text))add(b,'template','Nommer uniquement les éléments réellement concernés.');
      if(config.lint.rankingPromise.test(text))add(b,'ranking-promise','Décrire une optimisation, sans promettre un classement.');
      if(b.kind==='finding'){
        const e=normalizeEvidence(b.evidence);
        if(typeof e.observedValue==='string' && /absen|manquant|non renseigné/i.test(e.observedValue) && /\b(?:présent|présents|complet|complets|renseigné|renseignés)\b/i.test(text) && !/absen|manquant|non renseigné|incomplet/i.test(text))add(b,'contradictory-value','Le texte contredit l’absence documentée de ce champ.');
        if(b.edited && !b.reviewed) add(b,'unverified-edit','Vérifier ce texte contre la preuve et enregistrer sa validation, ou rétablir le texte automatique.');
        facts.push({...b,e});
        if(typeof e.observedValue==='number'){
          const values=(text.match(/\d+(?:[.,]\d+)?/g)||[]).map(v=>Number(v.replace(',','.')));
          const metric=config.metricFields[e.criterionId];
          const reference=metric?.competitor?context.benchmark?.metrics?.[metric.competitor]?.[metric.statistic]:null;
          const supportedReference=reference===null||reference===undefined?null:Number(reference.toFixed(1));
          const ratio=reference>0?Math.round(e.observedValue/reference):0;
          const verifiedComparison=(b.comparison==='rating-above'&&e.criterionId==='noteMoyenne'&&reference!==null&&e.observedValue>reference&&text==='Note supérieure à la moyenne locale')||
            (b.comparison==='review-ratio'&&e.criterionId==='volumeAvis'&&ratio>=2&&text===`Près de ${ratio} fois plus d'avis que la fiche médiane`)||
            (b.comparison==='metric-visible'&&e.observedValue>0&&((e.criterionId==='volumeAvis'&&text==='Des avis clients pour éclairer les prospects')||(e.criterionId==='noteMoyenne'&&text==='Une note visible pour vos prospects')));
          if(!verifiedComparison&&(e.observedValue!==0||!/aucun|aucune|vide|absence/i.test(text))&&(!values.includes(e.observedValue)||values.some(v=>v!==e.observedValue&&v!==supportedReference&&!(e.criterionId==='noteMoyenne'&&e.observedValue<=5&&v===5))))add(b,'unsupported-value','Conserver uniquement la valeur observée dans ce constat.');
          if(e.observedValue>0&&/absen|aucun|aucune|non renseigné/i.test(text))add(b,'contradictory-value','Le champ mesuré n’est pas absent : corriger ce constat.');
        }

        if(e.confidence==='uncertain'||!e.field)add(b,'missing-evidence','Renseigner une observation et sa source ou retirer ce constat.');
        if(config.lint.ambiguousFields.test(text))add(b,'ambiguous-fields','Séparer les champs et garder seulement celui qui est observé.');
        if(config.lint.jargon.test(text))add(b,'internal-jargon','Remplacer le jargon par le fait observé.');
        if(config.lint.danglingPronoun.test(text))add(b,'dangling-pronoun','Nommer le sujet en début de constat.');
        if(e.confidence==='certain'&&/\bsemble(?:nt)?\b/i.test(text))add(b,'certainty','Affirmer seulement le fait confirmé.');
        if(b.subject==='client'&&/note moyenne/i.test(text))add(b,'client-rating-label','Utiliser « Votre note » pour la fiche du client.');
        if(e.availability==='not_retrieved'||e.availability==='unavailable')add(b,'unretrieved-field','Ne pas transformer une donnée inaccessible en défaut.');
        if(/sur (?:les )?(?:12|douze) derniers mois/i.test(text)&&(!e.complete||!e.period))add(b,'partial-period','Ne pas présenter un échantillon comme un total annuel.');
      }
    }
    for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){
      const a=facts[i],b=facts[j];
      if(a.e.criterionId&&a.e.criterionId===b.e.criterionId&&a.e.field===b.e.field&&a.polarity&&b.polarity&&a.polarity!==b.polarity)
        add(b,'contradiction',`Réconcilier ce constat avec le bloc ${a.id} portant sur le même champ.`);
    }
    if(context.counts){
      const c=context.counts;
      if(c.total!==c.ok+c.warn+c.ko+c.unknown)add({id:'counts'},'inconsistent-counts','Recalculer les totaux depuis les contrôles distincts.');
    }
    return errors;
  }
  root.EfficiaDiagnosticEvidence={organicConfirmationMatches,confirmOrganicRank,isOrganicSearch,searchLocation,clientDate,operatorEvidence,number,date,median,benchmarkStatistics,normalizeEvidence,competitiveFactor,calculatePriority,classifyProfile,leaderForSearch,buildDiagnosticModel,lintDiagnosticText};
})(globalThis);
