/* Маршрутизация по #урок/вкладка: показывает нужную страницу и вкладку, подсвечивает пункт содержания. */
const { $, $$, TABS } = window.Course;
const COURSE_TITLE = 'Flink в проде';
const pages = $$('.lesson, .page');

function parseHash() {
  const [pageId, tab] = (location.hash.slice(1) || 'home').split('/');
  return { page: document.getElementById(pageId) || $('#home'), tab: TABS.includes(tab) ? tab : TABS[0] };
}

function showTab(lesson, tab) {
  $$('.lesson-tab', lesson).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.lesson-panel', lesson).forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}

function route() {
  const { page, tab } = parseHash();
  pages.forEach(p => p.classList.toggle('current', p === page));
  $$('.nav-link').forEach(a => a.classList.toggle('current', a.dataset.page === page.id));
  const isLesson = page.classList.contains('lesson');
  if (isLesson) showTab(page, tab);
  document.title = isLesson ? `${page.dataset.title} · ${COURSE_TITLE}` : COURSE_TITLE;
  $('#sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}

$('#menu-toggle').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#menu-toggle').setAttribute('aria-expanded', open);
});

window.addEventListener('hashchange', route);
route();
