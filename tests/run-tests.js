const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function createSandbox(promptResponse) {
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
        prompt: async () => promptResponse
      })
    };
  }

  vm.runInNewContext(fs.readFileSync("src/classifier.js", "utf8"), sandbox);
  return sandbox;
}

async function run() {
  const sandbox = createSandbox();
  const { classifyByRules } = sandbox.CleanCommentsRules;

  assert.equal(classifyByRules("ㅋㅋㅋㅋ").label, "safe");
  assert.equal(classifyByRules("visit https://bit.ly/example").label, "link_bait");
  assert.equal(classifyByRules("무료 이벤트 코인 투자").label, "spam");
  assert.equal(classifyByRules("19금 성인 영상").label, "adult_bait");
  assert.equal(classifyByRules("you are stupid").label, "harassment");

  const lowConfidenceSandbox = createSandbox(JSON.stringify({
    label: "harassment",
    confidence: 0.2,
    reason: "uncertain"
  }));
  const lowConfidenceResult = await lowConfidenceSandbox.CleanCommentsClassifier.classifyComment("normal comment");
  assert.equal(lowConfidenceResult.label, "safe");
  assert.equal(lowConfidenceResult.source, "rules");
  assert.match(lowConfidenceResult.reason, /low confidence Prompt API harassment/);

  const highConfidenceSandbox = createSandbox(JSON.stringify({
    label: "harassment",
    confidence: 0.92,
    reason: "direct insult"
  }));
  const highConfidenceResult = await highConfidenceSandbox.CleanCommentsClassifier.classifyComment("normal comment");
  assert.equal(highConfidenceResult.label, "harassment");
  assert.equal(highConfidenceResult.source, "prompt_api");

  const popupSource = fs.readFileSync("popup/popup.js", "utf8");
  assert(!/[�]|湲\?|遺|諛|蹂묒|硫/.test(popupSource), "popup templates contain corrupted text");

  console.log("All tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
