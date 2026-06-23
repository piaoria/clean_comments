const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function createSandbox(promptResponse) {
  let promptCalls = 0;
  const sandbox = {
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(fs.readFileSync("src/rules.js", "utf8"), sandbox);

  if (promptResponse) {
    sandbox.LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async () => {
          promptCalls += 1;
          return typeof promptResponse === "function" ? promptResponse() : promptResponse;
        }
      })
    };
  }

  vm.runInNewContext(fs.readFileSync("src/classifier.js", "utf8"), sandbox);
  sandbox.getPromptCalls = () => promptCalls;
  return sandbox;
}

async function run() {
  const sandbox = createSandbox();
  const { classifyByRules } = sandbox.CleanCommentsRules;

  assert.equal(classifyByRules("\u314B\u314B\u314B\u314B").label, "safe");
  assert.equal(classifyByRules("visit https://bit.ly/example").label, "link_bait");
  assert.equal(classifyByRules("\uBB34\uB8CC \uC774\uBCA4\uD2B8 \uCF54\uC778 \uD22C\uC790").label, "spam");
  assert.equal(classifyByRules("19\uAE08 \uC131\uC778 \uC601\uC0C1").label, "adult_bait");
  assert.equal(classifyByRules("you are stupid").label, "harassment");

  // AI-only mode: a low-confidence harmful guess is not enough to filter, so the
  // comment is left visible (safe) and stays attributed to the Prompt API rather
  // than falling back to local rules.
  const lowConfidenceSandbox = createSandbox(JSON.stringify({
    label: "harassment",
    confidence: 0.2,
    reason: "uncertain"
  }));
  const lowConfidenceResult = await lowConfidenceSandbox.CleanCommentsClassifier.classifyComment("normal comment");
  assert.equal(lowConfidenceResult.label, "safe");
  assert.equal(lowConfidenceResult.source, "prompt_api");
  assert.match(lowConfidenceResult.reason, /low confidence harassment/);

  const highConfidenceSandbox = createSandbox(JSON.stringify({
    label: "harassment",
    confidence: 0.92,
    reason: "direct insult"
  }));
  const highConfidenceResult = await highConfidenceSandbox.CleanCommentsClassifier.classifyComment("normal comment");
  assert.equal(highConfidenceResult.label, "harassment");
  assert.equal(highConfidenceResult.source, "prompt_api");

  // AI-only mode: low-confidence harmful items become safe (still prompt_api),
  // never local rules.
  const batchSandbox = createSandbox(JSON.stringify([
    { id: 0, label: "safe", confidence: 0.9, reason: "normal" },
    { id: 1, label: "spam", confidence: 0.91, reason: "promotion" },
    { id: 2, label: "harassment", confidence: 0.2, reason: "uncertain" }
  ]));
  const batchResults = await batchSandbox.CleanCommentsClassifier.classifyCommentsBatch([
    "normal comment",
    "earn money free giveaway",
    "normal again"
  ]);
  assert.equal(batchSandbox.getPromptCalls(), 1);
  assert.deepEqual(batchResults.map((result) => result.source), ["prompt_api", "prompt_api", "prompt_api"]);
  assert.deepEqual(batchResults.map((result) => result.label), ["safe", "spam", "safe"]);

  // Out-of-order / partial AI responses are matched by id and missing entries
  // default to safe instead of nuking the whole batch.
  const tolerantSandbox = createSandbox(JSON.stringify([
    { id: 2, label: "spam", confidence: 0.95, reason: "promotion" },
    { id: 0, label: "safe", confidence: 0.9, reason: "normal" }
  ]));
  const tolerantResults = await tolerantSandbox.CleanCommentsClassifier.classifyCommentsBatch([
    "normal comment",
    "missing one",
    "earn money free giveaway"
  ]);
  assert.deepEqual(tolerantResults.map((result) => result.label), ["safe", "safe", "spam"]);
  assert.deepEqual(tolerantResults.map((result) => result.source), ["prompt_api", "prompt_api", "prompt_api"]);

  // When the Prompt API is unavailable, AI-only mode leaves everything visible
  // (safe) rather than filtering with local rules.
  const unavailableSandbox = createSandbox();
  const unavailableResults = await unavailableSandbox.CleanCommentsClassifier.classifyCommentsBatch([
    "earn money free giveaway",
    "19금 성인 영상"
  ]);
  assert.deepEqual(unavailableResults.map((result) => result.label), ["safe", "safe"]);
  assert.deepEqual(unavailableResults.map((result) => result.source), ["ai_unavailable", "ai_unavailable"]);

  const popupSource = fs.readFileSync("popup/popup.js", "utf8");
  assert(!/[�]|湲\?|遺|諛|蹂묒|硫/.test(popupSource), "popup templates contain corrupted text");

  const popupHtml = fs.readFileSync("popup/popup.html", "utf8");
  assert(!/[�]|湲\?|遺|諛|蹂묒|硫|&#[^0-9x]/.test(popupHtml), "popup HTML contains corrupted text");

  console.log("All tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
