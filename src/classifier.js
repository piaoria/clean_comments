(function exposeClassifier(global) {
  const { LABELS, classifyByRules } = global.CleanCommentsRules;
  const log = global.CleanCommentsLog
    ? global.CleanCommentsLog.scope("classifier")
    : { debug() {}, info() {}, warn() {}, error() {} };

  const ALLOWED_LABELS = new Set(Object.values(LABELS));
  const SYSTEM_PROMPT = [
    "You classify YouTube comments for a browser extension.",
    "Return only compact JSON with keys: label, confidence, reason.",
    "Allowed labels: spam, adult_bait, link_bait, meaningless, harassment, safe.",
    "Use safe for normal disagreement, criticism, jokes, or harmless comments.",
    "Do not add markdown or extra text."
  ].join(" ");
  // AI-only mode: when false, the local rule classifier is never used as a
  // fallback for filtering. Comments the Prompt API cannot judge are left
  // visible (treated as safe) instead of being filtered by local rules.
  // Flip back to true to restore the rule-based fallback.
  const RULES_FALLBACK_ENABLED = false;

  // Gemini Nano needs far more than a couple of seconds, especially for a full
  // batch. Session acquisition may also include a model download on first use.
  const SESSION_TIMEOUT_MS = 30000;
  const PROMPT_API_TIMEOUT_MS = 12000;
  const MIN_AI_HARMFUL_CONFIDENCE = 0.75;

  function batchTimeoutMs(count) {
    return Math.min(90000, Math.max(20000, count * 900));
  }

  function safeResult(reason, source) {
    return {
      label: LABELS.SAFE,
      confidence: 0,
      source: source || "ai_unavailable",
      reason
    };
  }

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

  function normalizeAiResult(parsed) {
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

  function getLanguageModelApi() {
    if (global.LanguageModel) {
      updateStatus({ promptApiDetected: true });
      log.info("Prompt API detected via global.LanguageModel");
      return global.LanguageModel;
    }

    if (global.ai && global.ai.languageModel) {
      updateStatus({ promptApiDetected: true });
      log.info("Prompt API detected via global.ai.languageModel (legacy)");
      return global.ai.languageModel;
    }

    updateStatus({
      promptApiDetected: false,
      promptApiAvailability: "missing",
      promptApiSessionReady: false
    });
    log.warn("Prompt API not found on this page (no LanguageModel / ai.languageModel)");
    return null;
  }

  async function isPromptApiAvailable(api) {
    if (!api) {
      return false;
    }

    if (typeof api.availability === "function") {
      const availability = await api.availability();
      updateStatus({ promptApiAvailability: String(availability) });
      log.info(`Prompt API availability: ${availability}`);
      // "downloadable"/"after-download" still let us create a session; the
      // create() call triggers the model download.
      return availability === "available"
        || availability === "readily"
        || availability === "downloadable"
        || availability === "after-download";
    }

    if (typeof api.capabilities === "function") {
      const capabilities = await api.capabilities();
      updateStatus({ promptApiAvailability: String(capabilities.available || "unknown") });
      return capabilities.available === "readily" || capabilities.available === "after-download";
    }

    updateStatus({ promptApiAvailability: "create_only" });
    return typeof api.create === "function";
  }

  function attachDownloadMonitor(monitor) {
    monitor.addEventListener?.("downloadprogress", (event) => {
      const percent = Math.round(Number(event.loaded || 0) * 100);
      updateStatus({ promptApiAvailability: `downloading ${percent}%` });
      log.info(`Gemini Nano model downloading: ${percent}%`);
    });
  }

  async function createSession(api) {
    if (typeof api.create !== "function") {
      return null;
    }

    const startedAt = Date.now();
    log.info("Creating Prompt API session...");
    try {
      let session;
      try {
        // Current Chrome Prompt API shape.
        session = await api.create({
          initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
          temperature: 0,
          topK: 1,
          monitor: attachDownloadMonitor
        });
      } catch (modernError) {
        log.warn("Session create with initialPrompts failed, retrying with legacy systemPrompt", modernError);
        // Older builds expect systemPrompt instead of initialPrompts.
        session = await api.create({
          systemPrompt: SYSTEM_PROMPT,
          temperature: 0,
          topK: 1
        });
      }

      updateStatus({
        promptApiSessionReady: true,
        promptApiLastError: ""
      });
      log.info(`Prompt API session ready in ${Date.now() - startedAt}ms`);
      return session;
    } catch (error) {
      log.error("Prompt API session unavailable", error);
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

    let session;
    try {
      session = await sessionPromise;
    } catch (error) {
      // Reset so the next batch can retry (e.g. once a download finishes).
      sessionPromise = null;
      throw error;
    }

    if (!session) {
      sessionPromise = null;
    }

    return session;
  }

  function parseAiResponse(rawResponse) {
    const rawText = String(rawResponse || "").trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    return normalizeAiResult(parsed);
  }

  function parseAiBatchResponse(rawResponse, expectedCount) {
    const rawText = String(rawResponse || "").trim();
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);

    if (!Array.isArray(parsed)) {
      throw new Error("Prompt API batch response is not an array");
    }

    // Be tolerant: the model may return items out of order, skip some, or emit
    // an unexpected count. Match by id when present, fall back to position, and
    // treat anything missing or unparseable as safe rather than discarding the
    // whole batch to the rule fallback.
    const byId = new Map();
    parsed.forEach((item, index) => {
      const id = Number.isInteger(item?.id) ? item.id : index;
      if (!byId.has(id)) {
        byId.set(id, item);
      }
    });

    const results = [];
    for (let index = 0; index < expectedCount; index += 1) {
      const item = byId.has(index) ? byId.get(index) : parsed[index];
      if (!item) {
        results.push(safeResult("missing AI result; treated as safe", "prompt_api"));
        continue;
      }

      try {
        results.push(normalizeAiResult(item));
      } catch (error) {
        log.warn(`Unparseable AI item at index ${index}, treating as safe`, error);
        results.push(safeResult("unparseable AI result; treated as safe", "prompt_api"));
      }
    }

    return results;
  }

  async function classifyWithPromptApi(text) {
    const session = await withTimeout(
      getSession(),
      SESSION_TIMEOUT_MS,
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

  async function classifyWithPromptApiBatch(texts) {
    const session = await withTimeout(
      getSession(),
      SESSION_TIMEOUT_MS,
      "Prompt API session timeout"
    );
    if (!session || typeof session.prompt !== "function") {
      return null;
    }

    const comments = texts.map((text, index) => ({
      id: index,
      text: String(text).slice(0, 800)
    }));
    const prompt = [
      "Classify each YouTube comment.",
      "Return only a compact JSON array with one item per input in the same order.",
      "Each item must have keys: id, label, confidence, reason.",
      `Comments: ${JSON.stringify(comments)}`
    ].join("\n");

    const startedAt = Date.now();
    log.info(`Sending batch of ${texts.length} comment(s) to Prompt API`);
    const response = await withTimeout(
      session.prompt(prompt),
      batchTimeoutMs(texts.length),
      "Prompt API batch response timeout"
    );
    const results = parseAiBatchResponse(response, texts.length);
    updateStatus({ lastSource: "prompt_api" });
    log.info(`Batch classified in ${Date.now() - startedAt}ms`, summarizeLabels(results));
    log.debug("Raw Prompt API batch response", response);
    return results;
  }

  function summarizeLabels(results) {
    return results.reduce((counts, result) => {
      counts[result.label] = (counts[result.label] || 0) + 1;
      return counts;
    }, {});
  }

  function resolveLowConfidence(aiResult, fallbackText) {
    if (RULES_FALLBACK_ENABLED) {
      const fallbackResult = classifyByRules(fallbackText);
      updateStatus({
        lastSource: fallbackResult.source,
        promptApiLastError: `low confidence ${aiResult.label} (${aiResult.confidence})`
      });
      return {
        ...fallbackResult,
        reason: `${fallbackResult.reason}; low confidence Prompt API ${aiResult.label}`.slice(0, 160)
      };
    }

    // AI-only mode: an uncertain harmful guess is not enough to filter, so the
    // comment stays visible.
    updateStatus({ lastSource: "prompt_api" });
    return {
      label: LABELS.SAFE,
      confidence: aiResult.confidence,
      source: "prompt_api",
      reason: `low confidence ${aiResult.label} (${aiResult.confidence}); treated as safe`.slice(0, 160)
    };
  }

  function resolveUnavailable(fallbackText) {
    if (RULES_FALLBACK_ENABLED) {
      const fallbackResult = classifyByRules(fallbackText);
      updateStatus({ lastSource: fallbackResult.source });
      return fallbackResult;
    }

    updateStatus({ lastSource: "ai_unavailable" });
    return safeResult("Prompt API unavailable; left visible");
  }

  async function classifyComment(text) {
    try {
      const aiResult = await classifyWithPromptApi(text);
      if (aiResult) {
        if (isLowConfidenceHarmfulResult(aiResult)) {
          return resolveLowConfidence(aiResult, text);
        }

        return aiResult;
      }
    } catch (error) {
      log.error("Prompt API classify failed, leaving comment visible", error);
      updateStatus({ promptApiLastError: String(error?.message || error) });
    }

    return resolveUnavailable(text);
  }

  async function classifyCommentsBatch(texts) {
    try {
      const aiResults = await classifyWithPromptApiBatch(texts);
      if (aiResults) {
        return aiResults.map((aiResult, index) => {
          if (!isLowConfidenceHarmfulResult(aiResult)) {
            return aiResult;
          }

          return resolveLowConfidence(aiResult, texts[index]);
        });
      }
    } catch (error) {
      log.error(`Prompt API batch failed for ${texts.length} comment(s), leaving them visible`, error);
      updateStatus({ promptApiLastError: String(error?.message || error) });
    }

    if (RULES_FALLBACK_ENABLED) {
      updateStatus({ lastSource: "rules" });
      return texts.map(classifyByRules);
    }

    updateStatus({ lastSource: "ai_unavailable" });
    log.warn(`AI unavailable — ${texts.length} comment(s) left visible (safe)`);
    return texts.map(() => safeResult("Prompt API unavailable; left visible"));
  }

  function getClassifierStatus() {
    return { ...status };
  }

  global.CleanCommentsClassifier = {
    classifyComment,
    classifyCommentsBatch,
    getClassifierStatus
  };
})(globalThis);
