/* DroneTector Landing — rotating typewriter

Targets elements with [data-rotate] (JSON array of phrases) and loops:
  type -> hold -> clear -> gap -> next

Clears fully (no backspace/inverse typing). Respects prefers-reduced-motion.
*/

(function(){
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sleep(ms){
    return new Promise((r) => setTimeout(r, ms));
  }

  function parseJSON(v){
    try{ return JSON.parse(v); }catch(_e){ return null; }
  }

  function normalizePhrase(v){
    // Handle attributes that may contain "\\n" or "\\\\n"
    return String(v ?? '')
      .replace(/\\\\n/g, '\n')
      .replace(/\\n/g, '\n');
  }

  async function runRotate(el){
    if(el.dataset.twInit) return;
    el.dataset.twInit = '1';

    const phrases = parseJSON(el.getAttribute('data-rotate')) || [];
    if(phrases.length === 0) return;

    const speed = Number(el.getAttribute('data-speed') || 52); // slower by default
    const hold  = Number(el.getAttribute('data-hold')  || 1250);
    const gap   = Number(el.getAttribute('data-gap')   || 240);
    const delay = Number(el.getAttribute('data-delay') || 0);
    const cursorChar = el.getAttribute('data-cursor') || '▍';

    if(delay) await sleep(delay);

    // Stable nodes: prevents text-node accumulation.
    const textSpan = document.createElement('span');
    textSpan.className = 'twText';
    const cur = document.createElement('span');
    cur.className = 'twCursor';
    cur.textContent = cursorChar;

    el.textContent = '';
    el.appendChild(textSpan);
    el.appendChild(cur);

    let idx = 0;
    while(true){
      const phrase = normalizePhrase(phrases[idx % phrases.length]);

      // Type
      for(let i = 0; i <= phrase.length; i++){
        textSpan.textContent = phrase.slice(0, i);
        await sleep(speed);
      }

      await sleep(hold);

      // Clear instantly (no backspace effect)
      textSpan.textContent = '';

      await sleep(gap);
      idx++;
    }
  }

  function init(){
    const els = Array.from(document.querySelectorAll('[data-rotate]'));

    if(reduced){
      els.forEach((el) => {
        const phrases = parseJSON(el.getAttribute('data-rotate')) || [];
        const first = normalizePhrase(phrases[0] || el.textContent);
        el.textContent = first;
      });
      return;
    }

    els.forEach((el) => { runRotate(el); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, { once:true });
  }else{
    init();
  }
})();
