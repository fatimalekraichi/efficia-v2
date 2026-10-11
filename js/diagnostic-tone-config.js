/* Editorial settings only. The scoring grid and its weights live elsewhere. */
(function(root){
  'use strict';
  const config = {
    version: 'diagnostic-evidence-v1',
    profiles: {
      A:{max:1,color:'#15803d',heading:'Points à consolider',verdict:'Votre fiche est en tête sur cette recherche. Voici ce qui peut consolider cette avance.'},
      B:{max:3,color:'#2563eb',heading:'Points à renforcer',verdict:'Votre fiche est bien positionnée sur la recherche testée. Voici les éléments de présentation à renforcer.'},
      C:{max:10,color:'#c2410c',heading:'Points à améliorer',verdict:'Votre fiche apparaît dans les résultats testés. Voici les points à améliorer pour compléter votre présence locale.'},
      D:{max:Infinity,color:'#b91c1c',heading:'Points à améliorer',verdict:'Votre fiche est peu visible sur la recherche testée. Voici les points observés à travailler.'},
      indeterminate:{color:'#64748b',heading:'Points observés',verdict:'Le classement ne peut pas être établi. Cette lecture porte uniquement sur les informations observées.'}
    },
    benchmark: {maxCompetitors:3, indicativeBelow:5, ratingMinimumReviews:3, majorityMinimum:2},
    priority: {behind:1.5, neutral:1, ahead:0.5, highMinimum:4, mediumMinimum:2, maximumDisplayed:3},
    labels: {certain:'Certain', partial:'Partiel', uncertain:'Incertain'},
    domains: {
      informations:'Identité, coordonnées, horaires et catégories observés.',
      photos:'Présence, quantité, variété, qualité et dates connues des photos.',
      avis:'Note, volume, dates connues et réponses aux avis observés.',
      contenu:'Description, services, réponses aux questions et liens observés.',
      activite:'Dates et fréquence documentées des publications Google.',
      visibilite:'Position dans la recherche testée et comparaison des fiches sélectionnées.'
    },
    responseSectors: [{activity:/peint(?:re|ure)/i,service:'chantier'}],
    responseDefaultService: 'prestation',
    compactDomains: {
      informations:'Identité, coordonnées et horaires.',
      photos:'Variété, qualité et récence, au-delà du nombre.',
      avis:'Note, volume et réponses aux avis.',
      contenu:'Description, services et liens.',
      activite:'Fréquence des publications.',
      visibilite:'Position dans la recherche testée.'
    },
    metricFields: {
      noteMoyenne:{field:'note', label:'Note', competitor:'note', statistic:'mean'},
      volumeAvis:{field:'nbAvis', label:'Nombre d’avis', competitor:'avis', statistic:'median'},
      nombrePhotos:{field:'nbPhotos', label:'Nombre de photos', competitor:'photos', statistic:'mean'},
      descriptionRemplie:{field:'descriptionLongueur', label:'Description', unit:'caractères'},
      servicesPresents:{field:'nbServices', label:'Nombre de services', competitor:'services', statistic:'mean'}
    },
    datedCriteria:{recenceAvis:'dernierAvis',photoRecente:'dernierePhoto',publicationRecente:'dernierePublication'},
    specificFieldsRequired:['contact','horaires','attributs','categoriesSecondaires'],
    preciseFields:{contact:['telephone','site','siteweb','siteinternet'],horaires:['horaireshabituels','horairesjoursferies','horairesdesjoursferies','horairesspeciaux']},
    lint: {
      placeholders: /\{\{[^}]+\}\}|\{(?:n|x|y|date|nombre|ville|entreprise)\}|\[(?:date|nombre|nom|ville|à compléter)\]|\b(?:TODO|Lorem ipsum|XXX)\b/i,
      template: /autres attributs applicables|\([^)]*ou autres[^)]*\)/i,
      jargon: /contrôle de récence|\bcheck(?:list)?\b/i,
      danglingPronoun: /^(?:Il|Elle|Ils|Elles)\b/,
      ambiguousFields: /(?:téléphone|site web|horaires|jours fériés|description|attributs)\s+ou\s+(?:téléphone|site web|horaires|horaires spéciaux|jours fériés|description|attributs)/i,
      rankingPromise: /prendre la (?:première|1re|1ère) place|passer de (?:deuxième|2e) à (?:premier|1er)|garanti.{0,25}(?:classement|progression)|dépasser le (?:1er|premier)|entrer dans le top\s*3/i
    }
  };
  root.EfficiaDiagnosticToneConfig = config;
})(globalThis);
