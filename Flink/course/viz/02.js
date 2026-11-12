/* Урок 2: планировщик слотов. Показывает, как подзадачи PayGuard ложатся в слоты кластера. */
const { diagram } = window.Course;

const OPERATORS = ['Source', 'drop-blank', 'Sink'];
const CHAIN_LABEL = 'цепочка';

const controls = {
  taskManagers: document.getElementById('viz-l02-tm'),
  slotsPerManager: document.getElementById('viz-l02-slots'),
  parallelism: document.getElementById('viz-l02-p'),
  chaining: document.getElementById('viz-l02-chain'),
  isolatedGroups: document.getElementById('viz-l02-groups'),
};
const values = {
  taskManagers: document.getElementById('viz-l02-tm-value'),
  slotsPerManager: document.getElementById('viz-l02-slots-value'),
  parallelism: document.getElementById('viz-l02-p-value'),
};
const board = document.getElementById('viz-l02-board');
const result = document.getElementById('viz-l02-result');

function readSettings() {
  const isolatedGroups = controls.isolatedGroups.checked;
  return {
    taskManagers: Number(controls.taskManagers.value),
    slotsPerManager: Number(controls.slotsPerManager.value),
    parallelism: Number(controls.parallelism.value),
    // Операторы из разных групп slot sharing в одну цепочку не склеиваются.
    chaining: controls.chaining.checked && !isolatedGroups,
    isolatedGroups,
  };
}

function vertexNames(settings) {
  return settings.chaining ? [CHAIN_LABEL] : OPERATORS;
}

/** Содержимое занятых слотов. Каждый элемент это подзадачи одного слота. */
function planSlots(settings) {
  const vertices = vertexNames(settings);
  const subtaskNumbers = Array.from({ length: settings.parallelism }, (_, i) => i + 1);
  if (settings.isolatedGroups) {
    return vertices.flatMap(vertex => subtaskNumbers.map(n => [vertex + ' #' + n]));
  }
  return subtaskNumbers.map(n => vertices.map(vertex => vertex + ' #' + n));
}

const WIDTH = 720, GAP = 8, PAD = 12, CHIP_H = 22, HEAD = 30;
const TONE = { Source: '1', 'drop-blank': '2', Sink: '3', [CHAIN_LABEL]: '1' };

/** Подзадача в слоте: цвет это оператор, подпись это номер подзадачи, имя оператора влезает только в широкий слот. */
function drawChip(layer, label, { x, y, w, late }) {
  const [vertex, number] = label.split(' #');
  const g = layer.append('g').attr('class', 'dg-chip tone-' + TONE[vertex] + (late ? ' is-late' : '')).attr('opacity', 0)
    .attr('transform', `translate(${x},${y})`);
  g.append('rect').attr('width', w).attr('height', CHIP_H - 4).attr('rx', 9);
  g.append('text').attr('x', w / 2).attr('y', 13).attr('text-anchor', 'middle').text(w >= 110 ? vertex + ' #' + number : '#' + number);
  return g;
}

function slotHeight(settings) {
  return PAD + (settings.isolatedGroups ? 1 : vertexNames(settings).length) * CHIP_H;
}

function drawManager(cv, settings, { index, y, slots }) {
  const slotW = (WIDTH - 2 * PAD - GAP * (settings.slotsPerManager - 1)) / settings.slotsPerManager;
  const h = HEAD + slotHeight(settings) + PAD;
  diagram.group(cv, { x: 0, y, w: WIDTH, h, label: 'TaskManager ' + index });
  slots.forEach((subtasks, i) => {
    const x = PAD + i * (slotW + GAP);
    cv.edges.append('rect').attr('class', 'dg-slot' + (subtasks ? ' is-busy' : ''))
      .attr('x', x).attr('y', y + HEAD).attr('width', slotW).attr('height', slotHeight(settings)).attr('rx', 8);
    (subtasks || []).forEach((label, j) => drawChip(cv.nodes, label, { x: x + 6, y: y + HEAD + 8 + j * CHIP_H, w: slotW - 12 }));
  });
  return h;
}

function drawWaiting(cv, labels, y) {
  const w = 120, perRow = Math.floor((WIDTH - 2 * PAD) / (w + GAP));
  const h = HEAD + Math.ceil(labels.length / perRow) * CHIP_H + PAD;
  const group = diagram.group(cv, { x: 0, y, w: WIDTH, h, label: 'слота не хватило, подзадачи ждут' });
  group.attr('class', 'dg-group is-error');
  labels.forEach((label, i) => drawChip(cv.nodes, label, {
    x: PAD + (i % perRow) * (w + GAP), y: y + HEAD + Math.floor(i / perRow) * CHIP_H, w, late: true,
  }));
  return h;
}

function renderBoard(settings, plannedSlots) {
  const cv = diagram.canvas(board, WIDTH, 1);
  let y = 0, next = 0;
  for (let manager = 1; manager <= settings.taskManagers; manager++) {
    const slots = plannedSlots.slice(next, next + settings.slotsPerManager);
    while (slots.length < settings.slotsPerManager) slots.push(null);
    next += settings.slotsPerManager;
    y += drawManager(cv, settings, { index: manager, y, slots }) + GAP;
  }
  const waiting = plannedSlots.slice(next).flat();
  if (waiting.length) y += drawWaiting(cv, waiting, y) + GAP;
  cv.root.attr('viewBox', `0 0 ${WIDTH} ${y - GAP}`);
  diagram.tween(cv.nodes.selectAll('.dg-chip').nodes(), { opacity: 1, duration: 0.25, stagger: 0.015 });
}

function describe(settings, plannedSlots) {
  const required = plannedSlots.length;
  const total = settings.taskManagers * settings.slotsPerManager;
  const threads = vertexNames(settings).length * settings.parallelism;
  if (required > total) {
    return 'Нужно слотов ' + required + ', в кластере ' + total + '. Задание целиком не заработает. '
      + 'Статус задания уже RUNNING, недостающие подзадачи ждут слот и падают с NoResourceAvailableException.';
  }
  return 'Нужно слотов ' + required + ', в кластере ' + total + ', свободными останутся ' + (total - required)
    + '. Подзадачи работают в ' + threads + ' потоках.';
}

function render() {
  const settings = readSettings();
  Object.keys(values).forEach(name => { values[name].textContent = controls[name].value; });
  controls.chaining.disabled = settings.isolatedGroups;
  const plannedSlots = planSlots(settings);
  renderBoard(settings, plannedSlots);
  result.textContent = describe(settings, plannedSlots);
}

Object.values(controls).forEach(control => control.addEventListener('input', render));
render();
diagram.legend(board, [['var(--color-actor-1)', 'Source или вся цепочка'], ['var(--color-actor-2)', 'drop-blank'],
  ['var(--color-actor-3)', 'Sink']]);
