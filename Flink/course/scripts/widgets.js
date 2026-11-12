/* Мелкие элементы страницы: копирование кода, раскрытие ответа, поиск по глоссарию, полоса прокрутки. */
const { $, $$ } = window.Course;
const COPIED_MS = 1200;

function copyCode(button) {
  const code = $('pre', button.closest('.code-file')).innerText;
  navigator.clipboard.writeText(code).then(() => {
    const label = button.textContent;
    button.textContent = 'Скопировано';
    setTimeout(() => { button.textContent = label; }, COPIED_MS);
  });
}

function wireAnswerReveal(button) {
  const showLabel = button.textContent;
  button.addEventListener('click', () => {
    const body = button.nextElementSibling;
    body.hidden = !body.hidden;
    button.textContent = body.hidden ? showLabel : 'Скрыть ответ';
  });
}

function filterGlossary(query) {
  $$('#global-glossary dt').forEach(term => {
    const definition = term.nextElementSibling;
    const hit = !query || (term.textContent + definition.textContent).toLowerCase().includes(query);
    term.style.display = definition.style.display = hit ? '' : 'none';
  });
}

function updateScrollBar(bar) {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
}

document.addEventListener('click', event => {
  const button = event.target.closest('.copy-btn');
  if (button) copyCode(button);
});
$$('.reveal-answer').forEach(wireAnswerReveal);
$('#glossary-search')?.addEventListener('input', event => filterGlossary(event.target.value.trim().toLowerCase()));
window.addEventListener('scroll', () => updateScrollBar($('#progress-bar')), { passive: true });
