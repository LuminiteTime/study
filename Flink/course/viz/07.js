/* Урок 7: одна подзадача правила частоты. Логика повторяет VelocityRule и BucketedSum, таймеры как в InternalTimerServiceImpl. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l07-svg');
const result = document.getElementById('viz-l07-result');
const WINDOW = 60, BUCKET = 10, MAX_PAYMENTS = 10, WATERMARK_DELAY = 10, BURST = 12;
const CARDS = ['c-1', 'c-2'];
const AXIS = { left: 90, right: 700, before: 90, after: 80 };
const ROW_Y = { 'c-1': 76, 'c-2': 170 };
const TOP = 40, BOTTOM = 252;
let sim, scene = null;


function reset() {
  sim = { t: 5, maxTs: -Infinity, watermark: -Infinity, timers: [], alerts: 0, cards: {} };
  CARDS.forEach(card => { sim.cards[card] = { buckets: new Map(), lastAlert: null }; });
}

function bucketStart(ts) { return ts - ts % BUCKET; }

function sumSince(card, from) {
  let sum = 0;
  sim.cards[card].buckets.forEach((count, start) => { if (start + BUCKET > from) sum += count; });
  return sum;
}

/* Таймер с тем же ключом и временем не дублируется, как в HeapPriorityQueueSet. */
function registerTimer(card, ts) {
  if (sim.timers.some(timer => timer.card === card && timer.ts === ts)) return false;
  sim.timers.push({ card, ts });
  sim.timers.sort((a, b) => a.ts - b.ts);
  return true;
}

function processElement(card, ts, notes) {
  const state = sim.cards[card];
  const start = bucketStart(ts);
  state.buckets.set(start, (state.buckets.get(start) || 0) + 1);
  const timerTs = start + BUCKET + WINDOW;
  if (registerTimer(card, timerTs)) notes.push('Новый таймер ' + card + ' на ' + timerTs + ' с.');
  const recent = sumSince(card, ts - WINDOW);
  const due = state.lastAlert === null || ts - state.lastAlert >= WINDOW;
  if (recent > MAX_PAYMENTS && due) {
    state.lastAlert = ts;
    sim.alerts++;
    notes.push('Алерт по ' + card + ', ' + recent + ' платежей за минуту.');
  }
  sim.maxTs = Math.max(sim.maxTs, ts);
}

/* Срабатывают все таймеры не позже watermark, по порядку времени. */
function advanceWatermark(notes) {
  const next = sim.maxTs - WATERMARK_DELAY;
  if (next <= sim.watermark) return;
  sim.watermark = next;
  while (sim.timers.length > 0 && sim.timers[0].ts <= sim.watermark) {
    const timer = sim.timers.shift();
    const buckets = sim.cards[timer.card].buckets;
    const removed = [];
    buckets.forEach((count, start) => { if (start + BUCKET <= timer.ts - WINDOW) removed.push(start); });
    removed.forEach(start => buckets.delete(start));
    notes.push('Сработал таймер ' + timer.card + ' на ' + timer.ts + ' с, удалено корзин ' + removed.length + '.');
  }
}

function pay(card, count) {
  const notes = [];
  for (let i = 0; i < count; i++) processElement(card, sim.t, notes);
  advanceWatermark(notes);
  const head = count > 1 ? 'Серия из ' + count + ' платежей по ' + card : 'Платёж по ' + card;
  const tail = notes.length > 0 ? notes.join(' ') : 'Таймер на эту корзину уже был, второй не создаётся.';
  render(head + ' во время ' + sim.t + ' с. ' + tail);
}

function scale() {
  return d3.scaleLinear().domain([sim.t - AXIS.before, sim.t + AXIS.after]).range([AXIS.left, AXIS.right]);
}

/** Неподвижная часть: строки карт, полоса последней минуты, линии «сейчас» и watermark, счётчики внизу. */
function buildScene() {
  const cv = diagram.canvas(svg, 720, 326);
  const header = cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', 14);
  const band = cv.groups.append('rect').attr('class', 'dg-past').attr('y', TOP).attr('height', BOTTOM - TOP);
  const bandLabel = cv.groups.append('text').attr('class', 'dg-node-sub').attr('y', TOP + 14).attr('text-anchor', 'middle').text('последняя минута');
  const rows = Object.fromEntries(CARDS.map(card => {
    const y = ROW_Y[card];
    cv.groups.append('text').attr('class', 'dg-node-title').attr('x', 0).attr('y', y + 20).attr('text-anchor', 'start').text(card);
    cv.groups.append('line').attr('class', 'dg-lane').attr('x1', AXIS.left).attr('x2', AXIS.right).attr('y1', y + 46).attr('y2', y + 46);
    return [card, cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', y + 38)];
  }));
  const axis = cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${BOTTOM})`);
  const now = cv.groups.append('line').attr('class', 'dg-now is-strong').attr('y1', TOP).attr('y2', BOTTOM);
  const mark = cv.groups.append('g').attr('class', 'dg-watermark').attr('opacity', 0);
  mark.append('line').attr('y1', TOP).attr('y2', BOTTOM);
  mark.append('rect').attr('class', 'dg-flag').attr('y', BOTTOM + 24).attr('height', 20).attr('rx', 10);
  mark.append('text').attr('y', BOTTOM + 38).attr('text-anchor', 'middle');
  const totals = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', 320);
  return { cv, header, band, bandLabel, rows, axis, now, mark, totals, buckets: cv.nodes.append('g'), timers: cv.edges.append('g') };
}

function bucketItems() {
  return CARDS.flatMap(card => [...sim.cards[card].buckets].map(([start, count]) => ({ key: card + ':' + start, card, start, count })));
}

/** Корзины и таймеры привязаны к своему времени: при сдвиге оси они плавно уезжают влево. */
function drawBuckets(x) {
  scene.buckets.selectAll('g').data(bucketItems(), d => d.key).join(enter => {
    const g = enter.append('g').attr('transform', d => `translate(${x(d.start)},${ROW_Y[d.card] + 8})`).attr('opacity', 0);
    g.append('rect').attr('height', 36).attr('rx', 6);
    g.append('text').attr('y', 23).attr('text-anchor', 'middle');
    return g;
  }).attr('class', d => 'dg-bucket' + (d.start + BUCKET > sim.t - WINDOW ? ' is-in' : ''))
    .each(function (d) {
      const width = x(d.start + BUCKET) - x(d.start) - 2;
      const g = d3.select(this);
      g.select('rect').attr('x', 1).attr('width', width);
      g.select('text').attr('x', width / 2 + 1).text(d.count);
      diagram.tween(this, { x: x(d.start), y: ROW_Y[d.card] + 8, opacity: 1, duration: 0.45 });
    });
}

function drawTimers(x) {
  scene.timers.selectAll('g').data(sim.timers, t => t.card + ':' + t.ts).join(enter => {
    const g = enter.append('g').attr('class', 'dg-timer').attr('transform', t => `translate(${x(t.ts)},${ROW_Y[t.card] + 50})`);
    g.append('path').attr('d', 'M0 0l-6 10h12z');
    g.append('text').attr('y', 22).attr('text-anchor', 'middle').text(t => t.ts);
    return g;
  }, update => update, exit => exit.each(function () { diagram.tween(this, { opacity: 0, onComplete: () => this.remove() }); }))
    .each(function (t) { diagram.tween(this, { x: x(t.ts), y: ROW_Y[t.card] + 50, duration: 0.45 }); });
}

function drawLines(x) {
  const from = Math.max(AXIS.left, x(sim.t - WINDOW));
  scene.band.attr('x', from).attr('width', x(sim.t) - from);
  scene.bandLabel.attr('x', (from + x(sim.t)) / 2);
  scene.now.attr('x1', x(sim.t)).attr('x2', x(sim.t));
  const visible = Number.isFinite(sim.watermark) && x(sim.watermark) >= AXIS.left;
  scene.mark.attr('opacity', visible ? 1 : 0);
  if (!visible) return;
  const label = 'W ' + sim.watermark + ' с', width = label.length * 7 + 18;
  diagram.tween(scene.mark.node(), { x: x(sim.watermark), duration: 0.45 });
  scene.mark.select('rect').attr('x', -width / 2).attr('width', width);
  scene.mark.select('text').text(label);
}

function render(message) {
  if (!scene) scene = buildScene();
  const x = scale();
  scene.header.text('время следующего платежа ' + sim.t + ' с');
  scene.axis.call(d3.axisBottom(x).tickValues(d3.range(Math.max(0, Math.ceil((sim.t - AXIS.before) / 30) * 30), sim.t + AXIS.after + 1, 30))
    .tickSize(4).tickFormat(t => t + ' с'));
  CARDS.forEach(card => {
    const last = sim.cards[card].lastAlert;
    scene.rows[card].text('last-alert-at ' + (last === null ? 'нет' : last + ' с'));
  });
  drawBuckets(x);
  drawTimers(x);
  drawLines(x);
  const buckets = d3.sum(CARDS, card => sim.cards[card].buckets.size);
  scene.totals.text('в состоянии подзадачи корзин ' + buckets + ' · таймеров ' + sim.timers.length + ' · алертов ' + sim.alerts);
  result.textContent = message;
}

document.getElementById('viz-l07-pay1').addEventListener('click', () => pay('c-1', 1));
document.getElementById('viz-l07-pay2').addEventListener('click', () => pay('c-2', 1));
document.getElementById('viz-l07-burst').addEventListener('click', () => pay('c-1', BURST));
document.getElementById('viz-l07-tick').addEventListener('click', () => {
  sim.t += BUCKET;
  render('Прошло 10 с. Watermark стоит на месте, его двигают только новые платежи, поэтому таймеры ждут.');
});
document.getElementById('viz-l07-reset').addEventListener('click', () => {
  reset();
  render('Состояние пустое. Попробуй серию по c-1, потом несколько раз «Прошло 10 с» и платёж по c-2.');
});
reset();
render('Состояние пустое. Попробуй серию по c-1, потом несколько раз «Прошло 10 с» и платёж по c-2.');
