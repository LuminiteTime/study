/* Квиз: выбор варианта, проверка и сброс. Обработчик один на документ, разметке урока хватает классов. */
const { $, $$ } = window.Course;

function select(option) {
  $$('.quiz-option', option.closest('.quiz-question-block')).forEach(o => o.classList.remove('selected'));
  option.classList.add('selected');
}

function showFeedback(block, kind, content) {
  const feedback = $('.quiz-feedback', block);
  feedback.innerHTML = content;
  feedback.className = `quiz-feedback show ${kind}`;
}

function check(block) {
  const selected = $('.quiz-option.selected', block);
  if (!selected) {
    showFeedback(block, 'warning', 'Сначала выбери ответ.');
    return;
  }
  const { correct, explanationRight = '', explanationWrong = '' } = block.dataset;
  const right = selected.dataset.value === correct;
  $$('.quiz-option', block).forEach(o => { o.disabled = true; });
  $(`.quiz-option[data-value="${correct}"]`, block).classList.add('correct');
  if (!right) selected.classList.add('incorrect');
  showFeedback(block, right ? 'success' : 'error',
    right ? `<strong>Верно.</strong> ${explanationRight}` : `<strong>Не совсем.</strong> ${explanationWrong}`);
}

function reset(container) {
  $$('.quiz-option', container).forEach(o => {
    o.classList.remove('selected', 'correct', 'incorrect');
    o.disabled = false;
  });
  $$('.quiz-feedback', container).forEach(f => {
    f.className = 'quiz-feedback';
    f.textContent = '';
  });
}

document.addEventListener('click', event => {
  const option = event.target.closest('.quiz-option');
  const container = event.target.closest('.quiz-container');
  if (option) select(option);
  else if (event.target.closest('.quiz-check-btn')) $$('.quiz-question-block', container).forEach(check);
  else if (event.target.closest('.quiz-reset-btn')) reset(container);
});
