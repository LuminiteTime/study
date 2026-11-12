/* Урок 4: как разные стратегии распределения раскладывают платежи по подзадачам. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l04-svg');
const strategySelect = document.getElementById('viz-l04-strategy');
const upInput = document.getElementById('viz-l04-up');
const downInput = document.getElementById('viz-l04-down');
const upValue = document.getElementById('viz-l04-up-value');
const downValue = document.getElementById('viz-l04-down-value');
const hotInput = document.getElementById('viz-l04-hot');
const button = document.getElementById('viz-l04-run');
const note = document.getElementById('viz-l04-result');

const RECORDS = 700, MERCHANTS = 50, HOT_SHARE = 0.3, MAX_PARALLELISM = 128;
const HOT_KEY = 'm-0000';
const WIDTH = 760, HEIGHT = 360, TOP = 44, ROWS_H = 304, BOX_W = 132, BOX_H = 38;
const UP_X = 0, DOWN_X = 300, BAR_X = 460, BAR_MAX = 240, PACKETS = 48;
let runId = 0;

// ---- Те же формулы, что в KeyGroupRangeAssignment и MathUtils Flink 2.2.1 ----

function javaStringHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return hash;
}

function rotateLeft(value, distance) {
  return (value << distance) | (value >>> (32 - distance));
}

function bitMix(value) {
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value | 0;
}

function murmurHash(code) {
  code = Math.imul(code, 0xcc9e2d51);
  code = rotateLeft(code, 15);
  code = Math.imul(code, 0x1b873593);
  code = rotateLeft(code, 13);
  code = (Math.imul(code, 5) + 0xe6546b64) | 0;
  code ^= 4;
  code = bitMix(code);
  if (code >= 0) return code;
  return code === -2147483648 ? 0 : -code;
}

function keyGroupOf(key) {
  return murmurHash(javaStringHash(key)) % MAX_PARALLELISM;
}

function subtaskOfKeyGroup(keyGroup, parallelism) {
  return Math.floor(keyGroup * parallelism / MAX_PARALLELISM);
}

/** Связи rescale считаются так же, как в VertexInputInfoComputationUtils.computeVertexInputInfoForPointwise. */
function pointwiseTargets(up, down) {
  const targets = Array.from({ length: up }, () => []);
  if (up >= down) {
    for (let t = 0; t < down; t++) {
      const start = Math.floor(t * up / down), end = Math.floor((t + 1) * up / down);
      for (let u = start; u < end; u++) targets[u].push(t);
    }
  } else {
    for (let u = 0; u < up; u++) {
      const start = Math.floor((u * down + up - 1) / up), end = Math.floor(((u + 1) * down + up - 1) / up);
      for (let t = start; t < end; t++) targets[u].push(t);
    }
  }
  return targets;
}

function allTargets(up, down) {
  return Array.from({ length: up }, () => Array.from({ length: down }, (_, t) => t));
}

// ---- Поток платежей ----

function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function merchantIds(withHotKey) {
  const random = seededRandom(42);
  return Array.from({ length: RECORDS }, () => {
    if (withHotKey && random() < HOT_SHARE) return HOT_KEY;
    const index = withHotKey ? 1 + Math.floor(random() * (MERCHANTS - 1)) : Math.floor(random() * MERCHANTS);
    return 'm-' + String(index).padStart(4, '0');
  });
}

// ---- Стратегии ----

const STRATEGIES = {
  hash: { label: 'keyBy (HASH)', links: allTargets },
  rebalance: { label: 'rebalance', links: allTargets },
  rescale: { label: 'rescale', links: pointwiseTargets },
  forward: { label: 'forward', links: (up, down) => up === down ? pointwiseTargets(up, down) : [] },
  broadcast: { label: 'broadcast', links: allTargets },
};

/** Для каждого платежа: подзадача-отправитель, получатели и горячий ли ключ. */
function route(strategy, up, down, keys) {
  const links = STRATEGIES[strategy].links(up, down);
  const random = seededRandom(7);
  const cursor = links.map(targets => Math.floor(random() * Math.max(1, targets.length)));
  const routing = { strategy, links, cursor, down };
  return keys.map((key, i) => {
    const sender = i % up;
    return { sender, receivers: pickReceivers(routing, key, sender), hot: key === HOT_KEY };
  });
}

function pickReceivers({ strategy, links, cursor, down }, key, sender) {
  if (strategy === 'hash') return [subtaskOfKeyGroup(keyGroupOf(key), down)];
  if (strategy === 'broadcast') return links[sender];
  const targets = links[sender];
  cursor[sender] = (cursor[sender] + 1) % targets.length;
  return [targets[cursor[sender]]];
}

/** Сколько платежей получила каждая подзадача и сколько из них от горячего продавца. */
function loadOf(routes, down) {
  const load = Array.from({ length: down }, () => ({ total: 0, hot: 0 }));
  routes.forEach(r => r.receivers.forEach(t => {
    load[t].total++;
    if (r.hot) load[t].hot++;
  }));
  return load;
}

// ---- Рисование ----

function rowY(index, count) {
  const step = ROWS_H / count;
  return TOP + step * index + (step - BOX_H) / 2;
}

function drawScene(s) {
  const cv = diagram.canvas(svg, WIDTH, HEIGHT);
  [[UP_X, 'map · отправители'], [DOWN_X, 'reduce · получатели'], [BAR_X, 'получено платежей']].forEach(([x, text]) => {
    cv.groups.append('text').attr('class', 'dg-caption').attr('x', x).attr('y', 14).text(text);
  });
  const senders = d3.range(s.up).map(u => diagram.node(cv, { x: UP_X, y: rowY(u, s.up), w: BOX_W, h: BOX_H, title: 'map #' + u }));
  const receivers = d3.range(s.down).map(t => diagram.node(cv, { x: DOWN_X, y: rowY(t, s.down), w: BOX_W, h: BOX_H, title: 'reduce #' + t }));
  const edges = new Map();
  STRATEGIES[s.strategy].links(s.up, s.down).forEach((targets, u) => targets.forEach(t => {
    edges.set(u + '>' + t, diagram.edge(cv, senders[u], receivers[t]));
  }));
  return { cv, edges, receivers, bars: receivers.map((r, t) => drawBar(cv, rowY(t, s.down))) };
}

function drawBar(cv, y) {
  const g = cv.nodes.append('g').attr('transform', `translate(${BAR_X},${y + BOX_H / 2 - 9})`);
  g.append('rect').attr('class', 'dg-track').attr('width', BAR_MAX).attr('height', 18).attr('rx', 4);
  const rest = g.append('rect').attr('class', 'dg-bar tone-1').attr('width', 0).attr('height', 18).attr('rx', 4);
  const hot = g.append('rect').attr('class', 'dg-bar tone-3').attr('width', 0).attr('height', 18).attr('rx', 4);
  const label = g.append('text').attr('class', 'dg-bar-label').attr('x', BAR_MAX + 8).attr('y', 13).text('0');
  return { rest: rest.node(), hot: hot.node(), label: label.node() };
}

function currentSettings() {
  return { strategy: strategySelect.value, up: Number(upInput.value), down: Number(downInput.value), withHotKey: hotInput.checked };
}

function redraw() {
  runId++;
  const s = currentSettings();
  upValue.textContent = s.up;
  downValue.textContent = s.down;
  const scene = drawScene(s);
  button.disabled = s.strategy === 'forward' && s.up !== s.down;
  note.textContent = button.disabled
    ? 'forward не допускает разный параллелизм. Задание упадёт ещё при построении графа с UnsupportedOperationException «Forward partitioning does not allow change of parallelism».'
    : 'Нажми кнопку, и ' + RECORDS + ' платежей от ' + MERCHANTS + ' продавцов разойдутся по подзадачам. Оранжевым отмечены платежи m-0000.';
  return scene;
}

async function run() {
  const scene = redraw();
  const id = runId;
  const s = currentSettings();
  const routes = route(s.strategy, s.up, s.down, merchantIds(s.withHotKey));
  const load = loadOf(routes, s.down);
  button.disabled = true;
  const flights = routes.slice(0, PACKETS).flatMap((r, i) => r.receivers.map(t => diagram.sendPacket(scene.cv, scene.edges.get(r.sender + '>' + t),
    { tone: r.hot ? '3' : '1', duration: 0.7, delay: i * 0.035, radius: 4 })));
  growBars(scene.bars, load, 0.035 * PACKETS + 0.7);
  await Promise.all(flights);
  if (id !== runId) return;
  button.disabled = false;
  note.textContent = summary(s, load);
}

function growBars(bars, load, duration) {
  const scale = d3.scaleLinear().domain([0, d3.max(load, l => l.total) || 1]).range([0, BAR_MAX]);
  load.forEach((l, t) => {
    const counter = { value: 0 };
    diagram.tween(bars[t].rest, { attr: { width: scale(l.total) }, duration, ease: 'power1.inOut' });
    diagram.tween(bars[t].hot, { attr: { width: scale(l.hot) }, duration, ease: 'power1.inOut' });
    diagram.tween(counter, { value: l.total, duration, ease: 'power1.inOut', onUpdate: () => { bars[t].label.textContent = Math.round(counter.value); } });
  });
}

function summary(s, load) {
  const totals = load.map(l => l.total);
  const skew = (d3.max(totals) / d3.mean(totals)).toFixed(2).replace('.', ',');
  let text = 'Самая загруженная подзадача получила в ' + skew + ' раза больше средней.';
  if (s.strategy === 'hash') {
    const group = keyGroupOf(HOT_KEY);
    text += ' Ключ ' + HOT_KEY + ' лежит в группе ' + group + ' из ' + MAX_PARALLELISM
      + ', поэтому всегда уходит в подзадачу ' + subtaskOfKeyGroup(group, s.down) + '.';
  }
  if (s.strategy === 'broadcast') text += ' Каждая подзадача получила все записи, сеть передала их ' + s.down + ' раз.';
  return text;
}

[strategySelect, upInput, downInput, hotInput].forEach(control => control.addEventListener('input', redraw));
button.addEventListener('click', run);
redraw();
