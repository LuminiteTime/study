/* Строит навигацию: содержание в сайдбаре, вкладки урока и кнопки перехода в подвале. */
const { $, html, progress } = window.Course;
const { lessons } = progress;
const TABS = [['theory', 'Теория'], ['practice', 'Практика'], ['task', 'Задание'], ['answer', 'Ответ'], ['glossary', 'Глоссарий']];
const REFERENCE_LINKS = [
  ['#spark-to-flink', '⇄', 'Spark и Flink: словарь перевода', 'spark-to-flink'],
  ['#glossary', 'Я', 'Общий глоссарий', 'glossary'],
];

function navLink([href, num, title, pageId]) {
  const link = html('a', 'nav-link');
  link.href = href;
  link.dataset.page = pageId;
  link.append(html('span', 'nav-num', num), html('span', 'nav-text', title));
  return link;
}

function buildNav() {
  const nav = $('#lesson-nav');
  let part = null;
  lessons.forEach(lesson => {
    if (lesson.dataset.part !== part) {
      part = lesson.dataset.part;
      nav.append(html('div', 'nav-part', part));
    }
    nav.append(navLink(['#' + lesson.id, lesson.dataset.num, lesson.dataset.title, lesson.id]));
  });
  nav.append(html('div', 'nav-part', 'Справка'), ...REFERENCE_LINKS.map(navLink));
}

function buildTabs(lesson) {
  const bar = $('.lesson-tabs', lesson);
  TABS.forEach(([key, label]) => {
    const tab = html('button', 'lesson-tab', label);
    tab.dataset.tab = key;
    tab.addEventListener('click', () => { location.hash = `${lesson.id}/${key}`; });
    bar.append(tab);
  });
}

function footerButton(text, onClick, primary) {
  const button = html('button', primary ? 'primary' : '', text);
  button.addEventListener('click', onClick);
  return button;
}

function buildFooter(lesson, index) {
  const footer = $('.lesson-footer', lesson);
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  if (previous) footer.append(footerButton('← ' + previous.dataset.title, () => { location.hash = previous.id; }));
  footer.append(footerButton(next ? 'Урок пройден, дальше →' : 'Курс пройден', () => {
    progress.markDone(lesson.id);
    location.hash = next ? next.id : 'home';
  }, true));
}

buildNav();
lessons.forEach((lesson, index) => {
  buildTabs(lesson);
  buildFooter(lesson, index);
});
progress.render();

window.Course.TABS = TABS.map(([key]) => key);
