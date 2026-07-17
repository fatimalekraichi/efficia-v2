import fs from "node:fs";
import path from "node:path";
import { createDecisionEngine, fixtureDirectory } from "./current-engine-harness.mjs";

const dir = fixtureDirectory();
const engine = createDecisionEngine();
const max = Object.fromEntries(
  engine.GRILLE.flatMap(cat => cat.criteres.map(cr => [cr.key, cr.max]))
);
const keys = Object.keys(max);

function points(entries) {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value === "max" ? max[key] : value]));
}

function all(value) {
  return Object.fromEntries(keys.map(key => [key, value === "max" ? max[key] : value]));
}

function verificationFor(criteria, defaultStatus = "manual") {
  return Object.fromEntries(Object.keys(criteria).map(key => [key, defaultStatus]));
}

function withExpected(fixture) {
  const tested = { ...fixture };
  delete tested.expected;
  return { ...tested, expected: createDecisionEngine(tested).snapshot() };
}

const averageCriteria = points({
  revendiquee: "max",
  categoriePrincipale: 2,
  categoriesSecondaires: "max",
  horaires: 1,
  contact: "max",
  adresse: "max",
  attributs: 1,
  nap: "max",
  logoCouverture: 1,
  nombrePhotos: 1,
  photoRecente: 2,
  varietePhotos: 1,
  qualitePhotos: 1,
  noteMoyenne: 4,
  volumeAvis: 3,
  recenceAvis: 2,
  tauxReponseAvis: 3,
  qualiteReponsesAvis: 2,
  descriptionRemplie: 2,
  descriptionQualite: 2,
  servicesPresents: 1,
  servicesDecrits: 1,
  questionsReponses: 1,
  liensAction: "max",
  publicationRecente: 1,
  rythmePublication: 1,
  classementLocal: 3,
  attractiviteConcurrents: 2,
  recherchesSpecifiques: 1
});

const fixtures = [
  {
    id: "weak-business",
    businessName: "Garage Test Faible",
    city: "Arlon",
    activity: "Garage",
    profile: "default",
    data: { note: 3.6, nbAvis: 4, nbPhotos: 2, descriptionLongueur: 80, position: 0, moyennesConcurrents: { avis: 52, note: 4.6, photos: 24 }, requeteTestee: "garage arlon" },
    criteria: points({
      revendiquee: 0,
      categoriePrincipale: 0,
      categoriesSecondaires: 0,
      horaires: 1,
      contact: 1,
      adresse: 0,
      attributs: 0,
      nap: 0,
      logoCouverture: 0,
      nombrePhotos: 0,
      photoRecente: 0,
      varietePhotos: 0,
      qualitePhotos: 0,
      noteMoyenne: 2,
      volumeAvis: 0,
      recenceAvis: 0,
      tauxReponseAvis: 0,
      qualiteReponsesAvis: 0,
      descriptionRemplie: 0,
      descriptionQualite: 0,
      servicesPresents: 0,
      servicesDecrits: 0,
      questionsReponses: 0,
      liensAction: 0,
      publicationRecente: 0,
      rythmePublication: 0,
      classementLocal: 0,
      attractiviteConcurrents: 0,
      recherchesSpecifiques: 0
    })
  },
  {
    id: "average-business",
    businessName: "Commerce Test Moyen",
    city: "Namur",
    activity: "Commerce",
    profile: "default",
    data: { note: 4.2, nbAvis: 28, nbPhotos: 8, descriptionLongueur: 420, position: 4, moyennesConcurrents: { avis: 35, note: 4.4, photos: 12 }, requeteTestee: "commerce namur" },
    criteria: averageCriteria
  },
  {
    id: "strong-business",
    businessName: "Entreprise Test Solide",
    city: "Bruxelles",
    activity: "Service local",
    profile: "default",
    data: { note: 4.8, nbAvis: 146, nbPhotos: 38, descriptionLongueur: 720, position: 1, moyennesConcurrents: { avis: 92, note: 4.6, photos: 31 }, requeteTestee: "service local bruxelles" },
    criteria: { ...all("max"), rythmePublication: 1, questionsReponses: 1, recherchesSpecifiques: 1 }
  },
  {
    id: "incomplete-data",
    businessName: "Fiche Incomplete",
    city: "Liege",
    activity: "Artisan",
    profile: "default",
    data: { note: null, nbAvis: null, nbPhotos: null, descriptionLongueur: null, position: null, requeteTestee: "artisan liege" },
    criteria: points({
      revendiquee: "max",
      categoriePrincipale: "max",
      categoriesSecondaires: "max",
      horaires: "max",
      contact: 1,
      adresse: "max",
      attributs: 1,
      nap: "max"
    })
  },
  {
    id: "restaurant-profile",
    businessName: "Restaurant Fixture",
    city: "Luxembourg",
    activity: "Restaurant",
    profile: "restaurant",
    data: { note: 4.1, nbAvis: 74, nbPhotos: 16, descriptionLongueur: 360, position: 3, moyennesConcurrents: { avis: 80, note: 4.3, photos: 28 }, requeteTestee: "restaurant luxembourg" },
    criteria: averageCriteria
  },
  {
    id: "health-profile",
    businessName: "Cabinet Fixture",
    city: "Mons",
    activity: "Santé",
    profile: "sante",
    data: { note: 4.5, nbAvis: 33, nbPhotos: 5, descriptionLongueur: 540, position: 2, moyennesConcurrents: { avis: 30, note: 4.4, photos: 7 }, requeteTestee: "cabinet mons" },
    criteria: averageCriteria
  },
  {
    id: "photos-recency",
    businessName: "Atelier Photos Recentes",
    city: "Dippach",
    activity: "Garage",
    profile: "default",
    data: { note: 4.4, nbAvis: 42, nbPhotos: 23, descriptionLongueur: 500, position: 2, moyennesConcurrents: { avis: 38, note: 4.5, photos: 22 }, requeteTestee: "garage dippach" },
    criteria: { ...all("max"), photoRecente: 0, publicationRecente: 1, rythmePublication: 1 }
  },
  {
    id: "pack-projection",
    businessName: "Pack Projection",
    city: "Charleroi",
    activity: "Artisan",
    profile: "artisan",
    data: { note: 4.9, nbAvis: 120, nbPhotos: 4, descriptionLongueur: 120, position: 1, moyennesConcurrents: { avis: 70, note: 4.5, photos: 18 }, requeteTestee: "artisan charleroi" },
    criteria: {
      ...all("max"),
      revendiquee: 0,
      categoriePrincipale: 0,
      categoriesSecondaires: 0,
      horaires: 0,
      contact: 0,
      adresse: 0,
      attributs: 0,
      nap: 0,
      logoCouverture: 0,
      nombrePhotos: 0,
      photoRecente: 0,
      varietePhotos: 0,
      qualitePhotos: 0,
      tauxReponseAvis: 0,
      qualiteReponsesAvis: 0,
      descriptionRemplie: 0,
      descriptionQualite: 0,
      servicesPresents: 0,
      servicesDecrits: 0,
      questionsReponses: 0,
      liensAction: 0
    }
  }
];

for (const fixture of fixtures) {
  fixture.verification = verificationFor(fixture.criteria, "manual");
  ["noteMoyenne", "volumeAvis", "nombrePhotos", "classementLocal", "attractiviteConcurrents"].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(fixture.criteria, key)) fixture.verification[key] = "observed";
  });
  const output = withExpected(fixture);
  fs.writeFileSync(path.join(dir, `${fixture.id}.json`), `${JSON.stringify(output, null, 2)}\n`);
}
