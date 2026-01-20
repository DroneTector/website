/* DroneTector — rotating typewriter (stable wrap + fixed height)
   - Desktop: respects \n for the 2-line split
   - Mobile: collapses \n to spaces
   - Pre-wraps final line breaks BEFORE typing so words never jump lines
   - Sets min-height to tallest phrase so layout never shifts
   - type -> hold -> clear -> gap -> next
   - Clears fully (no backspace/inverse typing). Respects prefers-reduced-motion.
*/
(function () {
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function parseJSON(v) {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function normalizePhrase(v) {
    return String(v ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\\\\n/g, "\n") // "\\n" -> "\n"
      .replace(/\\n/g, "\n")
      .trim();
  }

  function getLineHeightPx(el) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const lh = cs.lineHeight;
    if (!lh || lh === "normal") return fs * 1.6;
    const px = parseFloat(lh);
    return Number.isFinite(px) ? px : fs * 1.6;
  }

  function getCanvasFont(el) {
    const cs = getComputedStyle(el);
    // Canvas font shorthand: style variant weight size family
    const style = cs.fontStyle || "normal";
    const variant = cs.fontVariant || "normal";
    const weight = cs.fontWeight || "500";
    const size = cs.fontSize || "16px";
    const family = cs.fontFamily || "system-ui";
    return `${style} ${variant} ${weight} ${size} ${family}`;
  }

  function wrapTextToWidth(text, maxWidthPx, ctx) {
    // Preserve explicit paragraph breaks
    const paras = text.split("\n");
    const outLines = [];

    for (const para of paras) {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        outLines.push(""); // blank line
        continue;
      }

      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = line + " " + words[i];
        if (ctx.measureText(test).width <= maxWidthPx) {
          line = test;
        } else {
          outLines.push(line);
          line = words[i];
        }
      }
      outLines.push(line);
    }

    return outLines.join("\n");
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runRotate(el) {
    if (el.dataset.twInit) return;
    el.dataset.twInit = "1";

    const phrasesRaw = parseJSON(el.getAttribute("data-rotate")) || [];
    if (!phrasesRaw.length) return;

    const speed = Number(el.getAttribute("data-speed") || 70);
    const hold = Number(el.getAttribute("data-hold") || 1500);
    const gap = Number(el.getAttribute("data-gap") || 350);
    const cursorChar = el.getAttribute("data-cursor") || "▍";

    // Build stable DOM once
    const textSpan = document.createElement("span");
    textSpan.className = "twText";

    const cur = document.createElement("span");
    cur.className = "twCursor";
    cur.textContent = cursorChar;

    el.textContent = "";
    el.appendChild(textSpan);
    el.appendChild(cur);

    // Measure wrap width from the rotating element itself (matches CSS max-width rules)
    const host = el;

    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = getCanvasFont(el);

    function computeWrappedPhrases() {
      const isMobile = window.matchMedia("(max-width: 520px)").matches;

      const widthPx = Math.max(1, host.getBoundingClientRect().width);
      const lhPx = getLineHeightPx(el);

      const normalized = phrasesRaw.map(normalizePhrase).map((p) => {
        // On mobile, remove the manual break so it can wrap naturally
        const txt = isMobile ? p.replace(/\n/g, " ") : p;
        return wrapTextToWidth(txt, widthPx, ctx);
      });

      // Set min-height to tallest phrase (in lines)
      const maxLines = Math.max(
        ...normalized.map((t) => (t ? t.split("\n").length : 1))
      );
      el.style.minHeight = `${Math.ceil(maxLines * lhPx)}px`;

      return normalized;
    }

    let wrapped = computeWrappedPhrases();
    window.addEventListener("resize", () => {
      wrapped = computeWrappedPhrases();
    }, { passive: true });
    let idx = 0;

    while (true) {
      const phrase = wrapped[idx % wrapped.length];

      // Type (character-by-character, including \n)
      for (let i = 0; i <= phrase.length; i++) {
        textSpan.textContent = phrase.slice(0, i);
        await sleep(speed);
      }

      await sleep(hold);

      // Hard disappear (no backspace)
      textSpan.textContent = "";
      await sleep(gap);

      idx++;

      // // If screen resized, recompute wrap/height so it stays stable
      // // (cheap check each loop)
      // wrapped = computeWrappedPhrases();
    }
  }

  function init() {
    const els = Array.from(document.querySelectorAll("[data-rotate]"));

    if (reduced) {
      els.forEach((el) => {
        const phrases = parseJSON(el.getAttribute("data-rotate")) || [];
        const first = normalizePhrase(phrases[0] || el.textContent);
        el.textContent = first.replace(/\n/g, " "); // keep it simple for reduced motion
      });
      return;
    }

    els.forEach((el) => runRotate(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
