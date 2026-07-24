function parseJson(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatAnalysisRow(row) {
  if (!row) return null;

  const fiche = parseJson(row.fiche_json);
  const normalized = parseJson(row.normalized_json);
  const competitors = parseJson(row.competitors_json);
  const knowledge = parseJson(row.knowledge_json);

  return {
    analysisId: row.analysis_id,
    status: row.status || null,
    business: {
      nom: row.nom || null,
      ville: row.ville || null,
      query: row.query || null,
      activity: row.activity || null,
      searchQuery: row.search_query || null,
      placeId: row.place_id || null,
      name: row.name || null,
      rating: toNumber(row.rating),
      reviews: toNumber(row.reviews),
      photosCount: toNumber(row.photos_count),
      descriptionLength: toNumber(row.description_length),
      localPosition: toNumber(row.local_position),
      fiche,
      normalized,
      competitors,
    },
    benchmark: {
      score: toNumber(row.benchmark_score),
      averages: {
        rating: toNumber(row.avg_rating),
        reviews: toNumber(row.avg_reviews),
        photos: toNumber(row.avg_photos),
      },
      gaps: {
        rating: toNumber(row.rating_gap),
        reviews: toNumber(row.reviews_gap),
        photos: toNumber(row.photos_gap),
      },
      percentiles: {
        rating: toNumber(row.rating_percentile),
        reviews: toNumber(row.reviews_percentile),
        photos: toNumber(row.photos_percentile),
      },
      topCompetitor: {
        name: row.top_competitor_name || null,
        rating: toNumber(row.top_competitor_rating),
        reviews: toNumber(row.top_competitor_reviews),
      },
      completedAt: row.benchmark_completed_at || null,
    },
    knowledge,
    timestamps: {
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      benchmarkCompletedAt: row.benchmark_completed_at || null,
      knowledgeCompletedAt: row.knowledge_completed_at || null,
    },
  };
}

export const ANALYSIS_SELECT = `
  SELECT
    analysis_id,
    nom,
    ville,
    query,
    place_id,
    name,
    rating,
    reviews,
    photos_count,
    description_length,
    status,
    fiche_json,
    normalized_json,
    created_at,
    updated_at,
    activity,
    search_query,
    local_position,
    competitors_json,
    benchmark_score,
    avg_rating,
    avg_reviews,
    avg_photos,
    rating_gap,
    reviews_gap,
    photos_gap,
    rating_percentile,
    reviews_percentile,
    photos_percentile,
    top_competitor_name,
    top_competitor_rating,
    top_competitor_reviews,
    benchmark_completed_at,
    knowledge_json,
    knowledge_completed_at
  FROM analyses
`;
