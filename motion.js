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

  /* ---------- halo neon azul que segue o cursor (sem rastro) ---------- */
  if (fine) (function neon() {
    const cv = document.createElement('canvas'), cx = cv.getContext('2d');
    cv.className = 'm-neon'; cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    let W, H, dpr;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size(); addEventListener('resize', size);
    let tx = -999, ty = -999, x = tx, y = ty, life = 0, lastMove = 0;
    addEventListener('pointermove', e => {
      if (x < -500) { x = e.clientX; y = e.clientY; }
      tx = e.clientX; ty = e.clientY; lastMove = performance.now();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { lastMove = 0; });
    (function loop(t) {
      x += (tx - x) * .18; y += (ty - y) * .18;
      const active = t - lastMove < 900;
      life += ((active ? 1 : 0) - life) * (active ? .12 : .035);
      cx.clearRect(0, 0, W, H);
      if (life > .01 && x > -500) {
        const g = cx.createRadialGradient(x, y, 0, x, y, 180);
        g.addColorStop(0, `rgba(61,99,255,${.16 * life})`);
        g.addColorStop(1, 'rgba(61,99,255,0)');
        cx.fillStyle = g; cx.fillRect(x - 180, y - 180, 360, 360);
      }
      requestAnimationFrame(loop);
    })(0);
  })();

  /* ---------- scroll: header, progresso, #sobre, marquee ---------- */
  const header = $('header.header-blur'), sobre = $('#sobre');
  const bar = document.createElement('i'); bar.className = 'm-progress'; header?.append(bar);
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
    catchUp(); revealPassed();
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // marquee: acelera com a velocidade do scroll e desacelera até parar com o mouse em cima.
  // Controle só por JS (sem :hover no CSS), então nunca fica preso em pausa no toque.
  const tracks = $$('.marquee-track').map(el => ({ el, anims: el.getAnimations ? el.getAnimations() : [], hover: false, rate: 1 }))
    .filter(t => t.anims.length);
  if (tracks.length) {
    tracks.forEach(t => {
      t.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') t.hover = true; });
      t.el.addEventListener('pointerleave', () => { t.hover = false; });
      t.el.addEventListener('pointercancel', () => { t.hover = false; });
    });
    addEventListener('blur', () => tracks.forEach(t => { t.hover = false; }));
    // suavização por tempo real (não por quadro): volta ao ritmo no mesmo tempo mesmo se a aba engasgar
    const ease = (k, dt) => 1 - Math.pow(1 - k, dt / 16.7);
    let last = performance.now();
    (function m(now) {
      const dt = Math.min(Math.max((now || performance.now()) - last, 0), 250); last = now || performance.now();
      // saltos grandes (âncora do menu, restauração de scroll) não contam como "rolagem rápida"
      const v = Math.abs(vel) > 200 ? 0 : Math.abs(vel);
      const boost = 1 + clamp(v * .25, 0, 6); vel *= Math.pow(.9, dt / 16.7);
      tracks.forEach(t => {
        const target = t.hover ? 0 : boost;
        t.rate += (target - t.rate) * ease(t.hover ? .1 : .06, dt);
        if (!t.hover && t.rate < .05) t.rate = .05;
        t.anims.forEach(an => { if (an.playState !== 'running') an.play(); an.playbackRate = t.rate; });
      });
      requestAnimationFrame(m);
    })();
  }
})();
