/* Урок 5: симулятор watermark для источника, который читает три партиции. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l05-svg');
const bound = document.getElementById('viz-l05-bound');
const boundValue = document.getElementById('viz-l05-bound-value');
const delay = document.getElementById('viz-l05-delay');
const delayValue = document.getElementById('viz-l05-delay-value');
const outage = document.getElementById('viz-l05-outage');
const idleness = document.getElementById('viz-l05-idle');
const button = document.getElementById('viz-l05-run');
const result = document.getElementById('viz-l05-result');

const PARTITIONS = 3, DURATION = 30, EVENT_STEP = 0.5, TICK = 0.1;
const DELAYED_SHARE = 0.25, IDLE_TIMEOUT = 4, SILENT = 2, OUTAGE_FROM = 10, OUTAGE_TO = 20;
const SPEEDUP = 3;
const X0 = 130, X1 = 710, LANES = [66, 118, 170], TOP = 32, BOTTOM = 196;
let frame = null, scene = null;


const x = d3.scaleLinear().domain([0, DURATION]).range([X0, X1]).clamp(true);

function seconds(value) {
  return value.toFixed(1).replace('.', ',') + ' с';
}

/** Повторяемый генератор случайных чисел: при тех же ползунках получаются те же события. */
function seededRandom(seed) {
  let state = seed;
  return function () {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateEvents(maxDelay, withOutage) {
  const random = seededRandom(5);
  const events = [];
  for (let p = 0; p < PARTITIONS; p++) {
    for (let created = p * 0.17; created < DURATION; created += EVENT_STEP) {
      const delayed = random() < DELAYED_SHARE;
      const lag = delayed ? random() * maxDelay : random() * 0.3;
      const jitter = (random() - 0.5) * 14;
      const silent = withOutage && p === SILENT && created >= OUTAGE_FROM && created < OUTAGE_TO;
      const arrival = silent ? OUTAGE_TO + (created - OUTAGE_FROM) * 0.15 : created;
      events.push({ partition: p, ts: Math.max(0, created - lag), arrival, jitter, late: false });
    }
  }
  return events.sort((a, b) => a.arrival - b.arrival);
}

/**
 * Прогон модели. Каждый тик равен периодическому выпуску watermark: сначала приходят записи
 * и сравниваются с уже выпущенным watermark, затем считается новый минимум по активным партициям.
 */
function simulate(outOfOrderness, maxDelay, withOutage, withIdleness) {
  const events = generateEvents(maxDelay, withOutage);
  const maxTs = Array(PARTITIONS).fill(-Infinity);
  const lastArrival = Array(PARTITIONS).fill(0);
  let combined = -Infinity, next = 0, stalledAt = null;
  const snapshots = [];
  const ticks = Math.round((DURATION + 2) / TICK);
  for (let k = 1; k <= ticks; k++) {
    const t = k * TICK;
    while (next < events.length && events[next].arrival <= t) {
      const event = events[next++];
      event.late = event.ts <= combined;
      maxTs[event.partition] = Math.max(maxTs[event.partition], event.ts);
      lastArrival[event.partition] = event.arrival;
    }
    const idle = lastArrival.map(last => withIdleness && t - last > IDLE_TIMEOUT);
    const own = maxTs.map(m => m - outOfOrderness);
    combined = Math.max(combined, minOverActive(own, idle));
    if (t < OUTAGE_TO) stalledAt = combined;
    snapshots.push({ t, arrived: next, own, idle, combined });
  }
  return { events, snapshots, stalledAt };
}

/** Общий watermark источника: минимум по активным партициям, а если активных нет, максимум по всем. */
function minOverActive(own, idle) {
  const active = own.filter((_, p) => !idle[p]);
  return active.length ? Math.min(...active) : Math.max(...own);
}

/** Неподвижная часть: дорожки партиций, ось, закрытая зона и флажок watermark. Кадр только двигает их. */
function buildScene() {
  const cv = diagram.canvas(svg, 720, 224);
  const past = cv.groups.append('rect').attr('class', 'dg-past').attr('x', X0).attr('y', TOP).attr('height', BOTTOM - TOP).attr('width', 0);
  const lanes = LANES.map((y, p) => {
    const label = cv.groups.append('text').attr('class', 'dg-node-title').attr('x', 0).attr('y', y + 4).attr('text-anchor', 'start');
    const line = cv.groups.append('line').attr('class', 'dg-lane').attr('x1', X0).attr('x2', X1).attr('y1', y).attr('y2', y);
    const own = cv.packets.append('line').attr('class', 'dg-own-wm').attr('y1', y - 15).attr('y2', y + 15).attr('opacity', 0);
    return { p, label, line, own };
  });
  cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${BOTTOM})`)
    .call(d3.axisBottom(x).tickValues(d3.range(0, DURATION + 1, 5)).tickSize(4).tickFormat(t => t + ' с'));
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', BOTTOM + 18).text('время события');
  const now = cv.edges.append('line').attr('class', 'dg-now').attr('y1', TOP).attr('y2', BOTTOM);
  const mark = cv.packets.append('g').attr('class', 'dg-watermark').attr('opacity', 0);
  mark.append('line').attr('y1', TOP).attr('y2', BOTTOM);
  mark.append('rect').attr('class', 'dg-flag').attr('y', TOP - 26).attr('height', 20).attr('rx', 10);
  mark.append('text').attr('y', TOP - 12).attr('text-anchor', 'middle');
  return { cv, past, lanes, now, mark, dots: cv.nodes.append('g') };
}

function drawFrame(model, snapshot) {
  drawLanes(snapshot);
  drawEvents(model, snapshot);
  drawWatermark(snapshot);
  scene.now.attr('x1', x(snapshot.t)).attr('x2', x(snapshot.t));
}

function drawLanes(snapshot) {
  scene.lanes.forEach(({ p, label, line, own }) => {
    const idle = snapshot.idle[p], wm = snapshot.own[p];
    label.text('Партиция ' + p + (idle ? ' · idle' : ''));
    line.classed('is-idle', idle);
    own.attr('opacity', Number.isFinite(wm) ? 1 : 0).attr('x1', x(wm) || X0).attr('x2', x(wm) || X0);
  });
}

function drawEvents(model, snapshot) {
  scene.dots.selectAll('circle').data(model.events.slice(0, snapshot.arrived)).join('circle')
    .attr('class', e => 'dg-dot ' + (e.late ? 'tone-4' : 'is-faint'))
    .attr('cx', e => x(e.ts)).attr('cy', e => LANES[e.partition] + e.jitter).attr('r', e => (e.late ? 4.5 : 3.5));
}

function drawWatermark(snapshot) {
  const visible = Number.isFinite(snapshot.combined) && snapshot.combined > 0;
  scene.mark.attr('opacity', visible ? 1 : 0);
  scene.past.attr('width', visible ? x(snapshot.combined) - X0 : 0);
  if (!visible) return;
  const label = 'W ' + seconds(snapshot.combined), width = label.length * 7 + 18;
  scene.mark.attr('transform', `translate(${x(snapshot.combined)},0)`);
  scene.mark.select('rect').attr('x', -width / 2).attr('width', width);
  scene.mark.select('text').text(label);
}

function summary(model, withOutage, withIdleness) {
  const late = model.events.filter(e => e.late);
  const share = Math.round(late.length * 100 / model.events.length);
  const last = model.snapshots[model.snapshots.length - 1];
  let text = 'Событий ' + model.events.length + ', поздних ' + late.length + ' (' + share + ' %). '
    + 'Итоговый watermark ' + seconds(last.combined) + '.';
  if (withOutage && !withIdleness && model.stalledAt !== null) {
    text += ' Пока партиция 2 молчала, watermark стоял на ' + seconds(Math.max(0, model.stalledAt))
      + ', и ни одно окно правее этой отметки не закрылось бы.';
  }
  if (withOutage && withIdleness) {
    const returned = late.filter(e => e.partition === SILENT && e.arrival >= OUTAGE_TO).length;
    text += ' После возврата партиции 2 поздними стали ' + returned
      + ' её событий. Watermark успел уйти вперёд и назад не возвращается.';
  }
  return text;
}

function settings() {
  return [Number(bound.value), Number(delay.value), outage.checked, idleness.checked];
}

function showFinal() {
  cancelAnimationFrame(frame);
  button.disabled = false;
  const [b, d, o, i] = settings();
  const model = simulate(b, d, o, i);
  drawFrame(model, model.snapshots[model.snapshots.length - 1]);
  result.textContent = summary(model, o, i);
}

function run() {
  cancelAnimationFrame(frame);
  const [b, d, o, i] = settings();
  const model = simulate(b, d, o, i);
  const startedAt = performance.now();
  button.disabled = true;
  result.textContent = 'Идёт модельное время. Затенённая зона слева от watermark считается закрытой.';

  function step(now) {
    const t = (now - startedAt) / 1000 * SPEEDUP;
    const index = Math.min(model.snapshots.length - 1, Math.floor(t / TICK));
    drawFrame(model, model.snapshots[index]);
    if (index < model.snapshots.length - 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    button.disabled = false;
    result.textContent = summary(model, o, i);
  }
  frame = requestAnimationFrame(step);
}

bound.addEventListener('input', () => { boundValue.textContent = bound.value + ' с'; showFinal(); });
delay.addEventListener('input', () => { delayValue.textContent = delay.value + ' с'; showFinal(); });
outage.addEventListener('change', showFinal);
idleness.addEventListener('change', showFinal);
button.addEventListener('click', run);
scene = buildScene();
showFinal();
diagram.legend(svg, [['var(--color-text-muted)', 'событие вовремя'], ['var(--color-actor-4)', 'позднее событие'],
  ['var(--color-actor-1)', 'watermark партиции'], ['var(--color-text)', 'общий watermark источника']]);
