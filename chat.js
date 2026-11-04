/* Chat com IA do site. Conversa com /api/chat (a chave do Gemini fica só no servidor). */
(function () {
  const WA = 'https://wa.me/5551985710749?text=' + encodeURIComponent('Olá Victor! Vim pelo chat do seu site e quero conversar.');
  const GREETING = 'Olá! Sou o assistente do Victor. Posso tirar dúvidas sobre os serviços dele, como sites, sistemas e automação com IA. Como posso ajudar?';
  const CHIPS = ['Quais serviços você oferece?', 'Como a IA pode ajudar meu negócio?', 'Quero um orçamento'];
  const MAX = 600;
  let history = [], busy = false;

  const $ = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.textContent = h; return e; };

  /* ---------- estrutura ---------- */
  const btn = $('button', 'vn-chat-btn');
  btn.type = 'button'; btn.setAttribute('aria-label', 'Abrir chat com o assistente');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Pergunte à IA</span><i class="dot"></i>';

  const panel = $('section', 'vn-chat');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat com o assistente do Victor');
  const head = $('header');
  const logo = $('img'); logo.src = 'brand-icons-svg/logo.png'; logo.alt = '';
  const ttl = $('div'); ttl.innerHTML = '<b>Assistente do Victor</b><small><i></i>IA · responde na hora</small>';
  const close = $('button', null, '×'); close.type = 'button'; close.setAttribute('aria-label', 'Fechar chat');
  head.append(logo, ttl, close);

  const msgs = $('div', 'vn-msgs'); msgs.setAttribute('aria-live', 'polite');
  const chips = $('div', 'vn-chips');
  const form = $('form');
  const input = $('input'); input.type = 'text'; input.maxLength = MAX; input.placeholder = 'Escreva sua pergunta…'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Sua mensagem');
  const send = $('button'); send.type = 'submit'; send.setAttribute('aria-label', 'Enviar');
  send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  form.append(input, send);
  const note = $('div', 'vn-note', 'Respostas geradas por IA. Não envie dados sensíveis.');
  panel.append(head, msgs, chips, form, note);
  document.body.append(btn, panel);

  /* ---------- mensagens ---------- */
  function add(role, text) {
    const m = $('div', 'vn-m ' + (role === 'user' ? 'me' : 'bot'));
    const wa = /\[\[WHATSAPP\]\]/.test(text);
    m.textContent = text.replace(/\s*\[\[WHATSAPP\]\]\s*/g, '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '').trim();
    if (wa) {
      const a = $('a', 'wa', 'Falar com o Victor no WhatsApp'); a.href = WA; a.target = '_blank'; a.rel = 'noopener';
      m.append($('br'), a);
    }
    msgs.append(m); msgs.scrollTop = msgs.scrollHeight;
    return m;
  }
  function typing(on) {
    let t = msgs.querySelector('.vn-typing');
    if (on && !t) { t = $('div', 'vn-typing'); t.innerHTML = '<i></i><i></i><i></i>'; msgs.append(t); msgs.scrollTop = msgs.scrollHeight; }
    if (!on && t) t.remove();
  }
  function save() { try { sessionStorage.setItem('vn-chat', JSON.stringify(history.slice(-12))); } catch (e) {} }

  async function ask(text) {
    text = text.trim().slice(0, MAX);
    if (!text || busy) return;
    busy = true; send.disabled = true; chips.remove();
    add('user', text); history.push({ role: 'user', text });
    input.value = ''; typing(true);
    let reply;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.slice(-12) }) });
      const d = await r.json().catch(() => ({}));
      reply = d.reply || 'Não consegui responder agora. Fale direto com o Victor no WhatsApp. [[WHATSAPP]]';
      if (!r.ok && d.error) { history.pop(); }
    } catch (e) {
      reply = 'Estou sem conexão com o servidor agora. Fale direto com o Victor no WhatsApp. [[WHATSAPP]]';
      history.pop();
    }
    typing(false);
    add('model', reply);
    if (history.length && history[history.length - 1].role === 'user') history.push({ role: 'model', text: reply.replace(/\[\[WHATSAPP\]\]/g, '').trim() });
    save();
    busy = false; send.disabled = false; if (panel.classList.contains('open')) input.focus({ preventScroll: true });
  }

  /* ---------- abrir / fechar ---------- */
  function open() {
    panel.classList.add('open'); btn.classList.add('hide');
    setTimeout(() => input.focus({ preventScroll: true }), 250);
  }
  function shut() { panel.classList.remove('open'); btn.classList.remove('hide'); btn.focus({ preventScroll: true }); }
  btn.addEventListener('click', open);
  close.addEventListener('click', shut);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) shut(); });
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });

  /* ---------- estado inicial ---------- */
  try { history = JSON.parse(sessionStorage.getItem('vn-chat') || '[]').filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string'); } catch (e) { history = []; }
  add('model', GREETING);
  if (history.length) {
    history.forEach(m => add(m.role, m.text));
    chips.remove();
  } else {
    CHIPS.forEach(c => { const b = $('button', null, c); b.type = 'button'; b.addEventListener('click', () => ask(c)); chips.append(b); });
  }

  /* o menu mobile é tela cheia: esconde o chat enquanto ele está aberto */
  const menu = document.getElementById('mobileMenu');
  if (menu) new MutationObserver(() => { btn.style.display = menu.classList.contains('open') ? 'none' : ''; }).observe(menu, { attributes: true, attributeFilter: ['class'] });
})();
