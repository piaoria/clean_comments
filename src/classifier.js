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
  const PROMPT_API_TIMEOUT_MS = 2500;
  const MIN_AI_HARMFUL_CONFIDENCE = 0.75;

  let sessionPromise = null;
  const status = {
    promptApiDetected: false,
    promptApiAvailability: "unchecked",
    promptApiSessionReady: false,
    promptApiLastError: "",
    lastSource: "none",
    lastUpdatedAt: ""
  };

  function updateStatus(patch) {
    Object.assign(status, patch, {
      lastUpdatedAt: new Date().toISOString()
    });
  }

  function withTimeout(promise, timeoutMs, reason) {
    let timeoutId = 0;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = global.setTimeout(() => {
        reject(new Error(reason));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      global.clearTimeout(timeoutId);
    });
  }

  function isLowConfidenceHarmfulResult(result) {
    return result
      && result.label !== LABELS.SAFE
      && result.confidence < MIN_AI_HARMFUL_CONFIDENCE;
  }

  function getLanguageModelApi() {
    if (global.LanguageModel) {
      updateStatus({ promptApiDetected: true });
      return global.LanguageModel;
    }

    if (global.ai && global.ai.languageModel) {
      updateStatus({ promptApiDetected: true });
      return global.ai.languageModel;
    }

    updateStatus({
      promptApiDetected: false,
      promptApiAvailability: "missing",
      promptApiSessionReady: false
    });
    return null;
  }

  async function isPromptApiAvailable(api) {
    if (!api) {
      return false;
    }

    if (typeof api.availability === "function") {
      const availability = await api.availability();
      updateStatus({ promptApiAvailability: String(availability) });
      return availability === "available" || availability === "readily";
    }

    if (typeof api.capabilities === "function") {
      const capabilities = await api.capabilities();
      updateStatus({ promptApiAvailability: String(capabilities.available || "unknown") });
      return capabilities.available === "readily" || capabilities.available === "after-download";
    }

    updateStatus({ promptApiAvailability: "create_only" });
    return typeof api.create === "function";
  }

  async function createSession(api) {
    if (typeof api.create !== "function") {
      return null;
    }

    try {
      const session = await api.create({
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0,
        topK: 1
      });
      updateStatus({
        promptApiSessionReady: true,
        promptApiLastError: ""
      });
      return session;
    } catch (error) {
      console.info("[clean_comments] Prompt API session unavailable:", error);
      updateStatus({
        promptApiSessionReady: false,
        promptApiLastError: String(error?.message || error)
      });
      return null;
    }
  }

  async function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const api = getLanguageModelApi();
        const available = await isPromptApiAvailable(api);
        if (!available) {
          updateStatus({ promptApiSessionReady: false });
          return null;
        }

        return createSession(api);
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
    const session = await withTimeout(
      getSession(),
      PROMPT_API_TIMEOUT_MS,
      "Prompt API session timeout"
    );
    if (!session || typeof session.prompt !== "function") {
      return null;
    }

    const prompt = [
      "Classify this YouTube comment.",
      `Comment: ${JSON.stringify(String(text).slice(0, 1200))}`
    ].join("\n");

    const response = await withTimeout(
      session.prompt(prompt),
      PROMPT_API_TIMEOUT_MS,
      "Prompt API response timeout"
    );
    const result = parseAiResponse(response);
    updateStatus({ lastSource: result.source });
    return result;
  }

  async function classifyComment(text) {
    try {
      const aiResult = await classifyWithPromptApi(text);
      if (aiResult) {
        if (isLowConfidenceHarmfulResult(aiResult)) {
          const fallbackResult = classifyByRules(text);
          updateStatus({
            lastSource: fallbackResult.source,
            promptApiLastError: `low confidence ${aiResult.label} (${aiResult.confidence})`
          });
          return {
            ...fallbackResult,
            reason: `${fallbackResult.reason}; low confidence Prompt API ${aiResult.label}`.slice(0, 160)
          };
        }

        return aiResult;
      }
    } catch (error) {
      console.info("[clean_comments] Falling back to rules:", error);
    }

    const fallbackResult = classifyByRules(text);
    updateStatus({ lastSource: fallbackResult.source });
    return fallbackResult;
  }

  function getClassifierStatus() {
    return { ...status };
  }

  global.CleanCommentsClassifier = {
    classifyComment,
    getClassifierStatus
  };
})(globalThis);
