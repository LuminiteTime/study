/* Подсказки терминов: наведение показывает определение, клик закрепляет, клик мимо прячет. */
const { $$, html } = window.Course;
const EDGE = 8;
const FADE_MS = 150;
let active = null;

function tooltipWidth() {
  return Math.min(320, Math.max(200, innerWidth * 0.8));
}

function place(term, tip) {
  const rect = term.getBoundingClientRect();
  const width = tooltipWidth();
  const centered = rect.left + rect.width / 2 - width / 2;
  tip.style.left = Math.max(EDGE, Math.min(centered, innerWidth - width - EDGE)) + 'px';
  tip.style.width = width + 'px';
  document.body.append(tip);
  const above = rect.top - tip.offsetHeight - EDGE;
  const flip = above < EDGE / 2;
  tip.classList.toggle('flip', flip);
  tip.style.top = (flip ? rect.bottom + EDGE : above) + 'px';
}

function dismiss(tip) {
  tip.classList.remove('visible');
  tip.remove();
  if (active === tip) active = null;
}

function show(term, tip) {
  if (active && active !== tip) dismiss(active);
  place(term, tip);
  requestAnimationFrame(() => tip.classList.add('visible'));
  active = tip;
}

function hide(tip) {
  tip.classList.remove('visible');
  setTimeout(() => { if (!tip.classList.contains('visible')) tip.remove(); }, FADE_MS);
  if (active === tip) active = null;
}

function attach(term) {
  const tip = html('span', 'term-tooltip', term.dataset.definition);
  term.addEventListener('mouseenter', () => show(term, tip));
  term.addEventListener('mouseleave', () => hide(tip));
  term.addEventListener('click', event => {
    event.stopPropagation();
    if (tip.classList.contains('visible')) hide(tip);
    else show(term, tip);
  });
}

$$('.term').forEach(attach);
document.addEventListener('click', () => { if (active) dismiss(active); });
