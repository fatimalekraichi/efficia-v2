export const PIPELINE_STAGES = {
  observation: "observation",
  benchmark: "benchmark",
  knowledge: "knowledge",
};

function okStages() {
  return {
    observation: "pending",
    benchmark: "pending",
    knowledge: "pending",
  };
}

function failed(stage, stages, details = null) {
  return {
    status: "failed",
    stage,
    stages,
    ...(details ? { error: details } : {}),
  };
}

export async function runPipelineEngine(input, runStage, logger = console) {
  const stages = okStages();

  logger.log("pipeline:start");

  logger.log("pipeline:observation:start");
  const observation = await runStage(PIPELINE_STAGES.observation, input);
  if (!observation.ok || !observation.data?.analysisId) {
    stages.observation = "failed";
    return failed(PIPELINE_STAGES.observation, stages, observation.error || "Observation failed.");
  }
  const { analysisId } = observation.data;
  stages.observation = "ok";
  logger.log("pipeline:observation:done");

  logger.log("pipeline:benchmark:start");
  const benchmark = await runStage(PIPELINE_STAGES.benchmark, { analysisId });
  if (!benchmark.ok) {
    stages.benchmark = "failed";
    return failed(PIPELINE_STAGES.benchmark, stages, benchmark.error || "Benchmark failed.");
  }
  stages.benchmark = "ok";
  logger.log("pipeline:benchmark:done");

  logger.log("pipeline:knowledge:start");
  const knowledge = await runStage(PIPELINE_STAGES.knowledge, { analysisId });
  if (!knowledge.ok) {
    stages.knowledge = "failed";
    return failed(PIPELINE_STAGES.knowledge, stages, knowledge.error || "Knowledge failed.");
  }
  stages.knowledge = "ok";
  logger.log("pipeline:knowledge:done");

  logger.log("pipeline:success");
  return {
    analysisId,
    status: "completed",
    stages,
  };
}
