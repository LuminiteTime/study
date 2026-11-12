/* Урок 9: очередь асинхронного оператора. Ёмкость, задержка запросов и режим ordered или unordered. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l09-svg');
const latency = document.getElementById('viz-l09-latency');
const latencyValue = document.getElementById('viz-l09-latency-value');
const capacity = document.getElementById('viz-l09-capacity');
const capacityValue = document.getElementById('viz-l09-capacity-value');
const ordered = document.getElementById('viz-l09-ordered');
const button = document.getElementById('viz-l09-run');
const result = document.getElementById('viz-l09-result');

const DURATION_MS = 4000, SLOW_SHARE = 0.12, SLOW_FACTOR = 8;
const WIDTH = 720, SLOT_Y = 52, CHART_TOP = 120, CHART_BOTTOM = 236, HEIGHT = 262;
let frame = null, ghost = null, scene = null;


/** Повторяемые случайные числа: оба режима получают одну и ту же серию задержек. */
function seededRandom(seed) {
  let state = seed;
  return function () {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleLatency(random, base) {
  const slow = random() < SLOW_SHARE;
  return slow ? base * SLOW_FACTOR : base * (0.6 + 0.8 * random());
}

/** Модель очереди AsyncWaitOperator: запись занимает место, пока её результат не выпущен дальше. */
function createModel(base, size, keepOrder) {
  const random = seededRandom(9);
  const queue = [];
  let emitted = 0, now = 0;

  function emitReady() {
    if (keepOrder) {
      while (queue.length && queue[0].doneAt <= now) {
        queue.shift();
        emitted++;
      }
      return;
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].doneAt <= now) {
        queue.splice(i, 1);
        emitted++;
      }
    }
  }

  function admit() {
    while (queue.length < size) {
      const took = sampleLatency(random, base);
      queue.push({ startedAt: now, doneAt: now + took, took });
    }
  }

  admit();
  return {
    advanceTo(target) {
      while (now < target) {
        now = Math.min(target, now + 1);
        emitReady();
        admit();
      }
    },
    queue,
    get emitted() { return emitted; },
    get now() { return now; },
  };
}

const timeX = d3.scaleLinear().domain([0, DURATION_MS]).range([40, WIDTH]);

/** Рамка: ряд мест очереди и график «выпущено записей» за 4 секунды, прошлый прогон остаётся пунктиром. */
function drawFrame(size) {
  const cv = diagram.canvas(svg, WIDTH, HEIGHT);
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', 12).text('очередь оператора, мест ' + size);
  const step = WIDTH / size, radius = Math.min(22, step / 2 - 6);
  const slots = cv.nodes.selectAll('g').data(d3.range(size)).join('g').attr('transform', i => `translate(${step * i + step / 2},${SLOT_Y})`);
  slots.append('circle').attr('class', 'dg-ring').attr('r', radius - 2.5);
  slots.append('path').attr('class', 'dg-ring-fill');
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', CHART_TOP - 14).text('выпущено записей');
  const y = d3.scaleLinear().range([CHART_BOTTOM, CHART_TOP]);
  const axis = cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${CHART_BOTTOM})`)
    .call(d3.axisBottom(timeX).tickValues([0, 1000, 2000, 3000, 4000]).tickSize(4).tickFormat(t => t / 1000 + ' с'));
  const yAxis = cv.groups.append('g').attr('class', 'dg-axis').attr('transform', 'translate(40,0)');
  const ghostPath = cv.edges.append('path').attr('class', 'dg-series is-ghost');
  const ghostLabel = cv.edges.append('text').attr('class', 'dg-node-sub');
  const path = cv.edges.append('path').attr('class', 'dg-series');
  return { cv, slots, radius, y, axis, yAxis, ghostPath, ghostLabel, path };
}

function slotState(entry, model) {
  if (!entry) return { tone: '', progress: 0 };
  if (entry.doneAt <= model.now) return { tone: 'tone-2', progress: 1 };
  const slow = entry.took > 2 * Number(latency.value);
  return { tone: slow ? 'tone-4' : 'tone-1', progress: Math.max(0.03, (model.now - entry.startedAt) / entry.took) };
}

function drawSlots(model) {
  const arc = d3.arc().innerRadius(scene.radius - 5).outerRadius(scene.radius).startAngle(0);
  scene.slots.select('.dg-ring-fill').each(function (i) {
    const { tone, progress } = slotState(model && model.queue[i], model);
    d3.select(this).attr('class', 'dg-ring-fill ' + tone).attr('d', arc({ endAngle: progress * 2 * Math.PI }));
  });
}

function drawSeries(points) {
  const top = Math.max(10, d3.max(points, p => p[1]) || 0, ghost ? d3.max(ghost.points, p => p[1]) : 0);
  scene.y.domain([0, top]).nice();
  scene.yAxis.call(d3.axisLeft(scene.y).ticks(3).tickSize(4));
  const line = d3.line().x(p => timeX(p[0])).y(p => scene.y(p[1]));
  scene.path.attr('d', points.length > 1 ? line(points) : null);
  if (!ghost) return;
  const last = ghost.points[ghost.points.length - 1];
  scene.ghostPath.attr('d', line(ghost.points));
  scene.ghostLabel.attr('x', timeX(last[0]) - 4).attr('y', scene.y(last[1]) - 8).attr('text-anchor', 'end').text('прошлый прогон, ' + ghost.mode);
}

function draw(model, size) {
  if (!model) scene = drawFrame(size);
  drawSlots(model);
  drawSeries(model ? model.points : []);
}

function run() {
  cancelAnimationFrame(frame);
  const base = Number(latency.value);
  const size = Number(capacity.value);
  const keepOrder = ordered.checked;
  const model = createModel(base, size, keepOrder);
  model.points = [[0, 0]];
  draw(null, size);
  const startedAt = performance.now();
  button.disabled = true;

  function step(now) {
    const target = Math.min(DURATION_MS, now - startedAt);
    model.advanceTo(target);
    model.points.push([target, model.emitted]);
    draw(model, size);
    if (target < DURATION_MS) {
      frame = requestAnimationFrame(step);
      return;
    }
    button.disabled = false;
    ghost = { points: model.points, mode: keepOrder ? 'ordered' : 'unordered' };
    const perSecond = Math.round(model.emitted * 1000 / DURATION_MS);
    const meanLatency = base * ((1 - SLOW_SHARE) + SLOW_SHARE * SLOW_FACTOR);
    const promised = Math.round(size * 1000 / meanLatency);
    result.textContent = 'Режим ' + (keepOrder ? 'ordered' : 'unordered') + '. Выпущено ' + model.emitted
      + ' записей, это ' + perSecond + ' в секунду. Оценка capacity делить на среднюю задержку даёт '
      + promised + ' в секунду. Поменяй режим и запусти ещё раз с теми же ползунками.';
  }
  frame = requestAnimationFrame(step);
}

latency.addEventListener('input', () => { latencyValue.textContent = latency.value + ' мс'; });
capacity.addEventListener('input', () => {
  capacityValue.textContent = capacity.value;
  draw(null, Number(capacity.value));
});
button.addEventListener('click', run);
draw(null, Number(capacity.value));
diagram.legend(svg, [['var(--color-actor-1)', 'запрос в работе'], ['var(--color-actor-4)', 'медленный запрос'],
  ['var(--color-actor-2)', 'результат готов и ждёт своей очереди']]);
