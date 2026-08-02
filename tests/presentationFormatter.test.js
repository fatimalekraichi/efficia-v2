import test from "node:test";
import assert from "node:assert/strict";
import {
  angleForSignal,
  buildConstat,
  buildEffortImpactNote,
  buildEvidenceNarrative,
  buildRankRationale,
  cleanTypography,
  collapseKnownRedundancies,
  detectSector,
  adaptVocabulary,
  adaptImpactLabel,
  evidenceBarData,
  benchmarkPositionLabel,
  domainQualitativeNote,
  scoreInterpretationNote,
  buildClosingStatement,
  formatFrenchNumber,
  formatFrenchNumbersInText,
  formatDiscreteCount,
  formatApproximateSignalValue,
  formatRatingDisplay,
  formatOrdinal,
  pluralizeNoun,
  formatCount,
  formatSignalValue,
  formatDescriptionReasoning,
} from "../functions/lib/presentationFormatter.js";

// Sprint 5 (finition éditoriale, 2026-07-31) — tests du module unique de
// présentation. Ce module ne teste aucune règle métier (aucun score, aucune
// priorité, aucun classement) : uniquement la mise en forme de valeurs déjà
// calculées en amont (Knowledge/Reasoning/Composer, non modifiés ici).

/* -------------------------------------------------------------------------- */
/* Objectif 2 — formats français                                             */
/* -------------------------------------------------------------------------- */

test("formatFrenchNumber : virgule décimale, arrondi à une décimale, aucune décimale sur un entier", () => {
  assert.equal(formatFrenchNumber(58.333), "58,3");
  assert.equal(formatFrenchNumber(12.67), "12,7");
  assert.equal(formatFrenchNumber(449), "449");
  assert.equal(formatFrenchNumber(0), "0");
  assert.equal(formatFrenchNumber("notanumber"), null);
});

test("formatRatingDisplay : toujours une décimale, y compris sur une valeur entière", () => {
  assert.equal(formatRatingDisplay(4.1), "4,1");
  assert.equal(formatRatingDisplay(4), "4,0");
  assert.equal(formatRatingDisplay(4.36), "4,4");
});

test("formatOrdinal : première position, puis Ne pour tout le reste", () => {
  assert.equal(formatOrdinal(1), "première");
  assert.equal(formatOrdinal(2), "2e");
  assert.equal(formatOrdinal(3), "3e");
  assert.equal(formatOrdinal(7), "7e");
  assert.equal(formatOrdinal(-1), null);
  assert.equal(formatOrdinal("x"), null);
});

test("pluralizeNoun : singulier exactement à 1, pluriel sinon (0, 2, décimal)", () => {
  assert.equal(pluralizeNoun(1, "photo", "photos"), "photo");
  assert.equal(pluralizeNoun(0, "photo", "photos"), "photos");
  assert.equal(pluralizeNoun(2, "photo", "photos"), "photos");
  assert.equal(pluralizeNoun(2.5, "photo", "photos"), "photos");
});

test("formatCount : nombre + accord en un seul appel", () => {
  assert.equal(formatCount(1, "photo", "photos"), "1 photo");
  assert.equal(formatCount(2, "photo", "photos"), "2 photos");
  assert.equal(formatCount(58.333, "avis", "avis"), "58 avis");
});

test("formatFrenchNumbersInText : quantités discrètes entières et autres décimales françaises", () => {
  assert.equal(formatDiscreteCount(13.67), "14");
  assert.equal(formatDiscreteCount(10.33), "10");
  assert.equal(formatDiscreteCount(265.7), "266");
  assert.equal(formatFrenchNumbersInText("10.33 avis et 13.67 photos"), "environ 10 avis et environ 14 photos");
  assert.equal(formatFrenchNumbersInText("Les concurrents publient en moyenne 13.67 photos"), "Les concurrents publient environ 14 photos en moyenne");
  assert.equal(formatFrenchNumbersInText("Les concurrents publient en moyenne 14 photos"), "Les concurrents publient environ 14 photos en moyenne");
  assert.equal(formatFrenchNumbersInText("Volume inférieur (médiane : 286)"), "Volume inférieur (médiane : environ 286)");
  assert.equal(formatFrenchNumbersInText("Votre note est de 4.7/5"), "Votre note est de 4,7/5");
});

test("formatApproximateSignalValue : les statistiques de panel sont arrondies et signalées comme approximatives", () => {
  assert.equal(formatApproximateSignalValue("reviews", 10.33), "environ 10 avis");
  assert.equal(formatApproximateSignalValue("photos", 13.67), "environ 14 photos");
  assert.equal(formatApproximateSignalValue("reviews", 265.7), "environ 266 avis");
  assert.equal(formatApproximateSignalValue("position", 3.6), "autour de la 4e position");
  assert.equal(formatApproximateSignalValue("rating", 4.7), "4,7/5");
});

test("formatSignalValue : un format par signal connu (unité + pluriel + ordinal), null pour un signal inconnu", () => {
  assert.equal(formatSignalValue("rating", 4.1), "4,1/5");
  assert.equal(formatSignalValue("reviews", 58.333), "58 avis");
  assert.equal(formatSignalValue("photos", 1), "1 photo");
  assert.equal(formatSignalValue("photos", 2), "2 photos");
  assert.equal(formatSignalValue("description", 1), "1 caractère");
  assert.equal(formatSignalValue("categories", 2), "2 catégories secondaires");
  assert.equal(formatSignalValue("position", 9), "9e position");
  assert.equal(formatSignalValue("position", 1), "première position");
  assert.equal(formatSignalValue("unknown_signal", 4), null);
});

test("formatDescriptionReasoning : distingue description absente, courte et suffisante", () => {
  const source = "Votre description existe, mais elle peut encore mieux expliquer votre activité.";
  assert.match(formatDescriptionReasoning(source, 0), /ne comporte actuellement aucune description/);
  assert.doesNotMatch(formatDescriptionReasoning(source, 0), /description existe/);
  assert.match(formatDescriptionReasoning(source, 120), /description existe, mais elle peut être enrichie/);
  assert.equal(formatDescriptionReasoning(source, 750), source);
});

/* -------------------------------------------------------------------------- */
/* Objectif 1 — typographie                                                  */
/* -------------------------------------------------------------------------- */

test("cleanTypography : espaces multiples réduits à un seul espace", () => {
  assert.equal(cleanTypography("Sur  la   recherche"), "Sur la recherche");
});

test("cleanTypography : ponctuation collée au mot suivant reçoit un espace", () => {
  assert.equal(cleanTypography("vos photos,contre toute attente"), "vos photos, contre toute attente");
  assert.equal(cleanTypography("un client,votre choix"), "un client, votre choix");
});

test("cleanTypography : espace avant une ponctuation simple supprimé", () => {
  assert.equal(cleanTypography("une phrase , suivie d'une autre ."), "une phrase, suivie d'une autre.");
});

test("cleanTypography : ponctuation répétée réduite à une seule occurrence", () => {
  assert.equal(cleanTypography("Vraiment.. utile"), "Vraiment. utile");
  assert.equal(cleanTypography("un mot,, un autre"), "un mot, un autre");
});

test("cleanTypography : ne modifie pas un nombre décimal français (virgule suivie d'un chiffre)", () => {
  assert.equal(cleanTypography("Votre note est de 4,1/5 aujourd'hui."), "Votre note est de 4,1/5 aujourd'hui.");
});

test("cleanTypography : valeurs vides ou absentes gérées sans erreur", () => {
  assert.equal(cleanTypography(""), "");
  assert.equal(cleanTypography(null), null);
  assert.equal(cleanTypography(undefined), undefined);
});

/* -------------------------------------------------------------------------- */
/* Objectif 3 — vocabulaire sectoriel (déterministe, aucune IA)              */
/* -------------------------------------------------------------------------- */

test("detectSector : détecte le secteur à partir de la seule catégorie disponible", () => {
  assert.equal(detectSector({ category: "Cabinet médical" }), "medical");
  assert.equal(detectSector({ category: "Cabinet dentaire" }), "medical");
  assert.equal(detectSector({ category: "Restaurant italien" }), "restaurant");
  assert.equal(detectSector({ category: "Avocat en droit des affaires" }), "legal");
  assert.equal(detectSector({ category: "Plombier chauffagiste" }), "artisan");
});

test("detectSector : secteur inconnu renvoie null (vocabulaire générique conservé)", () => {
  assert.equal(detectSector({ category: "Garage automobile" }), null);
  assert.equal(detectSector({ category: undefined }), null);
  assert.equal(detectSector({}), null);
});

test("adaptVocabulary : remplace client par patient pour le secteur médical, en respectant la casse", () => {
  const adapted = adaptVocabulary("Vos clients apprécient ce client.", "medical");
  assert.match(adapted, /Vos patients/);
  assert.match(adapted, /ce patient/);
  assert.doesNotMatch(adapted, /\bclients?\b/);
});

// Sprint 5 (finition éditoriale, objectif 3) — vérifié sur le texte réel
// (causes.js/businessImpacts.js/googleImpacts.js) : "entreprise" (féminin) et
// "contact" ne sont volontairement PAS remplacés (contrairement à l'exemple
// brut de la mission) car un remplacement mot-à-mot y casse l'accord déjà
// écrit dans la phrase (genre différent, tournures figées comme "prendre
// contact") — un rapport avec une faute de français serait pire qu'un
// vocabulaire resté générique. Voir le commentaire au-dessus de
// SIMPLE_WORD_MAPPING_BY_SECTOR pour le détail des occurrences vérifiées.
// Premium Polish — objectif 3 : "entreprise" et "contact" sont désormais
// adaptés, mais phrase par phrase (chaque occurrence RÉELLE de la
// bibliothèque Reasoning/Composer, vérifiée individuellement), jamais par un
// remplacement mot-à-mot générique qui casserait l'accord d'un adjectif ou
// d'un participe (ex. "l'entreprise est pertinente" → resterait au féminin
// à tort si "entreprise" seul était remplacé par "cabinet").
test("adaptVocabulary : \"entreprise\" devient \"cabinet\" pour les phrases réelles répertoriées, avec les bons accords", () => {
  assert.match(
    adaptVocabulary("Une fiche moins visible reçoit moins d'occasions d'être consultée, même si l'entreprise est pertinente.", "medical"),
    /même si le cabinet est pertinent\./,
  );
  assert.match(
    adaptVocabulary("Lorsqu'un prospect compare plusieurs entreprises affichées côte à côte, ce volume d'avis vous donne un avantage.", "medical"),
    /plusieurs cabinets affichés côte à côte/,
  );
  assert.match(
    adaptVocabulary("Votre entreprise dispose déjà d'un signal de confiance utile.", "medical"),
    /Votre cabinet dispose déjà/,
  );
});

test("adaptVocabulary : \"entreprise\" reste inchangée pour une phrase non répertoriée (accord non vérifiable, repli sûr)", () => {
  // Repli sûr toujours actif pour toute phrase non répertoriée : le mot
  // générique reste inchangé plutôt que de risquer un désaccord.
  const text = "Une note en légère baisse n'empêche pas l'entreprise de rester une référence locale.";
  assert.equal(adaptVocabulary(text, "medical"), text);
});

// Retour utilisateur (relecture) : cette phrase était jusqu'ici volontairement
// exclue (le pronom "la vôtre" restait au féminin, en désaccord avec
// "cabinet"/"établissement"). Elle est désormais réécrite dans son
// intégralité, pronom inclus ("la vôtre" → "le vôtre"), ce qui lève le
// risque d'accord — toujours phrase par phrase, jamais de règle générique.
test("adaptVocabulary : \"il peut contacter une autre entreprise avant de découvrir la vôtre\" est réécrite en entier (pronom inclus), sans désaccord", () => {
  const text = "Si le prospect ne vous voit pas assez tôt, il peut contacter une autre entreprise avant de découvrir la vôtre.";
  assert.equal(
    adaptVocabulary(text, "medical"),
    "Si le prospect ne vous voit pas assez tôt, il peut prendre rendez-vous dans un autre cabinet avant de découvrir le vôtre.",
  );
  assert.equal(
    adaptVocabulary(text, "restaurant"),
    "Si le prospect ne vous voit pas assez tôt, il peut choisir un autre établissement avant de découvrir le vôtre.",
  );
  // Secteur non couvert par cette phrase précise : repli sûr, inchangé.
  assert.equal(adaptVocabulary(text, "legal"), text);
});

test("adaptVocabulary : \"contact\" devient \"prise de rendez-vous\" pour les phrases réelles répertoriées, avec les bons accords", () => {
  assert.match(
    adaptVocabulary("Une galerie solide rend l'expérience plus concrète avant le premier contact.", "medical"),
    /avant la première prise de rendez-vous\./,
  );
  assert.match(
    adaptVocabulary("Une galerie peu parlante donne moins envie de se projeter et de prendre contact.", "medical"),
    /de prendre rendez-vous\./,
  );
  assert.match(
    adaptVocabulary("Les concurrents mieux placés captent souvent les premiers contacts, car ils sont vus au moment exact.", "medical"),
    /les premières prises de rendez-vous, car/,
  );
});

test("adaptVocabulary : \"Conversion\" (impact) devient \"Prise de rendez-vous\" pour le secteur médical", () => {
  assert.equal(adaptImpactLabel("Conversion", "medical"), "Prise de rendez-vous");
  assert.equal(adaptImpactLabel("Conversion", null), "Conversion");
  assert.equal(adaptImpactLabel("Conversion", "restaurant"), "Conversion");
  assert.equal(adaptImpactLabel("Confiance", "medical"), "Confiance");
});

test("adaptVocabulary : \"offre\" devient un nom de même genre et de même nombre (aucun désaccord grammatical)", () => {
  assert.match(adaptVocabulary("Votre offre reste discrète.", "medical"), /Votre spécialité reste discrète\./);
  assert.match(adaptVocabulary("Vos offres sont variées.", "medical"), /Vos spécialités sont variées\./);
  assert.match(adaptVocabulary("Cette offre est complète.", "legal"), /Cette pratique est complète\./);
  assert.match(adaptVocabulary("Vos offres sont variées.", "artisan"), /Vos prestations sont variées\./);
  assert.match(adaptVocabulary("Votre offre reste discrète.", "restaurant"), /Votre cuisine reste discrète\./);
});

test("adaptVocabulary : \"son offre\" redevient \"sa {mot}\" (l'euphonie de \"son\" ne s'applique plus à un mot qui commence par une consonne)", () => {
  assert.match(adaptVocabulary("Le concurrent détaille mieux son offre.", "medical"), /sa spécialité/);
  assert.doesNotMatch(adaptVocabulary("Le concurrent détaille mieux son offre.", "medical"), /son spécialité/);
});

// Premium Polish — objectif 9 (relecture éditoriale) : "consultations en
// contacts qualifiés" (businessImpacts.js) est un jargon générique qui ne
// sonne pas naturel pour un restaurant. Corrigé phrase par phrase, comme pour
// le secteur médical, sans toucher à la bibliothèque Reasoning d'origine.
test("adaptVocabulary : \"consultations en contacts qualifiés\" devient plus naturel pour un restaurant", () => {
  const text = "En clarifiant votre offre, vous pouvez transformer davantage de consultations en contacts qualifiés.";
  assert.match(adaptVocabulary(text, "restaurant"), /transformer davantage de visites en réservations\./);
  // Secteur médical déjà couvert par un autre remplacement, inchangé ici.
  assert.match(adaptVocabulary(text, "medical"), /consultations en prises de rendez-vous qualifiées/);
  // Aucun secteur détecté ou secteur non répertorié : phrase générique
  // laissée inchangée (repli sûr existant, non modifié par cet ajout).
  assert.equal(adaptVocabulary(text, null), text);
});

test("collapseKnownRedundancies : fusionne la paire de phrases répétitive connue (galerie photos) en une seule phrase", () => {
  const text =
    "Vos visuels posent une base utile. Une galerie mieux alimentée donne à Google et aux utilisateurs davantage d'indices concrets. " +
    "Une galerie mieux actualisée peut donner davantage de preuves concrètes au moment du choix. En actualisant vos photos, vous gagnez en présence.";
  const result = collapseKnownRedundancies(text);
  assert.match(result, /Une galerie mieux alimentée donne à Google et aux utilisateurs davantage de preuves concrètes au moment du choix\./);
  // Les deux formulations d'origine, prises isolément, ne doivent plus
  // apparaître à la suite l'une de l'autre (fusionnées en une seule phrase).
  assert.doesNotMatch(result, /indices concrets\.\s*Une galerie mieux actualisée/);
});

test("collapseKnownRedundancies : ne modifie pas un texte qui ne contient pas la paire répertoriée", () => {
  const text = "Une galerie mieux alimentée donne à Google et aux utilisateurs davantage d'indices concrets.";
  assert.equal(collapseKnownRedundancies(text), text);
  assert.equal(collapseKnownRedundancies(null), null);
  assert.equal(collapseKnownRedundancies(""), "");
});

test("adaptVocabulary : secteur inconnu ou absent ne modifie jamais le texte", () => {
  const text = "Votre offre reste discrète.";
  assert.equal(adaptVocabulary(text, null), text);
  assert.equal(adaptVocabulary(text, undefined), text);
  assert.equal(adaptVocabulary(text, "secteur_totalement_inconnu"), text);
});

test("adaptVocabulary : valeur vide ou absente gérée sans erreur", () => {
  assert.equal(adaptVocabulary("", "medical"), "");
  assert.equal(adaptVocabulary(null, "medical"), null);
});

/* -------------------------------------------------------------------------- */
/* Objectifs 1, 3 et 4 (migré depuis composer-engine/priorityFraming.js)      */
/* -------------------------------------------------------------------------- */

test("angleForSignal : chaque signal connu a un angle distinct (aucun doublon, aucun texte vide)", () => {
  const signals = ["rating", "reviews", "photos", "description", "categories", "position"];
  const angles = signals.map(angleForSignal);

  for (const angle of angles) {
    assert.equal(typeof angle, "string");
    assert.ok(angle.length > 0);
  }
  assert.equal(new Set(angles).size, angles.length, "chaque signal doit avoir un angle différent");
});

test("angleForSignal : signal inconnu renvoie null (aucune formulation générique de repli)", () => {
  assert.equal(angleForSignal("unknown_signal"), null);
  assert.equal(angleForSignal(undefined), null);
});

test("buildConstat : produit une phrase factuelle non vide pour chacun des 6 signaux, au format français", () => {
  const cases = [
    { signal: "rating", evidence: { value: 4.1 }, expected: /4,1\/5/ },
    { signal: "reviews", evidence: { value: 8 }, expected: /8 avis/ },
    { signal: "photos", evidence: { value: 3 }, expected: /3 photos/ },
    { signal: "description", evidence: { value: 120 }, expected: /120 caractères/ },
    { signal: "categories", evidence: { value: 2 }, expected: /2 catégories secondaires/ },
    { signal: "position", evidence: { value: 9 }, expected: /9e position/ },
  ];

  for (const item of cases) {
    const constat = buildConstat(item);
    assert.equal(typeof constat, "string", `${item.signal} devrait produire une phrase`);
    assert.match(constat, item.expected);
  }
});

test("buildConstat : accord singulier correct (1 photo, pas 1 photos)", () => {
  assert.match(buildConstat({ signal: "photos", evidence: { value: 1 } }), /1 photo\b/);
  assert.doesNotMatch(buildConstat({ signal: "photos", evidence: { value: 1 } }), /1 photos/);
});

test("buildConstat : reflète fidèlement la valeur réelle, y compris à zéro (jamais d'invention, objectif 4)", () => {
  assert.match(buildConstat({ signal: "photos", evidence: { value: 0 } }), /aucune photo/i);
  assert.match(buildConstat({ signal: "description", evidence: { value: 0 } }), /aucune description/i);
  assert.match(buildConstat({ signal: "categories", evidence: { value: 0 } }), /aucune catégorie/i);
});

test("buildConstat : renvoie null sans valeur disponible ou pour un signal inconnu (jamais d'extrapolation)", () => {
  assert.equal(buildConstat({ signal: "rating", evidence: {} }), null);
  assert.equal(buildConstat({ signal: "rating", evidence: null }), null);
  assert.equal(buildConstat({ signal: "unknown_signal", evidence: { value: 5 } }), null);
  assert.equal(buildConstat({}), null);
});

test("buildConstat est déterministe (même entrée, même sortie)", () => {
  const item = { signal: "reviews", evidence: { value: 8 } };
  assert.equal(buildConstat(item), buildConstat({ ...item, evidence: { ...item.evidence } }));
});

test("buildEffortImpactNote : une phrase distincte par palier de difficulté/temps", () => {
  const easy = buildEffortImpactNote({ difficulty: "easy", estimatedTime: "15–20 min" });
  const medium = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "30–60 min" });
  const hard = buildEffortImpactNote({ difficulty: "hard", estimatedTime: "quelques heures" });
  const openEnded = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "variable" });

  for (const note of [easy, medium, hard, openEnded]) {
    assert.equal(typeof note, "string");
    assert.ok(note.length > 0);
  }
  assert.equal(new Set([easy, medium, hard, openEnded]).size, 4, "chaque combinaison doit produire un texte différent");
});

test("buildEffortImpactNote : un délai indéterminé prime toujours sur la difficulté", () => {
  const a = buildEffortImpactNote({ difficulty: "hard", estimatedTime: "en continu" });
  const b = buildEffortImpactNote({ difficulty: "medium", estimatedTime: "long terme" });

  assert.equal(a, b);
  assert.match(a, /progressiv|durée/i);
});

test("buildEffortImpactNote : renvoie null sans difficulté connue", () => {
  assert.equal(buildEffortImpactNote({}), null);
  assert.equal(buildEffortImpactNote(), null);
});

/* -------------------------------------------------------------------------- */
/* Objectifs 5 et 8 — preuve enrichie (Constat + benchmark en prose)         */
/* -------------------------------------------------------------------------- */

test("buildEvidenceNarrative : vous / moyenne / fiche de référence, en prose, format français", () => {
  const narrative = buildEvidenceNarrative(
    { value: 8, competitorMedian: 58.333, topCompetitor: { name: "Le Concurrent", value: 101 } },
    "reviews",
  );
  assert.match(narrative, /Votre fiche affiche actuellement 8 avis\./);
  // L'écart (58 contre 8, soit ~7,3x) reste exprimé en multiplicateur.
  // assez net pour être exprimé en multiplicateur lisible ("sept fois plus"),
  // ce qui nourrit le raisonnement au lieu de juxtaposer deux nombres.
  assert.match(narrative, /Les concurrents analysés en affichent environ 58 avis en moyenne, soit près de sept fois plus\./);
  assert.match(narrative, /La fiche de référence observée en compte 101 avis \(Le Concurrent\)\./);
});

test("buildEvidenceNarrative : { includeYou: false } omet la phrase \"vous\" (évite de répéter le Constat)", () => {
  const withYou = buildEvidenceNarrative({ value: 8, competitorMedian: 24 }, "reviews");
  const withoutYou = buildEvidenceNarrative({ value: 8, competitorMedian: 24 }, "reviews", { includeYou: false });

  assert.match(withYou, /Votre fiche affiche actuellement/);
  assert.doesNotMatch(withoutYou, /Votre fiche affiche actuellement/);
  assert.match(withoutYou, /Les concurrents analysés en affichent environ 24 avis en moyenne, soit près de trois fois plus\./);
});

/* -------------------------------------------------------------------------- */
/* Premium Polish — objectif 5 : multiplicateur de benchmark ("sept fois     */
/* plus"), jamais inventé, jamais affiché si le rapport n'est pas assez net. */
/* -------------------------------------------------------------------------- */

test("buildEvidenceNarrative : rapport net (>=1,5x ou <=0,67x) exprimé en multiplicateur lisible", () => {
  assert.match(
    buildEvidenceNarrative({ value: 1, competitorMedian: 12 }, "photos"),
    /soit nettement plus/,
  );
  assert.match(
    buildEvidenceNarrative({ value: 12, competitorMedian: 1 }, "photos"),
    /soit nettement moins/,
  );
});

test("buildEvidenceNarrative : rapport trop faible pour un multiplicateur lisible (repli sobre, aucun chiffre inventé)", () => {
  const narrative = buildEvidenceNarrative({ value: 449, competitorMedian: 340 }, "reviews");
  assert.doesNotMatch(narrative, /fois plus|fois moins/);
  assert.match(narrative, /Les concurrents analysés en affichent environ 340 avis en moyenne\./);
});

test("buildEvidenceNarrative : aucun multiplicateur pour la position (le rapport n'aurait pas de sens sur un rang)", () => {
  const narrative = buildEvidenceNarrative({ value: 9, competitorMedian: 1 }, "position");
  assert.doesNotMatch(narrative, /fois plus|fois moins/);
});

test("buildEvidenceNarrative : jamais de contradiction sur une valeur nulle (objectif 4)", () => {
  const narrative = buildEvidenceNarrative({ value: 0, competitorMedian: 12 }, "photos");
  assert.match(narrative, /ne contient actuellement aucune photo/);
  assert.doesNotMatch(narrative, /contient actuellement 0 photo/);
});

test("buildEvidenceNarrative : la position moyenne du panel n'est jamais un faux ordinal", () => {
  const narrative = buildEvidenceNarrative({ competitorMedian: 4.3 }, "position");
  assert.match(narrative, /autour de la 4e position/);
  assert.doesNotMatch(narrative, /4,3e|4,3/);
});

test("buildEvidenceNarrative : renvoie null sans aucune donnée exploitable ou pour un signal inconnu", () => {
  assert.equal(buildEvidenceNarrative(null, "reviews"), null);
  assert.equal(buildEvidenceNarrative({}, "reviews"), null);
  assert.equal(buildEvidenceNarrative({ value: 8 }, "signal_totalement_inconnu"), null);
});

test("buildEvidenceNarrative : n'invente jamais de nom de concurrent absent", () => {
  const narrative = buildEvidenceNarrative({ value: 8, topCompetitor: { value: 101 } }, "reviews");
  assert.doesNotMatch(narrative, /\(\)/);
});

/* -------------------------------------------------------------------------- */
/* Retour utilisateur — preuves plus visuelles, benchmark, domaines, rang     */
/* -------------------------------------------------------------------------- */

test("evidenceBarData : calcule des largeurs proportionnelles à partir de vous/concurrents", () => {
  const data = evidenceBarData({ value: 8, competitorMedian: 58 }, "reviews");
  assert.equal(data.youLabel, "8 avis");
  assert.equal(data.competitorLabel, "environ 58 avis");
  assert.ok(data.youPct < data.competitorPct);
  assert.equal(data.competitorPct, 100);
});

test("evidenceBarData : largeur minimale de 4 % même à 0 (jamais une barre invisible)", () => {
  const data = evidenceBarData({ value: 0, competitorMedian: 12 }, "photos");
  assert.equal(data.youPct, 4);
});

test("evidenceBarData : absente pour le signal position (une valeur plus basse y est meilleure)", () => {
  assert.equal(evidenceBarData({ value: 4, competitorMedian: 6 }, "position"), null);
});

test("evidenceBarData : absente sans les deux valeurs (vous ET concurrents)", () => {
  assert.equal(evidenceBarData({ value: 8 }, "reviews"), null);
  assert.equal(evidenceBarData(null, "reviews"), null);
});

test("benchmarkPositionLabel : traduit le percentile déjà calculé par evidence.js en repère \"Top X %\"", () => {
  assert.match(benchmarkPositionLabel(95), /top 10 %/);
  assert.match(benchmarkPositionLabel(80), /premier quart/);
  assert.match(benchmarkPositionLabel(60), /au-dessus de la moyenne/);
  assert.match(benchmarkPositionLabel(30), /en dessous de la moyenne/);
  assert.match(benchmarkPositionLabel(10), /moins bien placés/);
  assert.equal(benchmarkPositionLabel(null), null);
  assert.equal(benchmarkPositionLabel(undefined), null);
});

test("domainQualitativeNote : une phrase de lecture sous chaque barre de domaine, sans affirmation propre à un domaine précis", () => {
  assert.match(domainQualitativeNote(0.9, "Réputation"), /Réputation est un point fort solide/);
  assert.match(domainQualitativeNote(0.65, "Visibilité"), /bon niveau/);
  assert.match(domainQualitativeNote(0.45, "Photos"), /mérite d'être renforcé/);
  assert.match(domainQualitativeNote(0.1, "Contenu"), /le point le plus prioritaire/);
  assert.equal(domainQualitativeNote(null, "Réputation"), null);
  assert.equal(domainQualitativeNote(0.5, null), null);
});

test("buildRankRationale : explique le classement à partir de item.rank et item.actionability.difficulty, sans inventer la formule de Composer", () => {
  assert.match(
    buildRankRationale({ rank: 1, actionability: { difficulty: "easy" } }),
    /peu d'effort suffit ici/,
  );
  assert.match(
    buildRankRationale({ rank: 1, actionability: { difficulty: "hard" } }),
    /impact sur votre visibilité est le plus déterminant/,
  );
  // Objectif 4 (mission "finition avant bêta") — au-delà du rang 1, la
  // phrase n'est plus figée : 2-3 variantes déterministes (seed = signal +
  // rang + valeur), pour éviter la même formulation sur chaque priorité
  // d'un même rapport. On vérifie l'appartenance au pool plutôt qu'un texte
  // unique.
  const RANK_NEXT_VARIANTS = [
    /moins urgent que la précédente/,
    /agit sur un autre levier/,
    /moins immédiat que la priorité précédente/,
  ];
  const rank2Text = buildRankRationale({ rank: 2, actionability: { difficulty: "easy" } });
  assert.ok(
    RANK_NEXT_VARIANTS.some((pattern) => pattern.test(rank2Text)),
    `buildRankRationale(rank:2) devrait renvoyer une des formulations attendues, reçu : "${rank2Text}"`,
  );
  assert.equal(buildRankRationale({}), null);
});

test("scoreInterpretationNote : trois registres selon le score (rassurer / base solide / optimisation fine)", () => {
  assert.match(scoreInterpretationNote(30), /Rien n'est figé/);
  assert.match(scoreInterpretationNote(39), /Rien n'est figé/);
  assert.match(scoreInterpretationNote(40), /base solide/);
  assert.match(scoreInterpretationNote(70), /base solide/);
  assert.match(scoreInterpretationNote(71), /optimisation fine/);
  assert.match(scoreInterpretationNote(95), /optimisation fine/);
  // Score absent/non numérique : repli générique, jamais une affirmation
  // flatteuse ou alarmiste non fondée.
  assert.match(scoreInterpretationNote(null), /renforcer votre visibilité/);
});

test("buildClosingStatement : phrase de clôture sectorisée, repli générique par défaut", () => {
  assert.match(
    buildClosingStatement("medical"),
    /La qualité de votre prise en charge existe déjà/,
  );
  assert.match(
    buildClosingStatement("restaurant"),
    /reflète pleinement la qualité de votre établissement/,
  );
  assert.match(
    buildClosingStatement(null),
    /reflète pleinement la qualité de votre établissement/,
  );
});
