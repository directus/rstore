# 04b: E5 manual IME matrix, test script

The automated half of E5 (Chromium, CDP `Input.imeSetComposition`, 200 runs) passes ([04a](./04a-spike-report.md)). This script is the manual half: real input methods on the platforms whose composition events differ from Chromium's. It must be run by a person before `/ot`, `/server` (sequencer) and `/prosemirror` drop their "experimental" label.

## Setup

1. On a computer on the same network as the devices, from the repository root:

   ```sh
   pnpm install
   node packages/multiplayer/e2e/manual-page.mjs
   ```

   It bundles the E5 test page (two ProseMirror editors bound to an in-page sequencer, with random latency on every link) and serves it on port 5179 (`PORT` to change it).
2. On the device, open `http://<computer LAN address>:5179/?manual`. The page shows the controls **Reset**, **Remote typist** and **Check**, editor A (top) and editor B (bottom). Both start with the paragraph `hello world`.
3. Editor A is the one to type into with the IME. With **Remote typist: on**, editor B inserts one uppercase letter (`A`, `B`, `C`…) at a random place of the same paragraph every ~400 ms; it reaches editor A through the sequencer, so A receives remote edits while composing.
4. **Check** waits until nothing is in flight, then prints `CONVERGED` or `DIVERGED`, the number of remote letters typed, the number of compositions and of remote edits that arrived during a composition, and the text of editor A.

Tap **Reset** before each case.

## Matrix

| Platform | Browser | Input method |
| --- | --- | --- |
| macOS (latest) | Safari | Japanese – Romaji (Kotoeri), Live Conversion on and off |
| iOS (latest) | Safari | Japanese – Kana (flick) and Japanese – Romaji keyboards; also Dictation once |
| Android (latest) | Chrome | Gboard: English with autocorrect and suggestions, and Japanese (12-key) |

Optional if time allows: macOS Safari with Chinese – Pinyin, Android Samsung Keyboard.

## Cases

Run every case on every row of the matrix.

| # | Steps | Expected |
| --- | --- | --- |
| C1 | Remote typist off. Tap the end of the paragraph in A, compose `にほんご` (type `nihongo`), convert to `日本語`, commit | A and B show `hello world日本語`; Check: CONVERGED, compositions ≥ 1 |
| C2 | Remote typist **on**. Tap the middle of `hello world` in A, compose and commit three words in a row (`かな`, `てすと`, `日本`), with conversions | No committed character is lost or duplicated; every remote letter appears once; Check: CONVERGED, remote edits during a composition > 0 |
| C3 | Remote typist on. Start a composition, wait 3 s without committing (remote letters keep arriving), then commit | While composing, the composition is not disturbed (no jump, no reset of the underline); after commit, the remote letters held for this paragraph appear; CONVERGED |
| C4 | Remote typist on. Start a composition and cancel it (Escape on macOS, delete every composed character on mobile) | The paragraph has no trace of the cancelled text; remote letters present once; CONVERGED |
| C5 | Remote typist on. Compose and commit, then undo (Cmd/Ctrl+Z on macOS; skip on mobile unless a keyboard is attached) | Undo removes the committed word as one step and never removes a remote letter |
| C6 | Remote typist off (Android Gboard English only). Type a misspelled word, accept the autocorrection by typing a space, then pick a suggestion from the bar | The final word is in A and B exactly once; CONVERGED |
| C7 | Remote typist on. Compose across the end of the paragraph and press Enter (to split) right after committing | Two paragraphs; the committed text is in the first one exactly once; CONVERGED |
| C8 | Remote typist on. Keep composing (without committing) for more than 10 s | Remote letters are applied at the latest after 10 s (safety valve) even though the composition is still open; after commit, CONVERGED and no duplicated character |

## Recording results

For each (platform, input method, case): pass/fail, the Check output (copy the text) and, on failure, a screen recording and the device/browser/IME versions. A run passes when every case passes on every matrix row. Add the results as a section of [04a](./04a-spike-report.md) ("E5 manual matrix") and update the E5 row of its exit criteria table; then remove the "Experimental" notes listed in [06 X2 implementation notes](./06-slices.md#x2-implementation-notes-2026-10-03) if nothing else holds them.

## Known risks to watch

- Safari and iOS fire `compositionend` before the last `input` event, and iOS sometimes ends a composition without `compositionend` when the keyboard changes: watch C3 and C4.
- Gboard rewrites the word around the caret through composition updates (autocorrect, suggestions): watch C6 for doubled words.
- Android 12-key Japanese keeps a composition open across several taps: C8 exercises the 10 s hold limit.
