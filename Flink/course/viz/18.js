/* Урок 18: как один медленный оператор раскрашивает граф. Модель повторяет формулу TaskIOMetricGroup:
   busy = 1000 - idle - backPressured. Входной поток 200 платежей в секунду, параллелизм 2. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l18-svg');
const slider = document.getElementById('viz-l18-slow');
const sliderValue = document.getElementById('viz-l18-slow-value');
const walkButton = document.getElementById('viz-l18-walk');
const resetButton = document.getElementById('viz-l18-reset');
const note = document.getElementById('viz-l18-result');

const INPUT_RATE = 200, PARALLELISM = 2;
const PER_SUBTASK = INPUT_RATE / PARALLELISM;
const BOX_W = 210, BOX_H = 72, BAR_H = 6;

// Цена одной записи в миллисекундах. Узкому оператору добавляется задержка с ползунка.
const VERTICES = [
  { id: 'source', name: 'Источник Kafka', detail: 'payments-raw → split-parsed', cost: 0.25, x: 0, y: 118, role: 'upstream' },
  { id: 'dedup', name: 'deduplicate', detail: 'keyBy(paymentId)', cost: 0.15, x: 255, y: 118, role: 'upstream' },
  { id: 'card', name: 'card-profile → slow-down', detail: 'узкий оператор', cost: 0.1, x: 510, y: 20, role: 'narrow' },
  { id: 'stats', name: 'merchant-stats-1m', detail: 'соседняя ветка', cost: 0.1, x: 510, y: 118, role: 'sibling' },
  { id: 'rules', name: 'правила и CEP', detail: 'соседняя ветка', cost: 0.3, x: 510, y: 216, role: 'sibling' }
];
const EDGES = [['source', 'dedup'], ['dedup', 'card'], ['dedup', 'stats'], ['dedup', 'rules']];
const WALK = ['source', 'dedup', 'card'];

let walkStep = -1;


function byId(id) { return VERTICES.find(v => v.id === id); }

function slowMs() { return Number(slider.value); }

function model() {
  const narrowCost = byId('card').cost + slowMs();
  const capacity = 1000 / narrowCost;
  const throughput = Math.min(PER_SUBTASK, capacity);
  const saturated = capacity < PER_SUBTASK;
  const metrics = {};
  VERTICES.forEach(v => {
    const cost = v.role === 'narrow' ? narrowCost : v.cost;
    const busy = Math.min(1000, Math.round(throughput * cost));
    let back = 0;
    if (saturated && v.role === 'upstream') back = 1000 - busy;
    metrics[v.id] = { busy, back, idle: 1000 - busy - back };
  });
  return { metrics, throughput: throughput * PARALLELISM, saturated, lagPerSecond: (PER_SUBTASK - throughput) * PARALLELISM };
}

const SEGMENTS = [['busy', 'tone-4'], ['back', 'tone-ink'], ['idle', 'tone-1']];
let scene = null;

function drawFrame() {
  const cv = diagram.canvas(svg, 720, 290);
  const nodes = new Map(VERTICES.map(v => [v.id, diagram.node(cv, { x: v.x, y: v.y, w: BOX_W, h: BOX_H, title: v.name, sub: '' })]));
  const edges = new Map(EDGES.map(([from, to]) => [to, diagram.edge(cv, nodes.get(from), nodes.get(to))]));
  const bars = new Map(VERTICES.map(v => {
    const g = nodes.get(v.id).el.append('g').attr('transform', `translate(14,${BOX_H - BAR_H - 12})`);
    g.append('rect').attr('class', 'dg-track').attr('width', BOX_W - 28).attr('height', BAR_H).attr('rx', 3);
    return [v.id, SEGMENTS.map(([, tone]) => g.append('rect').attr('class', 'dg-bar ' + tone).attr('height', BAR_H))];
  }));
  return { cv, nodes, edges, bars };
}

function drawVertex(v, m, highlighted) {
  const node = scene.nodes.get(v.id);
  node.setText(v.name, `busy ${m.busy} · back ${m.back} · idle ${m.idle}`);
  node.el.selectAll('.dg-node-title tspan').attr('y', 24);
  node.el.select('.dg-node-sub').attr('y', 42);
  node.setState(highlighted ? 'active' : m.busy >= 500 ? 'error' : '');
  let offset = 0;
  scene.bars.get(v.id).forEach((rect, i) => {
    const width = (BOX_W - 28) * m[SEGMENTS[i][0]] / 1000;
    diagram.tween(rect.node(), { attr: { x: offset, width }, duration: 0.4 });
    offset += width;
  });
}

function render() {
  sliderValue.textContent = slowMs() + ' мс';
  if (!scene) scene = drawFrame();
  const state = model();
  const current = walkStep >= 0 ? WALK[Math.min(walkStep, WALK.length - 1)] : null;
  VERTICES.forEach(v => drawVertex(v, state.metrics[v.id], v.id === current));
  scene.edges.forEach((edge, id) => edge.setActive(WALK.indexOf(id) > 0 && WALK.indexOf(id) <= walkStep));
  if (current && scene.edges.has(current)) diagram.sendPacket(scene.cv, scene.edges.get(current), { duration: 0.6 });
  return state;
}

function summary(state) {
  const rate = Math.round(state.throughput);
  if (!state.saturated) {
    return `Задание успевает. Через граф проходит ${rate} платежей в секунду из ${INPUT_RATE}, лаг не растёт. ` +
      `Каждой подзадаче узкого оператора достаётся ${PER_SUBTASK} записей в секунду, значит, бюджет на запись 10 мс.`;
  }
  return `Задание не успевает. Проходит ${rate} платежей в секунду из ${INPUT_RATE}, лаг Kafka растёт ` +
    `примерно на ${Math.round(state.lagPerSecond)} записей каждую секунду. Нажми «Шаг поиска» и пройди граф от источника.`;
}

function walk() {
  const state = model();
  walkStep = Math.min(walkStep + 1, WALK.length - 1);
  render();
  const id = WALK[walkStep];
  const m = state.metrics[id];
  const name = byId(id).name;
  if (!state.saturated) {
    note.textContent = `${name}. busy ${m.busy}, back ${m.back}. Обратного давления нет нигде, искать нечего.`;
    return;
  }
  if (m.back > 500) {
    note.textContent = `${name}. back ${m.back}, вершина почти всё время ждёт свободный буфер на выходе. ` +
      'Она жертва, причина ниже по потоку. Идём к следующей вершине.';
  } else {
    note.textContent = `${name}. busy ${m.busy}, back ${m.back}. Это первая вершина, которая занята сама и никого не ждёт. ` +
      'Это узкое место. Соседние ветки при этом простаивают, у них idle почти 1000, потому что общий предок стоит.';
  }
}

function reset() {
  walkStep = -1;
  note.textContent = summary(render());
}

slider.addEventListener('input', reset);
walkButton.addEventListener('click', walk);
resetButton.addEventListener('click', reset);
reset();
diagram.legend(svg, [['var(--color-actor-4)', 'busy, занята работой'], ['var(--color-text)', 'back, ждёт буфер на выходе'],
  ['var(--color-actor-1)', 'idle, ждёт входа']]);
