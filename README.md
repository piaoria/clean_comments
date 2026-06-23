# clean_comments

YouTube harmful comment filtering Chrome Extension.

This project is designed around Chrome Built-in AI, Gemini Nano, and the Prompt API.

The extension currently runs in **AI-only mode**: every comment is judged by the Prompt API, and the local rule classifier is disabled for filtering. Comments the AI cannot judge (Prompt API unavailable, or a low-confidence harmful guess) are left visible instead of being filtered, to avoid catching innocent comments. The rule-based path is still in the codebase and can be re-enabled with `RULE_PREFILTER_ENABLED` in `src/content.js` and `RULES_FALLBACK_ENABLED` in `src/classifier.js`.

## Target Labels

- `spam`
- `adult_bait`
- `link_bait`
- `meaningless`
- `harassment`
- `safe`

## Current Behavior

- Runs as a Manifest V3 content-script extension on YouTube pages and processes comment threads when present.
- Watches newly loaded YouTube comments and replies.
- Classifies comment text with Chrome Built-in AI (AI-only mode); the local rule classifier does not filter comments by default.
- Sends comments to the AI in batches of up to 50 instead of one request per comment.
- Leaves comments visible when the Prompt API is unavailable or times out, instead of filtering them with local rules.
- Treats low-confidence harmful Prompt API results as safe so uncertain guesses do not hide innocent comments.
- Tolerates out-of-order, partial, or unparseable AI batch responses by matching on id and defaulting missing items to safe.
- Applies user-defined custom word and phrase filters before AI review.
- Offers clickable starter templates for harassment, spam bait, and adult bait custom filters.
- Filters harmful comments with a user-selected style: blur, blind, or dim.
- Provides a tabbed popup with general settings, label-specific behavior, custom words, and live status.
- Lets users enable or disable filtering per label and choose blur, blind, or dim per label.
- Shows a popup status dashboard with processed, safe, filtered, pending, queue, batch, source, and label counts, plus a header AI-status pill.
- Logs the classification pipeline to the page console with a shared structured logger; a popup "verbose log" toggle enables detailed per-comment debug logs.
- Keeps casual Korean reactions like repeated laughter or crying expressions out of the default meaningless filter.
- Keeps comments visible with a subtle checking marker during async AI review.
- Provides a popup setting to show or hide debug badges next to filtered comments.
- Shows Prompt API availability, AI/rule fallback counts, and last classification in the popup.
- Separates filter sources as Prompt API, local rules, or user settings in debug/status output.
- Marks processed comments with `data-clean-comments-*` attributes for debugging.

## Project Structure

```text
manifest.json
package.json
assets/
  icons/
popup/
  popup.css
  popup.html
  popup.js
src/
  logger.js
  classifier.js
  content.js
  rules.js
  styles.css
tests/
  run-tests.js
```

## Local Setup

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Select "Load unpacked".
5. Choose this project folder.
6. Open a YouTube video page and scroll to the comments.

## Verification

Run the lightweight regression checks with:

```bash
npm test
```

The tests cover local rule labels, Korean reaction exceptions, AI-only handling of low-confidence harmful results, high-confidence Prompt API results, batched and tolerant Prompt API classification, the AI-unavailable safe path, and popup template encoding.

## Debugging

All pipeline events are logged to the **page console** (not the popup) with the `[clean_comments]` prefix.

1. Open a YouTube video page with comments.
2. Open DevTools (`F12`) and select the **Console** tab.
3. Filter the console by `clean_comments` to see only this extension's logs.

You will see, by default (info level):

- Prompt API detection, availability, and session creation timing.
- Gemini Nano model download progress, if a download is triggered.
- Each batch: how many comments were sent, how long it took, and the resulting label counts.
- Every filtered comment with its label, source, confidence, reason, and a text snippet.
- Warnings when the AI is unavailable and comments are left visible.

For more detail (per-comment "kept" logs, raw AI responses, batch input text), enable **verbose logging**:

- Toggle **상세 로그 (Verbose log)** in the popup's 기본 (General) tab, or
- Run `localStorage.setItem("cleanCommentsVerbose", "1")` in the page console and reload.

To share logs for debugging, right-click in the console and use "Save as..." or copy the relevant `[clean_comments]` lines.

## Built-in AI Note

Chrome Built-in AI and the Prompt API may require a compatible Chrome version, local model availability, and browser settings or flags. The code checks for both the current `LanguageModel` style API and older experimental `ai.languageModel` style API before using the fallback classifier.

## Security Notes

- Comment text is classified locally in the browser by Chrome Built-in AI or local rules.
- The extension does not send comment text to an external server.
- Popup status stores counters and the last label/source/reason, not raw comment text.
- Custom filter words are stored in Chrome sync storage so the user's own browser profile can apply them.
- Per-label behavior settings are stored in Chrome sync storage with the rest of the user's preferences.
- DOM labels and badges use `textContent`, not HTML injection.
- User settings are validated before they affect CSS class names.
- Prompt API calls are time-limited and fall back to local rules to avoid blocking comment processing indefinitely.

## Design Principles

- Privacy first: comment text should be classified locally in the browser.
- AI first: use Gemini Nano through Chrome Built-in AI when available.
- Resilient fallback: keep a transparent local rule set for unsupported environments.
- Korean first pass: keep Korean spam, adult bait, link bait, meaningless, and harassment rules strong enough for early testing.
- Small surface area: start with content scripts before adding popup or options UI.
