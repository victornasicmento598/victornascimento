/* Camada de motion sobre o conteúdo original do index. Sem dependências. */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  root.classList.add('m');
  if (fine) root.classList.add('m-fine');

  /* ---------- quebra texto em palavras/letras com máscara ---------- */
  function splitWords(el) {
    let i = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'm-w';
          const s = document.createElement('span'); s.textContent = part; s.style.setProperty('--i', i++);
          w.append(s); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
    el.classList.add('m-split');
  }

  /* ---------- intro (uma vez por sessão) ---------- */
  let seen = false;
  try { seen = sessionStorage.getItem('m-intro') === '1'; sessionStorage.setItem('m-intro', '1'); } catch (e) {}
  function startHero() { setTimeout(() => root.classList.add('m-go'), 60); }
  if (!seen) {
    const intro = document.createElement('div');
    intro.className = 'm-intro'; intro.setAttribute('aria-hidden', 'true');
    intro.innerHTML = '<img src="brand-icons-svg/logo.png" alt=""><span class="m-count">00</span><i class="m-line"></i>';
    document.body.append(intro);
    const cnt = $('.m-count', intro), line = $('.m-line', intro), t0 = performance.now(), dur = 1100;
    (function tick(t) {
      const k = clamp((t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      cnt.textContent = String(Math.round(e * 100)).padStart(2, '0');
      line.style.transform = `scaleX(${e})`;
      if (k < 1) return requestAnimationFrame(tick);
      setTimeout(() => { intro.classList.add('out'); setTimeout(startHero, 350); setTimeout(() => intro.remove(), 1100); }, 120);
    })(t0);
  } else startHero();

  /* ---------- hero ---------- */
  $$('#hero h1').forEach(h1 => {
    const txt = h1.firstChild;
    if (!txt || txt.nodeType !== 3) return;
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
    const frag = document.createDocumentFragment();
    [...txt.textContent.trim()].forEach((ch, i) => {
      if (ch === ' ') { frag.append(' '); return; }
      const c = document.createElement('span'); c.className = 'm-c'; c.setAttribute('aria-hidden', 'true');
      const s = document.createElement('span'); s.textContent = ch; s.style.setProperty('--i', i);
      c.append(s); frag.append(c);
    });
    txt.replaceWith(frag);
  });
  $$('#hero .profile-frame').forEach(f => {
    f.closest('.reveal')?.classList.add('m-photo');
    const scan = document.createElement('span'); scan.className = 'm-scan'; scan.setAttribute('aria-hidden', 'true');
    f.append(scan);
  });

  const deskFrame = $('#hero .profile-frame.is-desktop');
  if (fine && deskFrame) {
    const hero = $('#hero'), wrap = deskFrame.parentElement;
    wrap.classList.add('m-tilt'); wrap.style.perspective = '1200px';
    hero.addEventListener('pointermove', e => {
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      wrap.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
      deskFrame.style.setProperty('--m-px', `${-x * 18}px`);
      deskFrame.style.setProperty('--m-py', `${-y * 18}px`);
    });
    hero.addEventListener('pointerleave', () => {
      wrap.style.transform = '';
      deskFrame.style.setProperty('--m-px', '0px'); deskFrame.style.setProperty('--m-py', '0px');
    });
  }

  /* ---------- títulos de seção e rótulos ---------- */
  const heads = $$('main section:not(#hero) h2');
  heads.forEach(splitWords);
  const labels = $$('main section:not(#hero) span.tracking-widest.uppercase');
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_<>';
  function scramble(el) {
    const final = el.dataset.mText || (el.dataset.mText = el.textContent);
    let f = 0; const total = 22;
    (function step() {
      el.textContent = [...final].map((ch, i) => {
        if (ch === ' ' || i < (f / total) * final.length) return ch;
        return glyphs[(Math.random() * glyphs.length) | 0];
      }).join('');
      if (++f <= total) requestAnimationFrame(step); else el.textContent = final;
    })();
  }
  labels.forEach(l => { l.classList.add('m-scr'); l.setAttribute('aria-label', l.textContent); });

  const pending = new Set([...heads, ...labels]);
  function trigger(el) {
    if (!pending.delete(el)) return;
    io.unobserve(el);
    if (el.matches('h2')) el.classList.add('m-in'); else scramble(el);
  }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) trigger(e.target); }),
    { threshold: .4, rootMargin: '0px 0px -40px 0px' });
  pending.forEach(el => io.observe(el));
  // rolagem muito rápida pode pular o observer: o que já passou da tela entra mesmo assim
  const catchUp = () => pending.forEach(el => { if (el.getBoundingClientRect().top < innerHeight * .9) trigger(el); });
  const revealPassed = () => $$('.reveal:not(.visible)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight * .9) el.classList.add('visible'); });

  /* ---------- cards: atraso escalonado por linha + spotlight ---------- */
  $$('.glass-card.reveal').forEach(c => {
    const sibs = [...c.parentElement.children].filter(n => n.classList.contains('glass-card'));
    c.style.transitionDelay = (sibs.indexOf(c) % 3) * 90 + 'ms';
    c.addEventListener('transitionend', function done(ev) {
      if (ev.propertyName !== 'transform' || !c.classList.contains('visible')) return;
      c.style.transitionDelay = ''; c.removeEventListener('transitionend', done);
    });
    if (fine) c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--m-x', e.clientX - r.left + 'px'); c.style.setProperty('--m-y', e.clientY - r.top + 'px');
    });
  });

  /* ---------- botões magnéticos ---------- */
  if (fine) $$('.btn-neon, .btn-outline').forEach(b => {
    b.classList.add('m-mag');
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.classList.add('m-on');
      b.style.setProperty('--m-bx', (e.clientX - r.left - r.width / 2) * .14 + 'px');
      b.style.setProperty('--m-by', (e.clientY - r.top - r.height / 2) * .2 + 'px');
    });
    b.addEventListener('pointerleave', () => { b.classList.remove('m-on'); b.style.setProperty('--m-bx', '0px'); b.style.setProperty('--m-by', '0px'); });
  });

  /* ---------- portfólio: imagens dos projetos ---------- */
  const shots = { 'bateroponto': 'assets/bater%20o%20ponto.png', 'vendaportzap': 'assets/portzap.png' };
  const projCards = $$('#portfolio a.glass-card').filter(a => Object.keys(shots).some(k => a.href.includes(k)));
  const srcOf = a => shots[Object.keys(shots).find(k => a.href.includes(k))];
  if (fine && projCards.length) {
    const pv = document.createElement('div'); pv.className = 'm-preview'; pv.setAttribute('aria-hidden', 'true');
    projCards.forEach(a => { const im = new Image(); im.src = srcOf(a); im.alt = ''; im.dataset.k = a.href; pv.append(im); });
    document.body.append(pv);
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const loop = () => {
      const dx = tx - x; x += dx * .14; y += (ty - y) * .14;
      pv.style.transform = `translate3d(${x - 170}px,${y - 230}px,0) rotate(${clamp(dx * .04, -8, 8)}deg)`;
      raf = pv.classList.contains('on') || Math.abs(dx) > .5 ? requestAnimationFrame(loop) : 0;
    };
    projCards.forEach(a => {
      a.addEventListener('pointerenter', e => {
        if (!raf) { x = tx = e.clientX; y = ty = e.clientY; }
        $$('img', pv).forEach(im => im.classList.toggle('on', im.dataset.k === a.href));
        pv.classList.add('on'); if (!raf) raf = requestAnimationFrame(loop);
      });
      a.addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
      a.addEventListener('pointerleave', () => pv.classList.remove('on'));
    });
  } else projCards.forEach(a => {
    const t = document.createElement('span'); t.className = 'm-thumb';
    t.innerHTML = `<img src="${srcOf(a)}" alt="" loading="lazy">`;
    a.prepend(t);
  });

  /* ---------- cards empilhados: Serviços e Portfólio ---------- */
  const stacks = ['#servicos', '#portfolio'].map(id => {
    const first = $(id + ' .glass-card');
    if (!first) return null;
    const box = first.parentElement; box.classList.add('m-stack');
    const cards = [...box.children].filter(n => n.classList.contains('glass-card'));
    cards.forEach((c, k) => { c.classList.remove('reveal'); c.style.transitionDelay = ''; c.style.setProperty('--k', k); });
    return cards;
  }).filter(Boolean);
  function updateStacks() {
    stacks.forEach(cards => {
      const tops = cards.map(c => c.getBoundingClientRect().top);
      const stick = cards.map(c => parseFloat(getComputedStyle(c).top) || 0);
      cards.forEach((c, i) => {
        let depth = 0;
        for (let j = i + 1; j < cards.length; j++) depth += clamp(1 - (tops[j] - stick[j]) / (innerHeight * .55));
        c.style.setProperty('--m-s', (1 - depth * .045).toFixed(4));
        c.style.setProperty('--m-b', (1 - depth * .07).toFixed(4));
      });
    });
  }

  /* ---------- neon azul que segue o cursor ---------- */
  (function neon() {
    const cv = document.createElement('canvas'), cx = cv.getContext('2d');
    cv.className = 'm-neon'; cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    let W, H, dpr;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size(); addEventListener('resize', size);
    const N = 26, trail = [];
    let tx = -999, ty = -999, x = tx, y = ty, life = 0, lastMove = 0, down = false;
    const move = e => {
      if (x < -500) { x = e.clientX; y = e.clientY; }
      tx = e.clientX; ty = e.clientY; lastMove = performance.now();
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerdown', e => { down = true; move(e); }, { passive: true });
    addEventListener('pointerup', () => { down = false; }, { passive: true });
    document.addEventListener('pointerleave', () => { lastMove = 0; });
    (function loop(t) {
      x += (tx - x) * .28; y += (ty - y) * .28;
      // acende ao mover, apaga devagar quando o cursor para (no toque, apaga ao soltar)
      const active = t - lastMove < (fine ? 900 : (down ? 900 : 250));
      life += ((active ? 1 : 0) - life) * (active ? .12 : .035);
      trail.unshift({ x, y }); if (trail.length > N) trail.pop();
      cx.clearRect(0, 0, W, H);
      if (life > .01 && x > -500) {
        // halo amplo
        const g = cx.createRadialGradient(x, y, 0, x, y, 180);
        g.addColorStop(0, `rgba(61,99,255,${.16 * life})`);
        g.addColorStop(1, 'rgba(61,99,255,0)');
        cx.fillStyle = g; cx.fillRect(x - 180, y - 180, 360, 360);
        // rastro: brilho largo + núcleo fino, afinando até a cauda
        cx.lineCap = 'round';
        for (const pass of [{ w: 14, a: .10, c: '26,63,212' }, { w: 6, a: .35, c: '61,99,255' }, { w: 1.8, a: .95, c: '200,214,255' }]) {
          for (let i = 1; i < trail.length; i++) {
            const k = 1 - i / trail.length;
            cx.strokeStyle = `rgba(${pass.c},${pass.a * k * life})`;
            cx.lineWidth = pass.w * (.25 + k * .75);
            cx.beginPath(); cx.moveTo(trail[i - 1].x, trail[i - 1].y); cx.lineTo(trail[i].x, trail[i].y); cx.stroke();
          }
        }
        // ponto de luz na ponta
        cx.fillStyle = `rgba(230,236,255,${life})`;
        cx.shadowColor = 'rgba(61,99,255,.9)'; cx.shadowBlur = 18;
        cx.beginPath(); cx.arc(x, y, 3, 0, 6.283); cx.fill();
        cx.shadowBlur = 0;
      }
      requestAnimationFrame(loop);
    })(0);
  })();

  /* ---------- scroll: header, progresso, #sobre, marquee ---------- */
  const header = $('header.header-blur'), sobre = $('#sobre');
  const bar = document.createElement('i'); bar.className = 'm-progress'; header?.append(bar);
  const marq = $$('.marquee-track').flatMap(t => t.getAnimations ? t.getAnimations() : []);
  let lastY = scrollY, vel = 0, ticking = false;
  function onScroll() {
    const y = scrollY, H = innerHeight, max = document.documentElement.scrollHeight - H;
    const dy = y - lastY; lastY = y;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (header && !document.querySelector('.mobile-menu.open')) header.classList.toggle('m-hide', dy > 4 && y > 300);
    if (dy < -4) header?.classList.remove('m-hide');
    if (sobre) {
      const r = sobre.getBoundingClientRect(), p = clamp(1 - r.top / (H * .9));
      const inset = (1 - p) * Math.min(innerWidth * .05, 48);
      sobre.style.setProperty('--m-inset', inset.toFixed(1) + 'px');
      sobre.style.setProperty('--m-r', ((1 - p) * 36).toFixed(1) + 'px');
    }
    vel = dy;
    catchUp(); revealPassed(); updateStacks();
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // marquee acelera com a velocidade do scroll e volta ao ritmo normal
  if (marq.length) {
    let rate = 1;
    (function m() {
      const target = 1 + clamp(Math.abs(vel) * .25, 0, 6);
      rate += (target - rate) * .08; vel *= .9;
      marq.forEach(a => { a.playbackRate = rate; });
      requestAnimationFrame(m);
    })();
  }
})();
