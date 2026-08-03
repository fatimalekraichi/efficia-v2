import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildExecutionPlan } from "../functions/lib/executionPlanBuilder.js";
import { buildDocumentModelFromAnalysis } from "../functions/lib/documentModelFromAnalysis.js";
import { renderAnalysisHtml } from "../functions/lib/renderAnalysisHtml.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: node scripts/generate-execution-preview.mjs model.json output.html");

const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
if (input.business && input.documentModel) {
  await writeFile(resolve(outputPath), renderAnalysisHtml(buildDocumentModelFromAnalysis(input)), "utf8");
  process.exit(0);
}
const documentModel = input;
const positionPriority = documentModel.priorities?.find((item) => item.signal === "position");
const analysis = {
  reportType: "premium",
  business: {
    name: documentModel.hero?.businessName,
    ville: documentModel.hero?.city,
    activity: documentModel.hero?.category,
    rating: documentModel.hero?.comparison?.you?.rating ?? null,
    reviews: documentModel.hero?.comparison?.you?.reviews ?? null,
    photosCount: documentModel.hero?.comparison?.you?.photos ?? null,
    descriptionLength: documentModel.priorities?.find((item) => item.signal === "description")?.evidence?.value ?? null,
    localPosition: positionPriority?.evidence?.value ?? null,
    normalized: { category: documentModel.hero?.category },
  },
  manualReview: {},
};
const executionPlan = buildExecutionPlan({ analysis, documentModel });
await writeFile(resolve(outputPath), renderAnalysisHtml({ ...documentModel, executionPlan }), "utf8");
