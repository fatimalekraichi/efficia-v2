import test from "node:test";
import assert from "node:assert/strict";
import { benchmarkEngine } from "../functions/lib/benchmarkEngine.js";

test("benchmark : la moyenne reste comprise entre le minimum et le maximum observés", () => {
  const competitors = [
    { name: "Fiche de référence", rating: 4.9, reviews: 73, photos_count: 12 },
    { name: "Concurrent volumique", rating: 4.5, reviews: 700, photos_count: 25 },
    { name: "Concurrent local", rating: 4.2, reviews: 24, photos_count: 4 },
  ];
  const output = benchmarkEngine({ rating: 4.7, reviews: 27, photos_count: 2, competitors_json: JSON.stringify(competitors) });

  assert.ok(output.avg_reviews <= Math.max(...competitors.map((item) => item.reviews)));
  assert.ok(output.avg_reviews >= Math.min(...competitors.map((item) => item.reviews)));
  assert.ok(output.avg_photos <= Math.max(...competitors.map((item) => item.photos_count)));
  assert.ok(output.avg_photos >= Math.min(...competitors.map((item) => item.photos_count)));
});

test("benchmark : la fiche de référence est choisie par note puis avis, pas comme maximum de chaque métrique", () => {
  const output = benchmarkEngine({
    rating: 4.7,
    reviews: 27,
    photos_count: 2,
    competitors_json: JSON.stringify([
      { name: "Fiche de référence", rating: 4.9, reviews: 73, photos_count: 12 },
      { name: "Maximum avis", rating: 4.5, reviews: 700, photos_count: 25 },
      { name: "Concurrent local", rating: 4.2, reviews: 24, photos_count: 4 },
    ]),
  });

  assert.equal(output.top_competitor_name, "Fiche de référence");
  assert.equal(output.top_competitor_reviews, 73);
  assert.ok(output.avg_reviews > output.top_competitor_reviews);
});
