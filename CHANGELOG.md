# Changelog

## 0.1.0 - 2026-06-18

- Added initial Chrome Extension scaffold for YouTube comment filtering.
- Added Chrome Built-in AI / Gemini Nano Prompt API classifier path.
- Added rule-based fallback classifier.
- Added stronger Korean rule-based detection patterns.
- Added visible debug badges for blurred comments.
- Added popup setting to turn debug badges on or off.
- Added popup moderation style control: blur, blind, or dim.
- Added popup status for Prompt API availability and fallback usage.
- Added validation for moderation style settings before applying CSS classes.
- Added safer comment queueing to avoid duplicate work and empty-text false positives.
- Added async review flow: high-confidence rules blur immediately, while ambiguous comments stay visible with a subtle checking marker.
- Added comment blurring styles and YouTube comment observer.
- Added project guidance in `AGENTS.md`.
