/* Урок 16: какую ошибку видит каждый уровень тестов. Данные собраны из исходников и проверок на копии снапшота. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l16-svg');
const bugsBox = document.getElementById('viz-l16-bugs');
const note = document.getElementById('viz-l16-note');
const CENTER = 360, LAYER_HEIGHT = 44, LAYER_GAP = 4, TOP_HALF_WIDTH = 130, WIDEN_PER_LAYER = 36;

const LEVELS = [
  { id: 'e2e', label: 'E2E в контейнерах' },
  { id: 'mini', label: 'MiniCluster' },
  { id: 'topology', label: 'Топология без запуска' },
  { id: 'restore', label: 'Restore на harness' },
  { id: 'function', label: 'Функция на harness' },
];

const BUGS = [
  {
    label: 'Правило неверно считает платежи',
    caughtBy: ['function', 'restore', 'mini', 'e2e'],
    note: 'Логику видит любой уровень, который гоняет записи через функцию. Граничные случаи дешевле всего писать на harness. Топология записей не обрабатывает и этой ошибки не заметит.',
  },
  {
    label: 'Профиль карты лежит в обычном поле',
    caughtBy: ['restore'],
    note: 'Пока процесс жив, поле ведёт себя как состояние. На копии снапшота CardProfileFunctionTest остался зелёным, упал только CardProfileRestoreTest. MiniCluster и E2E заметят это, только если тест сам уронит задание и дождётся восстановления, в наших тестах такого сценария нет.',
  },
  {
    label: 'RuleConfig без Serializable',
    caughtBy: ['topology', 'mini', 'e2e'],
    note: 'Проверка сериализуемости идёт при добавлении функции в граф, harness этот путь обходит. MiniCluster поймает ошибку, если граф теста содержит DynamicRules. Наши MiniCluster-тесты его не строят и на копии снапшота остались зелёными, упал PipelineTopologyTest.',
  },
  {
    label: 'Забыт uid у оператора',
    caughtBy: ['topology'],
    note: 'Задание без uid работает нормально, поэтому кластерные тесты молчат. Restore на harness кладёт снимок под ID текущего оператора, uid там не участвует. Узнать об этом заранее можно только из графа.',
  },
  {
    label: 'Тип в потоке ушёл в Kryo',
    caughtBy: ['topology', 'e2e'],
    note: 'Запрет живёт в createEnvironment, его получают топология и E2E. Harness работает с собственной ExecutionConfig, где Kryo разрешён. MiniCluster-тесты проекта берут окружение без запрета.',
  },
  {
    label: 'Тип в состоянии ушёл в Kryo',
    caughtBy: ['e2e'],
    note: 'Сериализатор состояния создаётся в open, на работающей подзадаче. В графе его ещё нет, поэтому топология молчит. Из наших тестов только E2E запускает задание с запретом Kryo.',
  },
  {
    label: 'Ошибка видна при параллелизме больше 1',
    caughtBy: ['mini', 'e2e'],
    note: 'Harness по умолчанию крутит одну подзадачу. Документация Flink советует гонять конвейеры локально с параллелизмом больше 1 как раз ради таких ошибок.',
  },
  {
    label: 'Опечатка в SQL справочника продавцов',
    caughtBy: ['e2e'],
    note: 'AlertEnrichmentTest подставляет FixedRisk вместо базы, топология соединений не открывает. Настоящий запрос к PostgreSQL выполняет только E2E.',
  },
  {
    label: 'Транзакция Kafka не фиксируется',
    caughtBy: ['e2e'],
    note: 'Здесь нужен настоящий брокер, чекпоинты и потребитель с read_committed. Эту связку проверяет только E2E.',
  },
  {
    label: 'Конфликт классов в jar или в lib кластера',
    caughtBy: [],
    note: 'Все пять уровней работают на тестовом classpath Gradle. Толстый jar и образ Flink в них не участвуют, поэтому ошибка NoSuchMethodError из урока 14 пройдёт мимо. Её покажет только запуск собранного jar на настоящем образе.',
  },
];

function layerPoints(index) {
  const top = index * (LAYER_HEIGHT + LAYER_GAP);
  const upper = TOP_HALF_WIDTH + index * WIDEN_PER_LAYER;
  const lower = upper + WIDEN_PER_LAYER;
  return [
    [CENTER - upper, top], [CENTER + upper, top],
    [CENTER + lower, top + LAYER_HEIGHT], [CENTER - lower, top + LAYER_HEIGHT],
  ].map(point => point.join(',')).join(' ');
}

const tiers = diagram.canvas(svg, 720, LEVELS.length * (LAYER_HEIGHT + LAYER_GAP)).nodes
  .selectAll('g').data(LEVELS).join('g').attr('class', 'dg-tier');
tiers.append('polygon').attr('points', (_, i) => layerPoints(i));
tiers.append('text').attr('x', CENTER).attr('y', (_, i) => i * (LAYER_HEIGHT + LAYER_GAP) + LAYER_HEIGHT / 2 + 5).attr('text-anchor', 'middle');

function drawLayers(bug) {
  tiers.each(function (level) {
    const caught = bug.caughtBy.includes(level.id);
    d3.select(this).attr('class', 'dg-tier' + (caught ? ' is-caught' : ''))
      .select('text').text(level.label + (caught ? ', поймает' : ', пропустит'));
  });
}

function show(bug, button) {
  drawLayers(bug);
  bugsBox.querySelectorAll('button').forEach(other => {
    other.classList.remove('primary');
    other.setAttribute('aria-pressed', 'false');
  });
  button.classList.add('primary');
  button.setAttribute('aria-pressed', 'true');
  note.textContent = bug.note;
}

BUGS.forEach(bug => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = bug.label;
  button.addEventListener('click', () => show(bug, button));
  bugsBox.appendChild(button);
});
show(BUGS[0], bugsBox.querySelector('button'));
