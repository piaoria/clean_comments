(function exposeClassifier(global) {
  const { LABELS, classifyByRules } = global.CleanCommentsRules;

  const ALLOWED_LABELS = new Set(Object.values(LABELS));
  const SYSTEM_PROMPT = [
    "You classify YouTube comments for a browser extension.",
    "Return only compact JSON with keys: label, confidence, reason.",
    "Allowed labels: spam, adult_bait, link_bait, meaningless, harassment, safe.",
    "Use safe for normal disagreement, criticism, jokes, or harmless comments.",
    "Do not add markdown or extra text."
  ].join(" ");

  let sessionPromise = null;

  function getLanguageModelApi() {
    if (global.LanguageModel) {
      return global.LanguageModel;
    }

    if (global.ai && global.ai.languageModel) {
      return global.ai.languageModel;
    }

    return null;
  }

  async function isPromptApiAvailable(api) {
    if (!api) {
      return false;
    }

    if (typeof api.availability === "function") {
      const availability = await api.availability();
      return availability === "available" || availability === "readily";
    }

    if (typeof api.capabilities === "function") {
      const capabilities = await api.capabilities();
      return capabilities.available === "readily" || capabilities.available === "after-download";
    }

    return typeof api.create === "function";
  }

  async function createSession(api) {
    if (typeof api.create !== "function") {
      return null;
    }

    try {
      return await api.create({
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0,
        topK: 1
      });
    } catch (error) {
      console.info("[clean_comments] Prompt API session unavailable:", error);
      return null;
    }
  }

  async function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const api = getLanguageModelApi();
        const available = await isPromptApiAvailable(api);
        return available ? createSession(api) : null;
      })();
    }

    return sessionPromise;
  }

  function parseAiResponse(rawResponse) {
    const rawText = String(rawResponse || "").trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    const label = String(parsed.label || "").trim();
    const confidence = Number(parsed.confidence);

    if (!ALLOWED_LABELS.has(label)) {
      throw new Error(`Unsupported label: ${label}`);
    }

    return {
      label,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      source: "prompt_api",
      reason: String(parsed.reason || "classified by Prompt API").slice(0, 160)
    };
  }

  async function classifyWithPromptApi(text) {
    const session = await getSession();
    if (!session || typeof session.prompt !== "function") {
      return null;
    }

    const prompt = [
      "Classify this YouTube comment.",
      `Comment: ${JSON.stringify(String(text).slice(0, 1200))}`
    ].join("\n");

    const response = await session.prompt(prompt);
    return parseAiResponse(response);
  }

  async function classifyComment(text) {
    try {
      const aiResult = await classifyWithPromptApi(text);
      if (aiResult) {
        return aiResult;
      }
    } catch (error) {
      console.info("[clean_comments] Falling back to rules:", error);
    }

    return classifyByRules(text);
  }

  global.CleanCommentsClassifier = {
    classifyComment
  };
})(globalThis);

