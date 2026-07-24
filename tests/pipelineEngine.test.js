import test from "node:test";
import assert from "node:assert/strict";
import { runPipelineEngine } from "../functions/lib/pipelineEngine.js";

function silentLogger() {
  const logs = [];
  return {
    logs,
    logger: {
      log(message) {
        logs.push(message);
      },
    },
  };
}

test("pipeline completed : exécute observation, benchmark et knowledge dans l'ordre", async () => {
  const calls = [];
  const { logs, logger } = silentLogger();

  const result = await runPipelineEngine(
    { nom: "La Planche des Saveurs", ville: "Dinant", activite: "restaurant" },
    async (stage, payload) => {
      calls.push({ stage, payload });
      if (stage === "observation") return { ok: true, data: { analysisId: "analysis-123" } };
      return { ok: true, data: { status: "completed" } };
    },
    logger,
  );

  assert.deepEqual(result, {
    analysisId: "analysis-123",
    status: "completed",
    stages: {
      observation: "ok",
      benchmark: "ok",
      knowledge: "ok",
    },
  });
  assert.deepEqual(calls.map((call) => call.stage), ["observation", "benchmark", "knowledge"]);
  assert.deepEqual(calls[1].payload, { analysisId: "analysis-123" });
  assert.deepEqual(calls[2].payload, { analysisId: "analysis-123" });
  assert.deepEqual(logs, [
    "pipeline:start",
    "pipeline:observation:start",
    "pipeline:observation:done",
    "pipeline:benchmark:start",
    "pipeline:benchmark:done",
    "pipeline:knowledge:start",
    "pipeline:knowledge:done",
    "pipeline:success",
  ]);
});

test("pipeline failed : stoppe immédiatement si observation échoue", async () => {
  const calls = [];
  const { logger } = silentLogger();

  const result = await runPipelineEngine(
    { nom: "Entreprise", ville: "Ville", activite: "activité" },
    async (stage) => {
      calls.push(stage);
      return { ok: false, error: "No business found." };
    },
    logger,
  );

  assert.equal(result.status, "failed");
  assert.equal(result.stage, "observation");
  assert.deepEqual(result.stages, {
    observation: "failed",
    benchmark: "pending",
    knowledge: "pending",
  });
  assert.deepEqual(calls, ["observation"]);
});
