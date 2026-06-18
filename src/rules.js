(function exposeRules(global) {
  const LABELS = Object.freeze({
    SPAM: "spam",
    ADULT_BAIT: "adult_bait",
    LINK_BAIT: "link_bait",
    MEANINGLESS: "meaningless",
    HARASSMENT: "harassment",
    USER_WORD: "user_word",
    SAFE: "safe"
  });

  const HARMFUL_LABELS = new Set([
    LABELS.SPAM,
    LABELS.ADULT_BAIT,
    LABELS.LINK_BAIT,
    LABELS.MEANINGLESS,
    LABELS.HARASSMENT,
    LABELS.USER_WORD
  ]);

  const RULES = [
    {
      label: LABELS.LINK_BAIT,
      confidence: 0.91,
      patterns: [
        /\b(?:https?:\/\/|www\.)\S+/i,
        /\b(?:bit\.ly|t\.co|tinyurl\.com|linktr\.ee|discord\.gg)\b/i,
        /\b(?:click|tap|visit|check)\s+(?:here|my\s+profile|this\s+link)\b/i,
        /(?:\uC5EC\uAE30|\uD504\uB85C\uD544|\uB9C1\uD06C|\uC8FC\uC18C)\s*(?:\uD074\uB9AD|\uD655\uC778|\uBC29\uBB38)/i,
        /(?:\uACE0\uC815\uB313\uAE00|\uB313\uAE00\uCC3D|\uC124\uBA85\uB780|\uB354\uBCF4\uAE30).{0,12}(?:\uB9C1\uD06C|\uC8FC\uC18C)/i
      ]
    },
    {
      label: LABELS.ADULT_BAIT,
      confidence: 0.88,
      patterns: [
        /\b(?:18\+|adult|nsfw|nude|onlyfans|sex|sexy|hot girls?)\b/i,
        /\b(?:meet|date)\s+(?:me|girls?|singles?)\b/i,
        /(?:19\uAE08|\uC131\uC778|\uC57C\uB3D9|\uC139\uC2A4|\uB178\uCD9C|\uBAB8\uB9E4|\uC740\uBC00|\uC870\uAC74\uB9CC\uB0A8|\uB9CC\uB0A8\s*\uC6D0\uD574)/i,
        /(?:\uC5EC\uC790|\uB204\uB098|\uC5B8\uB2C8).{0,8}(?:\uB9CC\uB0A0|\uB9CC\uB0A8|\uC5F0\uB77D|\uC624\uBE60)/i
      ]
    },
    {
      label: LABELS.SPAM,
      confidence: 0.82,
      patterns: [
        /\b(?:free|giveaway|promo|telegram|whatsapp|crypto|airdrop)\b/i,
        /\b(?:subscribe\s+to\s+my\s+channel|earn\s+money|work\s+from\s+home)\b/i,
        /(?:\uBB34\uB8CC|\uC774\uBCA4\uD2B8|\uC99D\uC815|\uBD80\uC5C5|\uC218\uC775|\uB3C8\s*\uBC8C|\uC7AC\uD0DD|\uCF54\uC778|\uD22C\uC790|\uAE09\uB4F1|\uB9AC\uB529\uBC29|\uD154\uB808\uADF8\uB7A8|\uCE74\uD1A1|\uC624\uD508\uCC44\uD305)/i,
        /(?:\uAD6C\uB3C5|\uC88B\uC544\uC694).{0,10}(?:\uBD80\uD0C1|\uB9DE\uAD6C\uB3C5|\uB204\uB974\uBA74|\uBC18\uC0AC)/i,
        /(.)\1{8,}/
      ]
    },
    {
      label: LABELS.HARASSMENT,
      confidence: 0.85,
      patterns: [
        /\b(?:idiot|stupid|moron|loser|trash|kill yourself|kys)\b/i,
        /\b(?:shut up|go die|you suck)\b/i,
        /(?:\uBA4D\uCCAD|\uBCD1\uC2E0|\uBD05\uC2E0|\uBC14\uBCF4|\uC4F0\uB808\uAE30|\uD55C\uC2EC|\uAEBC\uC838|\uB2E5\uCCD0|\uC8FD\uC5B4|\uC790\uC0B4|\uADF9\uD610)/i,
        /(?:\uB2C8|\uB108|\uB2F9\uC2E0).{0,8}(?:\uC218\uC900|\uC5BC\uAD74|\uC778\uC0DD|\uAC00\uC871).{0,8}(?:\uD55C\uC2EC|\uB9DD\uD568|\uC4F0\uB808\uAE30|\uC5ED\uACB9)/i
      ]
    }
  ];

  function isCasualKoreanReaction(text) {
    const compact = text.replace(/\s+/g, "");
    return /^[\u314B\u314E\u3160\u315C!?~.]+$/u.test(compact)
      && /[\u314B\u314E\u3160\u315C]/u.test(compact)
      && compact.length >= 2;
  }

  function repeatedTokenRatio(text) {
    const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    if (tokens.length < 6) {
      return 0;
    }

    const unique = new Set(tokens);
    return 1 - unique.size / tokens.length;
  }

  function classifyByRules(text) {
    const normalized = String(text || "").trim();

    if (!normalized) {
      return {
        label: LABELS.MEANINGLESS,
        confidence: 0.95,
        source: "rules",
        reason: "empty comment"
      };
    }

    if (isCasualKoreanReaction(normalized)) {
      return {
        label: LABELS.SAFE,
        confidence: 0.84,
        source: "rules",
        reason: "casual Korean reaction"
      };
    }

    if (normalized.length <= 3 || repeatedTokenRatio(normalized) > 0.65) {
      return {
        label: LABELS.MEANINGLESS,
        confidence: 0.78,
        source: "rules",
        reason: "too short or repetitive"
      };
    }

    for (const rule of RULES) {
      if (rule.patterns.some((pattern) => pattern.test(normalized))) {
        return {
          label: rule.label,
          confidence: rule.confidence,
          source: "rules",
          reason: `matched ${rule.label} local pattern`
        };
      }
    }

    return {
      label: LABELS.SAFE,
      confidence: 0.72,
      source: "rules",
      reason: "no local harmful pattern"
    };
  }

  global.CleanCommentsRules = {
    LABELS,
    HARMFUL_LABELS,
    classifyByRules
  };
})(globalThis);
