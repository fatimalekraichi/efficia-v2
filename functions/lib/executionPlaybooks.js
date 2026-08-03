const PLAYBOOKS = {
  restaurant: {
    labels: ["restaurant", "brasserie", "café", "bistro", "traiteur"],
    photoSubjects: [
      "Façade et enseigne", "Entrée depuis la rue", "Salle dans son état réel",
      "Espace extérieur, s’il existe", "Un plat réellement proposé", "Un dessert réellement proposé",
      "Une boisson réellement proposée", "Une table dressée", "L’équipe avec son accord",
      "Une étape réelle de préparation", "Ambiance pendant le service", "Un détail distinctif à confirmer",
    ],
    descriptionFields: ["type de cuisine à confirmer", "spécialités à confirmer", "ambiance ou expérience à confirmer", "localisation", "services disponibles uniquement s’ils sont vérifiés", "modalités de réservation ou de vente uniquement si elles sont connues"],
  },
  artisan: {
    labels: ["électric", "plomb", "chauff", "toitur", "peintre", "menuis", "artisan", "construction"],
    photoSubjects: [
      "Véhicule professionnel, s’il existe", "Équipe, si elle peut être photographiée", "Intervention réelle avant travaux, si disponible",
      "Intervention en cours", "Résultat terminé", "Matériel réellement utilisé",
      "Détail technique visible", "Protection et préparation du chantier", "Intervention réelle",
      "Résultat final en plan large", "Signalétique professionnelle", "Élément de réassurance vérifié",
    ],
    descriptionFields: ["activité principale", "installations ou interventions réellement réalisées", "zone desservie à confirmer", "type de clientèle à confirmer", "qualification uniquement si elle est vérifiée", "modalité de prise de contact"],
  },
  garage: {
    labels: ["garage", "automobile", "pneu", "carrosserie", "mécani"],
    photoSubjects: [
      "Façade et accès", "Zone d’accueil, si elle existe", "Atelier en activité, s’il peut être photographié", "Équipe, si elle peut être photographiée",
      "Équipement réellement utilisé", "Véhicule avant intervention", "Intervention en cours",
      "Résultat après intervention", "Détail technique", "Zone d’attente, si elle existe",
      "Signalétique et horaires", "Élément de réassurance vérifié",
    ],
  },
  liberal: {
    labels: ["avocat", "comptable", "architecte", "consultant", "notaire", "profession libérale"],
    photoSubjects: [
      "Façade ou entrée", "Accueil, s’il existe", "Bureau ou espace de travail accessible", "Salle de rendez-vous, si elle existe",
      "Équipe, si elle peut être photographiée", "Portrait professionnel", "Espace de travail réel",
      "Signalétique", "Accès au bâtiment", "Équipement de travail non confidentiel",
    ],
    descriptionFields: ["activité principale", "domaines d’accompagnement vérifiés", "type de clientèle à confirmer", "localisation", "méthode de prise de rendez-vous vérifiée", "élément différenciant à confirmer"],
  },
  health: {
    labels: ["médecin", "dentiste", "kiné", "santé", "cabinet médical", "pharmacie"],
    photoSubjects: [
      "Façade ou entrée", "Accueil", "Salle d’attente vide", "Cabinet sans patient",
      "Équipe avec son accord", "Portrait professionnel", "Signalétique", "Accès au bâtiment",
      "Équipement non sensible", "Information pratique vérifiée",
    ],
  },
  local_shop: {
    labels: ["magasin", "boutique", "commerce", "fleuriste", "boulanger", "coiffeur"],
    photoSubjects: [
      "Façade et enseigne", "Vitrine actuelle", "Entrée", "Vue générale de l’espace",
      "Équipe avec son accord", "Produit réellement vendu", "Présentation d’un rayon réel",
      "Détail de mise en scène", "Caisse ou accueil", "Accès et stationnement à confirmer",
      "Ambiance réelle", "Information pratique vérifiée",
    ],
    descriptionFields: ["catégories principales de produits", "clientèle visée à confirmer", "localisation", "services spécifiques vérifiés", "avantage différenciant à confirmer", "modalité de prise de contact"],
  },
  generic: {
    labels: [],
    photoSubjects: [
      "Façade et enseigne", "Entrée", "Espace d’accueil, s’il existe", "Équipe, si elle peut être photographiée",
      "Activité réelle en cours", "Équipement réellement utilisé", "Résultat réel",
      "Détail professionnel", "Signalétique", "Information pratique vérifiée",
    ],
    descriptionFields: ["activité principale à confirmer", "prestations ou produits vérifiés", "zone desservie à confirmer", "type de clientèle à confirmer", "élément différenciant à confirmer", "modalité de prise de contact"],
  },
};

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function detectExecutionSector(category) {
  const normalized = normalize(category);
  for (const [key, playbook] of Object.entries(PLAYBOOKS)) {
    if (key !== "generic" && playbook.labels.some((label) => normalized.includes(normalize(label)))) return key;
  }
  return "generic";
}

export function getExecutionPlaybook(category) {
  const sector = detectExecutionSector(category);
  return { sector, ...PLAYBOOKS[sector] };
}

export const EXECUTION_SIGNAL_PLAYBOOKS = {
  description: {
    outcome: "Publier une description complète et vérifiée.",
    owner: "dirigeant",
    metric: "clics vers le site",
    doneWhen: "La description approuvée est visible publiquement sur Google.",
    steps: ["Ouvrez votre fiche Google Business.", "Choisissez « Modifier le profil ».", "Ouvrez la rubrique consacrée à la description.", "Copiez le texte approuvé dans ce rapport.", "Relisez chaque information factuelle.", "Publiez puis vérifiez l’affichage depuis Google Search ou Maps."],
  },
  photos: {
    outcome: "Préparer une série cohérente de photos réelles et en publier progressivement.",
    owner: "membre de l’équipe",
    metric: "photos publiées",
    doneWhen: "La liste approuvée est photographiée et au moins quatre images sont publiées.",
    steps: ["Sélectionnez les sujets approuvés dans la liste.", "Planifiez une prise de vue avec une lumière suffisante.", "Retirez tout élément confidentiel ou trompeur du cadre.", "Prenez une version horizontale et une version verticale des sujets prioritaires.", "Sélectionnez les images nettes et fidèles à la réalité.", "Publiez-les selon le calendrier de quatre semaines."],
  },
  reviews: {
    outcome: "Installer une routine d’avis simple, testée et conforme.",
    owner: "membre de l’équipe",
    metric: "nouveaux avis",
    doneWhen: "Le message approuvé et le lien d’avis validé ont été testés depuis un téléphone extérieur à l’entreprise.",
    steps: ["Récupérez le lien direct d’avis depuis votre fiche Google Business.", "Testez le lien sans être connecté au compte administrateur.", "Choisissez le message approuvé adapté au canal utilisé.", "Demandez un avis après une expérience réelle, sans récompense.", "Personnalisez la première phrase de chaque réponse.", "Suivez chaque semaine les nouveaux avis et les réponses publiées."],
  },
  rating: {
    outcome: "Installer une routine prudente pour améliorer progressivement la note moyenne.",
    owner: "membre de l’équipe",
    metric: "note moyenne et nouveaux avis",
    doneWhen: "La routine est installée, le lien est testé, les messages sont approuvés, les avis récents sont traités et le nombre de nouveaux avis est relevé.",
    steps: ["Relevez la note et le nombre total d’avis au démarrage.", "Testez le lien direct d’avis depuis un téléphone extérieur à l’entreprise.", "Utilisez les messages approuvés uniquement après une expérience réelle.", "Ne proposez aucune récompense en échange d’un avis.", "Répondez aux avis récents avec une première phrase personnalisée.", "Relevez chaque semaine les nouveaux avis et la note affichée."],
  },
  categories: {
    outcome: "Vérifier que les catégories décrivent fidèlement l’activité réelle.",
    owner: "dirigeant",
    metric: "recherches",
    doneWhen: "La catégorie principale et chaque catégorie secondaire approuvée ont été contrôlées dans la fiche.",
    steps: ["Ouvrez « Modifier le profil » dans Google Business.", "Relevez la catégorie principale actuelle.", "Comparez-la uniquement aux recommandations approuvées.", "Vérifiez que chaque catégorie correspond à une activité réellement exercée.", "Supprimez toute catégorie non pertinente.", "Enregistrez puis contrôlez l’affichage public."],
  },
  position: {
    outcome: "Vérifier les leviers contrôlables de la fiche et suivre la visibilité pendant 30 jours.",
    owner: "dirigeant",
    metric: "recherches",
    doneWhen: "Les leviers contrôlables sont vérifiés et la requête, le lieu et la date des contrôles J0 et J30 sont enregistrés.",
    steps: ["Contrôlez les informations essentielles dans le tableau des leviers.", "Corrigez uniquement les éléments approuvés ou vérifiés.", "Notez la requête, le lieu, l’appareil et la date du contrôle J0.", "Enregistrez le résultat sans en faire une promesse de classement.", "Répétez exactement le même contrôle dans 30 jours.", "Comparez les résultats en tenant compte des variations de lieu, de moment et d’appareil."],
  },
  posts: {
    outcome: "Préparer quatre publications fondées uniquement sur des informations réelles.",
    owner: "membre de l’équipe",
    metric: "vues",
    doneWhen: "Quatre publications approuvées sont planifiées, avec leur photo et leur semaine.",
    steps: ["Choisissez quatre sujets réels et vérifiables.", "Associez une photo fidèle à chaque sujet.", "Relisez les textes approuvés.", "Planifiez une publication par semaine.", "Évitez toute promotion ou nouveauté non confirmée.", "Contrôlez l’affichage après chaque publication."],
  },
};
