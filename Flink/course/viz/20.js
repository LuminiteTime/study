/* Урок 20: что делает Flink Kubernetes Operator 1.16.1 после изменения spec.job.parallelism.
   Ветви повторяют AbstractJobReconciler.getJobUpgrade и ApplicationReconciler.getJobUpgrade
   при настройках по умолчанию: HA включён, версия Flink не менялась,
   last-state-fallback.enabled = true, last-state.job-cancel.enabled = false. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l20-svg');
const modeSelect = document.getElementById('viz-l20-mode');
const healthSelect = document.getElementById('viz-l20-health');
const runButton = document.getElementById('viz-l20-run');
const resetButton = document.getElementById('viz-l20-reset');
const list = document.getElementById('viz-l20-steps');
const note = document.getElementById('viz-l20-result');

const LIFECYCLE = ['STABLE', 'UPGRADING', 'DEPLOYED', 'STABLE'];
const ACTORS = ['FlinkDeployment', 'Оператор', 'Кластер Flink', '/flink-data'];
const STEP_MS = 1300;
let timers = [];
let scene = null;


function lastStateSteps(running) {
  const choice = running
    ? 'getJobUpgrade выбрал last-state через HA-метаданные. Предел возраста чекпоинта не задан, отмена задания при last-state по умолчанию выключена.'
    : 'Задание не RUNNING, базовый getJobUpgrade вернул unavailable. ApplicationReconciler нашёл HA-метаданные и выбрал last-state.';
  return [
    { lc: 1, actor: 1, text: choice },
    { lc: 1, actor: 2, text: 'Кластер удаляется, HA ConfigMap остаются. Новый savepoint не снимается.' },
    { lc: 2, actor: 3, jobId: 'A, прежний', state: 'из последнего чекпоинта',
      text: 'Новый JobManager с прежним jobId читает из ConfigMap указатель на последний чекпоинт. Записи после этого чекпоинта пройдут через задание ещё раз.' }
  ];
}

function modeSteps(mode, running) {
  if (mode === 'stateless') {
    return [
      { lc: 1, actor: 2, state: 'удалено',
        text: 'getJobUpgrade выбрал stateless. Задание отменяется, кластер удаляется вместе с HA ConfigMap.' },
      { lc: 2, actor: 2, jobId: 'B, новый', state: 'пустое',
        text: 'Новый JobManager получает новый jobId и стартует без состояния. Источник Kafka продолжит со смещений, закоммиченных в группе, а дедупликация, профили карт и окна начнутся с нуля.' }
    ];
  }
  if (mode === 'last-state') return lastStateSteps(running);
  if (!running) {
    return [{ lc: 1, actor: 1,
      text: 'Savepoint снять нельзя, задание не RUNNING. Флаг last-state-fallback.enabled по умолчанию true, и режим меняется на last-state.' }]
      .concat(lastStateSteps(false));
  }
  return [
    { lc: 1, actor: 2, text: 'getJobUpgrade выбрал savepoint. Оператор вызывает stop-with-savepoint, файлы ложатся в execution.checkpointing.savepoint-dir.' },
    { lc: 1, actor: 3, text: 'Появился FlinkStateSnapshot payguard-savepoint-upgrade-<время>, путь записан в status.jobStatus.upgradeSavepointPath.' },
    { lc: 2, actor: 2, jobId: 'B, новый', state: 'из savepoint',
      text: 'Старый кластер удалён. Новый JobManager получает новый jobId и путь к savepoint.' }
  ];
}

function buildSteps(mode, health) {
  const running = health === 'RUNNING';
  const head = [
    { lc: 0, actor: 0, text: 'kubectl patch меняет spec.job.parallelism с 2 на 3. Оператор получает событие об изменении ресурса.' },
    { lc: 0, actor: 1, text: 'Observe. Оператор спрашивает JobManager по REST и видит задание в состоянии ' + health + '.' },
    { lc: 1, actor: 1, text: 'Reconcile. Новая spec сравнивается с lastReconciledSpec. В режиме native поле parallelism даёт тип изменения UPGRADE.' }
  ];
  const tail = [
    { lc: 2, actor: 2, tms: '2 × 2 слота',
      text: 'Три подзадачи не помещаются в два слота, ResourceManager JobManager просит у Kubernetes второй под TaskManager.' },
    { lc: 3, actor: 1, text: 'Задание RUNNING, оператор копирует lastReconciledSpec в lastStableSpec.' }
  ];
  return head.concat(modeSteps(mode, running), tail);
}

const COL = 180, NODE_W = 160;

/** Рамка схемы: шкала lifecycleState, участники со связями и три факта о задании. */
function drawFrame() {
  const cv = diagram.canvas(svg, 700, 236);
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', 12).text('lifecycleState');
  cv.groups.append('line').attr('class', 'dg-lane').attr('x1', NODE_W / 2).attr('x2', 3 * COL + NODE_W / 2).attr('y1', 38).attr('y2', 38);
  const stages = LIFECYCLE.map((name, i) => {
    const g = cv.nodes.append('g').attr('transform', `translate(${i * COL + NODE_W / 2},38)`);
    g.append('rect').attr('x', -56).attr('y', -13).attr('width', 112).attr('height', 26).attr('rx', 13);
    g.append('text').attr('text-anchor', 'middle').attr('y', 4).text(name);
    return g;
  });
  const actors = ACTORS.map((name, i) => diagram.node(cv, { x: i * COL, y: 84, w: NODE_W, h: 46, title: name }));
  const links = actors.slice(1).map((actor, i) => diagram.edge(cv, actors[i], actor));
  const facts = ['jobId', 'TaskManager', 'Состояние'].map((name, i) => {
    const g = cv.nodes.append('g').attr('transform', `translate(${i * 240},170)`);
    g.append('rect').attr('class', 'dg-fact').attr('width', 220).attr('height', 58).attr('rx', 10);
    g.append('text').attr('class', 'dg-caption').attr('x', 14).attr('y', 22).text(name);
    return g.append('text').attr('class', 'dg-fact-value').attr('x', 14).attr('y', 44);
  });
  return { cv, stages, actors, links, facts, actor: -1 };
}

function draw(view) {
  scene.stages.forEach((g, i) => g.attr('class', 'dg-stage' + (i === view.lc ? ' is-active' : i < view.lc ? ' is-done' : '')));
  scene.actors.forEach((node, i) => node.setState(i === view.actor ? 'active' : ''));
  scene.links.forEach(link => link.setActive(false));
  const from = scene.actor, to = view.actor;
  if (from >= 0 && to >= 0 && Math.abs(from - to) === 1) {
    const link = scene.links[Math.min(from, to)];
    link.setActive(true);
    if (to > from) diagram.sendPacket(scene.cv, link, { duration: 0.6 });
  }
  scene.actor = to;
  [view.jobId, view.tms, view.state].forEach((value, i) => {
    const text = scene.facts[i];
    if (text.text() !== value) diagram.tween(text.text(value).node(), { opacity: 1, startAt: { opacity: 0 }, duration: 0.5 });
  });
}

function initialView() {
  return { lc: 0, actor: -1, jobId: 'A', tms: '1 × 2 слота', state: 'в работе' };
}

function stop() {
  timers.forEach(clearTimeout);
  timers = [];
}

function reset() {
  stop();
  list.replaceChildren();
  runButton.disabled = false;
  scene = drawFrame();
  draw(initialView());
  note.textContent = 'Выбери режим и состояние задания, затем примени patch.';
}

function run() {
  reset();
  runButton.disabled = true;
  const mode = modeSelect.value;
  const steps = buildSteps(mode, healthSelect.value);
  const view = initialView();
  steps.forEach((step, i) => {
    timers.push(setTimeout(() => {
      Object.assign(view, step);
      draw(view);
      const item = document.createElement('li');
      item.textContent = step.text;
      list.appendChild(item);
      if (i === steps.length - 1) {
        runButton.disabled = false;
        note.textContent = mode === 'savepoint' && healthSelect.value === 'RUNNING'
          ? 'Так прошёл апгрейд на стенде, от patch до STABLE 52 с.'
          : 'Сравни jobId и источник состояния с другими режимами.';
      }
    }, (i + 1) * STEP_MS));
  });
}

runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
[modeSelect, healthSelect].forEach(control => control.addEventListener('input', reset));
reset();
