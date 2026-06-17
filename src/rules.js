(function exposeRules(global) {
  const LABELS = Object.freeze({
    SPAM: "spam",
    ADULT_BAIT: "adult_bait",
    LINK_BAIT: "link_bait",
    MEANINGLESS: "meaningless",
    HARASSMENT: "harassment",
    SAFE: "safe"
  });

  const HARMFUL_LABELS = new Set([
    LABELS.SPAM,
    LABELS.ADULT_BAIT,
    LABELS.LINK_BAIT,
    LABELS.MEANINGLESS,
    LABELS.HARASSMENT
  ]);

  const RULES = [
    {
      label: LABELS.LINK_BAIT,
      confidence: 0.91,
      patterns: [
        /\b(?:https?:\/\/|www\.)\S+/i,
        /\b(?:bit\.ly|t\.co|tinyurl\.com|linktr\.ee|discord\.gg)\b/i,
        /\b(?:click|tap|visit|check)\s+(?:here|my\s+profile|this\s+link)\b/i,
        /(?:여기|프로필|링크|주소)\s*(?:클릭|확인|방문)/i,
        /(?:고정댓글|댓글창|설명란|더보기).{0,12}(?:링크|주소)/i
      ]
    },
    {
      label: LABELS.ADULT_BAIT,
      confidence: 0.88,
      patterns: [
        /\b(?:18\+|adult|nsfw|nude|onlyfans|sex|sexy|hot girls?)\b/i,
        /\b(?:meet|date)\s+(?:me|girls?|singles?)\b/i,
        /(?:19금|성인|야동|섹스|노출|몸매|은밀|조건만남|만남\s*원해)/i,
        /(?:여자|누나|언니).{0,8}(?:만날|만남|연락|오빠)/i
      ]
    },
    {
      label: LABELS.SPAM,
      confidence: 0.82,
      patterns: [
        /\b(?:free|giveaway|promo|telegram|whatsapp|crypto|airdrop)\b/i,
        /\b(?:subscribe\s+to\s+my\s+channel|earn\s+money|work\s+from\s+home)\b/i,
        /(?:무료|이벤트|증정|부업|수익|돈\s*벌|재택|코인|투자|급등|리딩방|텔레그램|카톡|오픈채팅)/i,
        /(?:구독|좋아요).{0,10}(?:부탁|맞구독|누르면|반사)/i,
        /(.)\1{8,}/
      ]
    },
    {
      label: LABELS.HARASSMENT,
      confidence: 0.85,
      patterns: [
        /\b(?:idiot|stupid|moron|loser|trash|kill yourself|kys)\b/i,
        /\b(?:shut up|go die|you suck)\b/i,
        /(?:멍청|병신|븅신|바보|쓰레기|한심|꺼져|닥쳐|죽어|자살|극혐)/i,
        /(?:니|너|당신).{0,8}(?:수준|얼굴|인생|가족).{0,8}(?:한심|망함|쓰레기|역겹)/i
      ]
    }
  ];

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
