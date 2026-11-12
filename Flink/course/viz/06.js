/* Урок 6: лента платежей одного ключа и четыре вида окон. Модель в viz/06-model.js, здесь отрисовка и прогон. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l06-svg');
const typeSelect = document.getElementById('viz-l06-type');
const latenessBox = document.getElementById('viz-l06-lateness');
const runButton = document.getElementById('viz-l06-run');
const result = document.getElementById('viz-l06-result');
const { ON_TIME, LATE_EVENT, LATENESS, WATERMARK_END, WindowSimulation } = window.Course.windowModel;
const WIDTH = 760, LEFT = 24, RIGHT = 736, LANE_Y = 74, AXIS_Y = 96, ROW_TOP = 124, ROW_HEIGHT = 28, ROW_GAP = 8;
const STEP_MS = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 45;
let running = false;

const x = d3.scaleLinear().domain([0, 150]).range([LEFT, RIGHT]).clamp(true);

function staticSimulation() {
  const sim = new WindowSimulation(typeSelect.value, latenessBox.checked ? LATENESS : 0);
  ON_TIME.forEach(ts => sim.addEvent(ts, false));
  return sim;
}

const LEGEND = [['open', 'копит'], ['fired', 'выпустило итог'], ['refired', 'позднее срабатывание'], ['gone', 'удалено из состояния']];

/** Статичная часть: ось, дорожка платежей, подписи. Окна, точки и watermark обновляются в draw. */
function drawFrame() {
  const cv = diagram.canvas(svg, WIDTH, 240);
  const past = cv.groups.append('rect').attr('class', 'dg-past').attr('x', LEFT).attr('y', 26).attr('width', 0);
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', LEFT).attr('y', 44).text('платежи одного ключа по времени события');
  cv.groups.append('line').attr('class', 'dg-lane').attr('x1', LEFT).attr('x2', RIGHT).attr('y1', LANE_Y).attr('y2', LANE_Y);
  cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${AXIS_Y})`)
    .call(d3.axisBottom(x).tickValues(d3.range(0, 151, 10)).tickSize(4).tickFormat(t => (t % 30 ? '' : t + ' с')));
  const mark = cv.packets.append('g').attr('class', 'dg-watermark').attr('opacity', 0);
  mark.append('line').attr('y1', 26);
  mark.append('rect').attr('class', 'dg-flag').attr('y', 6).attr('height', 20).attr('rx', 10);
  mark.append('text').attr('y', 20).attr('text-anchor', 'middle');
  return { cv, past, mark, windows: cv.nodes.append('g'), dots: cv.edges.append('g') };
}

function draw(sim) {
  const rows = { sliding: 3, session: 2 }[sim.type] || 1;
  const height = ROW_TOP + rows * (ROW_HEIGHT + ROW_GAP) + 4;
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
  drawWindows(sim);
  drawArrivals(sim.arrived);
  drawWatermark(sim.watermark, height);
}

function drawWindows(sim) {
  const top = w => ROW_TOP + w.row * (ROW_HEIGHT + ROW_GAP);
  const groups = frame.windows.selectAll('g.dg-window').data(sim.windows, w => w.start + ':' + w.end + ':' + w.row)
    .join(enter => {
      const g = enter.append('g');
      g.append('rect').attr('height', ROW_HEIGHT).attr('rx', 6);
      g.append('text').attr('text-anchor', 'middle').attr('y', ROW_HEIGHT / 2 + 4);
      return g;
    });
  groups.attr('class', w => 'dg-window is-' + w.status).attr('transform', w => `translate(0,${top(w)})`);
  groups.select('rect').attr('x', w => x(w.start) + 1).attr('width', w => Math.max(4, x(w.end) - x(w.start) - 2));
  groups.select('text').attr('x', w => (x(w.start) + x(w.end)) / 2).text(w => windowLabel(w, sim.type));
}

function windowLabel(w, type) {
  if (type === 'global') return 'global, ' + w.count + ' пл., срабатываний нет';
  const labels = { fired: 'итог ', refired: 'перерасчёт ', gone: 'удалено, итог ' };
  return w.status in labels ? labels[w.status] + w.count : w.count + ' пл.';
}

function drawArrivals(arrived) {
  const tone = a => (a.sideOutput ? 'tone-4' : a.late ? 'tone-3' : '');
  frame.dots.selectAll('g.dg-arrival').data(arrived, a => a.ts + ':' + a.late)
    .join(enter => {
      const g = enter.append('g').attr('class', 'dg-arrival');
      g.append('circle').attr('r', 0).attr('cx', a => x(a.ts)).attr('cy', LANE_Y)
        .call(c => diagram.tween(c.nodes(), { attr: { r: 5.5 }, duration: 0.4 }));
      g.filter(a => a.late).append('text').attr('class', 'dg-edge-label').attr('x', a => x(a.ts)).attr('y', LANE_Y - 12).attr('text-anchor', 'middle');
      return g;
    })
    .call(g => g.select('circle').attr('class', a => 'dg-dot ' + tone(a)))
    .call(g => g.select('text').text(a => (a.sideOutput ? 'опоздал, в побочный выход' : 'опоздал, принят')));
}

function drawWatermark(watermark, height) {
  const visible = Number.isFinite(watermark) && watermark >= 0;
  frame.mark.attr('opacity', visible ? 1 : 0);
  frame.past.attr('height', height - 26).attr('width', visible ? x(watermark) - LEFT : 0);
  if (!visible) return;
  const label = 'W ' + watermark + ' с', flagWidth = label.length * 7 + 18;
  frame.mark.attr('transform', `translate(${x(watermark)},0)`);
  frame.mark.select('line').attr('y2', height);
  frame.mark.select('rect').attr('x', -flagWidth / 2).attr('width', flagWidth);
  frame.mark.select('text').text(label);
}

function drawLegend() {
  const list = document.createElement('ul');
  list.className = 'viz-legend';
  LEGEND.forEach(([status, label]) => {
    const item = document.createElement('li');
    item.innerHTML = `<span class="viz-swatch dg-swatch is-${status}"></span>${label}`;
    list.append(item);
  });
  svg.after(list);
}

function stateSummary(sim) {
  const live = sim.active();
  const elements = live.reduce((sum, w) => sum + w.count, 0);
  return 'Живых окон ' + live.length + '. Аккумуляторов в состоянии при AggregateFunction ' + live.length
    + ', копий платежей при одной ProcessWindowFunction ' + elements + '.';
}

function describeStatic() {
  const sim = staticSimulation();
  frame.windows.selectAll('*').remove();
  frame.dots.selectAll('*').remove();
  draw(sim);
  const perEvent = { tumbling: 'одно окно', sliding: 'три окна, потому что размер 30 с делится на шаг 10 с трижды', session: 'одно окно, а пересекающиеся окна сливаются в сессию', global: 'единственное global окно' };
  result.textContent = 'Пришли 12 платежей, watermark ещё не двигался. Каждый платёж попадает в ' + perEvent[sim.type] + '. '
    + stateSummary(sim) + ' Нажми кнопку, чтобы пустить watermark и опоздавший платёж с временем 52 с.';
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  if (running) return;
  running = true;
  runButton.disabled = true;
  const sim = new WindowSimulation(typeSelect.value, latenessBox.checked ? LATENESS : 0);
  frame.windows.selectAll('*').remove();
  frame.dots.selectAll('*').remove();
  let next = 0;
  for (let w = 0; w <= WATERMARK_END; w++) {
    while (next < ON_TIME.length && ON_TIME[next] <= w) sim.addEvent(ON_TIME[next++], false);
    sim.advance(w);
    if (w === LATE_EVENT.arrivesAt) sim.addEvent(LATE_EVENT.ts, true);
    draw(sim);
    result.textContent = 'Watermark ' + w + ' с. Итогов выпущено ' + sim.fired + ', поздних срабатываний ' + sim.lateFirings + '.';
    await pause(w === LATE_EVENT.arrivesAt ? STEP_MS * 30 : STEP_MS);
  }
  result.textContent = 'Watermark дошёл до ' + WATERMARK_END + ' с. Итогов выпущено ' + sim.fired + ', поздних срабатываний '
    + sim.lateFirings + '. ' + sim.lateOutcome + ' ' + stateSummary(sim);
  runButton.disabled = false;
  running = false;
}

typeSelect.addEventListener('change', () => { if (!running) describeStatic(); });
latenessBox.addEventListener('change', () => { if (!running) describeStatic(); });
runButton.addEventListener('click', run);
const frame = drawFrame();
drawLegend();
describeStatic();
