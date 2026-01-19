/* DroneTector Landing — background canvas (VECTOR)
   Modes via <html data-bg="...">:
     - grid-static-detections : static grid + detection rings overlay (recommended)
     - grid-detections        : detections create subtle grid ripples (legacy)
     - grid-wave              : whole grid subtly ripples (legacy)
     - grid                   : static grid
     - hex                    : static hex

   Notes:
     - Canvas is fixed, behind content.
     - Respects prefers-reduced-motion.
*/
(function(){
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('bg');
  if(!canvas) return;
  const ctx = canvas.getContext('2d', { alpha:true });

  const cfg = {
    mode: document.documentElement.dataset.bg || 'grid-static-detections',
    dpi: Math.min(2, window.devicePixelRatio || 1),
    // Match CSS grid sizing (see --gridStep in base.css)
    step: 32,
    diag: 64,
    seg: 16,
    // Grid subtlety; can be tuned per page via data-grid-alpha on <html>.
    lineAlpha: 0.22,
  };

  const gridAlpha = parseFloat(document.documentElement.dataset.gridAlpha || "");
  if(Number.isFinite(gridAlpha)) cfg.lineAlpha = Math.max(0.05, Math.min(0.5, gridAlpha));

  // World map overlay.
  // Two modes:
  //  - CSS (default): map is behind the canvas (see single.css body::before).
  //  - Canvas cover (data-map-mode="cover"): map is rendered on the canvas
  //    ABOVE the grid but BELOW detections (so the grid doesn't sit on continents).
  const map = {
    enabled: (document.documentElement.dataset.mapMode === 'cover'),
    alpha: Math.max(0, Math.min(0.6, parseFloat(document.documentElement.dataset.mapAlpha || '0.22'))),
    scale: Math.max(1.0, Math.min(1.8, parseFloat(document.documentElement.dataset.mapScale || '1.32'))),
    posY: Math.max(-0.5, Math.min(1.5, parseFloat(document.documentElement.dataset.mapPosY || '0.15'))),
    img: null,
    ready: false,
  };

  // Detection styling knobs (tunable per page via data-* on <html>)
  //   data-hot-chance : chance a detection is "hot" (red)
  //   data-ping-min   : minimum ms between detections
  //   data-ping-max   : maximum ms between detections
  //   data-ring-life  : how long rings live (ms)
  //   data-ring-max   : max ring radius (px)
  const hotChance = Math.max(0, Math.min(1, parseFloat(document.documentElement.dataset.hotChance || '0.08')));
  const pingMinMs = Math.max(800, parseFloat(document.documentElement.dataset.pingMin || '7200'));
  const pingMaxMs = Math.max(pingMinMs, parseFloat(document.documentElement.dataset.pingMax || '12500'));
  const ringLifeMs = Math.max(280, parseFloat(document.documentElement.dataset.ringLife || '980'));
  const ringMaxR   = Math.max(18, parseFloat(document.documentElement.dataset.ringMax  || '72'));

  let w=0,h=0;
  let originX = 0;
  let originY = 0;

  // Offscreen map layer for cheap compositing.
  const mapCanvas = document.createElement('canvas');
  const mapCtx = mapCanvas.getContext('2d', { alpha:true });

  // Load the world map silhouette when using canvas cover mode.
  if(map.enabled){
    map.img = new Image();
    map.img.decoding = 'async';
    map.img.src = 'assets/img/world-map-silhouette.svg';
    map.img.onload = function(){
      map.ready = true;
      rebuildWorldMap();
    };
  }


  function hexToRgb(hex){
    const m = String(hex).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(!m) return null;
    let h = m[1];
    if(h.length===3) h = h.split('').map(ch => ch+ch).join('');
    const n = parseInt(h, 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }

  function seededRng(seed){
    let s = seed >>> 0;
    return function(){
      // LCG (deterministic)
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function rebuildWorldMap(){
    if(!map.enabled || !map.ready) return;

    mapCanvas.width  = Math.floor(w * cfg.dpi);
    mapCanvas.height = Math.floor(h * cfg.dpi);
    mapCtx.setTransform(cfg.dpi, 0, 0, cfg.dpi, 0, 0);
    mapCtx.clearRect(0, 0, w, h);

    const gridColor = cssVar('--grid', cssVar('--acc', '#30A6FF'));
    const maskColor = cssVar('--mapMask', 'rgba(0,0,0,0.70)');
    const img = map.img;
    const destW = w * map.scale;
    // Some browsers report 0×0 natural size for SVG; fall back to the SVG viewBox ratio (1200×600).
    const iw = img.naturalWidth || 1200;
    const ih = img.naturalHeight || 600;
    const destH = destW * (ih / iw);
    const x = (w - destW) / 2;
    const y = (h - destH) * map.posY;

    mapCtx.save();
    // Draw the SVG silhouette to create an alpha mask
    mapCtx.globalAlpha = 1;
    mapCtx.drawImage(img, x, y, destW, destH);

    // Mask the grid beneath the continents (so grid lines don't ride over the landmass).
    mapCtx.globalCompositeOperation = 'source-in';
    mapCtx.globalAlpha = map.alpha;
    mapCtx.fillStyle = maskColor;
    mapCtx.fillRect(0, 0, w, h);

    // Then add a faint ops-blue tint so the silhouette still reads as "map".
    mapCtx.globalAlpha = map.alpha * 0.55;
    mapCtx.fillStyle = gridColor;
    mapCtx.fillRect(0, 0, w, h);

    // Subtle edge definition
    mapCtx.globalCompositeOperation = 'source-atop';
    mapCtx.globalAlpha = map.alpha * 0.18;
    mapCtx.shadowColor = gridColor;
    mapCtx.shadowBlur = 10;
    mapCtx.fillRect(0, 0, w, h);

    mapCtx.restore();
  }
  function clampMod(v, m){
    if(!m) return 0;
    const r = v % m;
    return r < 0 ? r + m : r;
  }

  function updateOrigin(){
    // Align grid lines with the content columns (container left/top) for a clean ops-room feel.
    const el = document.querySelector('main.container') || document.querySelector('header.container') || document.querySelector('.container');
    if(!el){ originX = 0; originY = 0; return; }
    const r = el.getBoundingClientRect();
    originX = clampMod(r.left, cfg.step);
    originY = clampMod(r.top, cfg.step);
  }
  function resize(){
    w = Math.floor(window.innerWidth);
    h = Math.floor(window.innerHeight);
    canvas.width = Math.floor(w * cfg.dpi);
    canvas.height = Math.floor(h * cfg.dpi);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(cfg.dpi, 0, 0, cfg.dpi, 0, 0);
    updateOrigin();
    rebuildWorldMap();
  }

  function cssVar(name, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // --- Hex (fallback) ------------------------------------------------------
  function hexPoints(cx, cy, r){
    const pts=[];
    for(let i=0;i<6;i++){
      const a = Math.PI/3 * i + Math.PI/6;
      pts.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]);
    }
    return pts;
  }
  function drawHexStatic(){
    const r = 22;
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    ctx.globalAlpha = cfg.lineAlpha;
    for(let y=-r; y<h+r; y+=dy){
      const row = Math.round(y/dy);
      const off = (row % 2) ? dx/2 : 0;
      for(let x=-dx; x<w+dx; x+=dx){
        const pts = hexPoints(x+off, y, r);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for(let i=1;i<6;i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- Detection rings -----------------------------------------------------
  const pings = [];
  function spawnPing(now){
    // Spawn within a "safe" band so rings don't sit behind the nav/footer.
    pings.length = 0;
    pings.push({
      x: Math.random()*w,
      y: (0.16 + Math.random()*0.68)*h,
      t0: now,
      // legacy fields (used only by older warp modes)
      strength: 7 + Math.random()*8,
      lambda: 42 + Math.random()*34,
      life: ringLifeMs,
      hot: (Math.random() < hotChance),
    });
    // only one ping at a time (sequential)
  }

  function drawDetectionsOverlay(now){
    const acc2  = cssVar('--acc2',  '#6BFFCF');
    const alert = cssVar('--alert', '#FF4D5A');

    const ringCount = 3;
    // More spacing between rings (visual separation) without increasing max radius.
    const ringDelay = 170;   // ms between rings
    const speed     = ringMaxR / ringLifeMs; // px per ms

    for(const p of pings){
      const age = now - p.t0;
      if(age < 0 || age > p.life) continue;

      const fade = Math.max(0, 1 - age/p.life);
      const color = p.hot ? alert : acc2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Make "hot" (red) detections more apparent without overpowering the page.
      ctx.lineWidth = p.hot ? 3.2 : 1.25;
      ctx.shadowColor = color;
      ctx.shadowBlur  = p.hot ? 20 : 0;

      // Expanding concentric rings
      for(let i=0;i<ringCount;i++){
        const a = age - i*ringDelay;
        if(a < 0) continue;
        const r = Math.min(ringMaxR, a * speed);
        const alphaBase = p.hot ? 0.42 : 0.26;
        const alpha = alphaBase * fade * Math.max(0, 1 - a/p.life);
        if(alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI*2);
        ctx.stroke();
      }

      // Core blip
      if(age < 520){
        ctx.globalAlpha = (p.hot ? 0.82 : 0.52) * fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.hot ? 3.6 : 2.4, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // --- Optional grid warp fields (legacy) ---------------------------------
  function waveField(x,y,now){
    const t = now * 0.001;
    const a = 4.6;
    const b = 3.2;
    const f1 = 0.016;
    const f2 = 0.011;
    const dx = a*Math.sin(y*f1 + t*1.25) + b*Math.sin((y+w*0.07)*f2 - t*0.9);
    const dy = a*Math.sin(x*f1 - t*1.10) + (b*0.85)*Math.sin((x+h*0.09)*f2 + t*0.8);
    return { dx, dy };
  }

  function pingField(x,y,now){
    const t = now;
    let dx=0, dy=0;
    for(const p of pings){
      const age = t - p.t0;
      if(age < 0 || age > p.life) continue;
      const vx = x - p.x;
      const vy = y - p.y;
      const d = Math.sqrt(vx*vx + vy*vy) + 0.0001;

      const envelope = Math.exp(-d/420) * Math.exp(-age/p.life);
      const phase = (d/p.lambda) - (age/520);
      const wv = Math.sin(phase * Math.PI*2);
      const amp = p.strength * envelope * wv;
      dx += (vx/d) * amp;
      dy += (vy/d) * amp;
    }
    const base = waveField(x,y,now);
    dx += base.dx * 0.45;
    dy += base.dy * 0.45;
    return { dx, dy };
  }

  function field(x,y,now){
    // IMPORTANT: grid-static-detections does NOT warp the grid.
    if(cfg.mode === 'grid-detections') return pingField(x,y,now);
    if(cfg.mode === 'grid-wave') return waveField(x,y,now);
    return { dx:0, dy:0 };
  }

  // --- Grid renderer -------------------------------------------------------
  function strokePath(points){
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function drawGrid(now){
    const acc = cssVar('--grid', cssVar('--acc', '#30A6FF'));
    const grid = cssVar('--grid', acc);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = cfg.lineAlpha;

    const seg = cfg.seg;
    const step = cfg.step;
    // Draw past viewport edges so line ends never appear "cut off".
    const pad = step * 2;

    // verticals
    for(let x=originX - pad; x<=w+pad; x+=step){
      const pts=[];
      for(let y=-pad; y<=h+pad; y+=seg){
        const d = field(x,y,now);
        pts.push([x + d.dx, y + d.dy]);
      }
      strokePath(pts);
    }

    // horizontals
    for(let y=originY - pad; y<=h+pad; y+=step){
      const pts=[];
      for(let x=-pad; x<=w+pad; x+=seg){
        const d = field(x,y,now);
        pts.push([x + d.dx, y + d.dy]);
      }
      strokePath(pts);
    }

    // diagonals
    ctx.globalAlpha = cfg.lineAlpha * 0.72;
    const diag = cfg.diag;
    const len = Math.hypot(w, h) + pad;
    const steps = Math.max(3, Math.floor(len/seg));
    for(let i=-(h+pad) + originX; i<w+h+pad; i+=diag){
      const pts=[];
      for(let s=0; s<=steps; s++){
        const tt = s/steps;
        const y = -pad + (h + pad*2) * tt;
        const x = i - ((h + pad*2) * tt);
        const d = field(x,y,now);
        pts.push([x + d.dx, y + d.dy]);
      }
      strokePath(pts);
    }

    ctx.globalAlpha = 1;
  }

  // --- Animation loop ------------------------------------------------------
  let lastPingAt = 0;
  function wantsDetections(){
    return cfg.mode === 'grid-detections' || cfg.mode === 'grid-static-detections';
  }

  function frame(now){
    ctx.clearRect(0,0,w,h);

    // Reduced motion: crisp static grid, no detections.
    if(reduced){
      const acc = cssVar('--grid', cssVar('--acc', '#30A6FF'));
      const grid = cssVar('--grid', acc);
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.globalAlpha = cfg.lineAlpha;
      if((cfg.mode || '').startsWith('hex')){
        drawHexStatic();
      }else{
        drawGrid(now);
      }
      ctx.globalAlpha = 1;
      // World map overlay is static, so keep it even with reduced motion.
      if(map.enabled){
        ctx.drawImage(mapCanvas, 0, 0, w, h);
      }
      return;
    }

    // Clean up expired pings
    for(let i=pings.length-1;i>=0;i--){
      if(now - pings[i].t0 > pings[i].life) pings.splice(i,1);
    }

    // Autospawn detections
    // User preference: one detection at a time; spawn the next immediately after the previous expires.
    if(wantsDetections()) {
      if(pings.length === 0) {
        spawnPing(now);
        lastPingAt = now;
      }
    }

    // Background
    const acc = cssVar('--grid', cssVar('--acc', '#30A6FF'));
    const grid = cssVar('--grid', acc);
    ctx.strokeStyle = grid;
    if((cfg.mode || '').startsWith('hex')){
      drawHexStatic();
    }else{
      drawGrid(now);
    }

    // Subtle world map overlay (static)
    if(map.enabled){
      ctx.globalAlpha = 1;
      ctx.drawImage(mapCanvas, 0, 0, w, h);
    }

    // Overlay
    if(wantsDetections()) drawDetectionsOverlay(now);

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize, { passive:true });
  resize();
  requestAnimationFrame(frame);
})();
