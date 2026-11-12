/* Прогресс курса: какие уроки отмечены пройденными. Хранится в localStorage этого браузера. */
const { $, $$ } = window.Course;
const STORAGE_KEY = 'flink-course-v1';
const lessons = $$('.lesson');

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { done: {} };
  } catch {
    return { done: {} };
  }
}

const state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Приватный режим браузера: прогресс просто не сохранится.
  }
}

function renderNavNumbers() {
  $$('.nav-link').forEach(link => {
    const finished = Boolean(state.done[link.dataset.page]);
    link.classList.toggle('done', finished);
    const lesson = lessons.find(l => l.id === link.dataset.page);
    if (lesson) $('.nav-num', link).textContent = finished ? '✓' : lesson.dataset.num;
  });
}

function render() {
  const done = lessons.filter(l => state.done[l.id]).length;
  $('#course-progress').style.width = (done / lessons.length) * 100 + '%';
  $('#course-progress-label').textContent = `Пройдено ${done} из ${lessons.length}`;
  renderNavNumbers();
}

function markDone(lessonId) {
  state.done[lessonId] = true;
  save();
  render();
}

window.Course.progress = { lessons, render, markDone };
