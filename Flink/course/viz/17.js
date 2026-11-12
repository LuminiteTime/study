/* Урок 17: модель правил alerts.yml. Один шаг равен интервалу опроса и проверки правил Prometheus (10 с). */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l17-svg');
const note = document.getElementById('viz-l17-note');
const tmButton = document.getElementById('viz-l17-tm');
const runButton = document.getElementById('viz-l17-run');

const STEP = 10, WINDOW = 36, LEFT = 190, RIGHT = 716, CHART_TOP = 14, CHART_HEIGHT = 84, ROWS_TOP = 132, ROW = 26;
const INPUT_RATE = 200, CATCH_UP_RATE = 230, RECOVERY = 15, CHECKPOINT_INTERVAL = 15, LAG_THRESHOLD = 5000;
const RULES = [
  { name: 'PayGuardJobRestarted', forSec: 0, cond: h => delta(h, 'restarts', 300) > 0 },
  { name: 'PayGuardCheckpointStale', forSec: 60, cond: h => h.now.t - h.now.lastCompleted > 120 },
  { name: 'PayGuardCheckpointsFailing', forSec: 0, cond: h => delta(h, 'failed', 600) > 2 },
  { name: 'PayGuardSourceSilent', forSec: 60, cond: h => !h.now.present },
  { name: 'PayGuardKafkaLagHigh', forSec: 120, cond: h => h.now.present && h.now.lag > LAG_THRESHOLD }
];
let sim, timer = null, scene = null;


function delta(history, field, seconds) {
  const past = history.samples.find(s => s.t >= history.now.t - seconds) || history.now;
  return history.now[field] - past[field];
}

function initial() {
  return { t: 0, tmUp: true, runningAt: 0, backlog: 0, restarts: 0, failed: 0, lastCompleted: 0,
           samples: [], since: RULES.map(() => null), states: RULES.map(() => []) };
}

function checkpointsIn(from, to) {
  return Math.floor(to / CHECKPOINT_INTERVAL) - Math.floor(from / CHECKPOINT_INTERVAL);
}

function advance() {
  const from = sim.t;
  sim.t += STEP;
  const running = sim.tmUp && sim.t >= sim.runningAt;
  if (running) {
    sim.backlog = Math.max(0, sim.backlog - CATCH_UP_RATE * STEP);
    if (checkpointsIn(from, sim.t) > 0) sim.lastCompleted = sim.t;
  } else {
    sim.backlog += INPUT_RATE * STEP;
    sim.failed += checkpointsIn(from, sim.t);
  }
  const sample = { t: sim.t, present: running, lag: running ? sim.backlog : null,
                   restarts: sim.restarts, failed: sim.failed, lastCompleted: sim.lastCompleted };
  sim.samples.push(sample);
  const history = { samples: sim.samples, now: sample };
  RULES.forEach((rule, i) => {
    if (!rule.cond(history)) {
      sim.since[i] = null;
      sim.states[i].push('inactive');
      return;
    }
    if (sim.since[i] === null) sim.since[i] = sim.t;
    sim.states[i].push(sim.t - sim.since[i] >= rule.forSec ? 'firing' : 'pending');
  });
  draw();
}

function toggleTaskManager() {
  if (sim.tmUp) {
    sim.tmUp = false;
    sim.restarts += 1;
    sim.stoppedAt = sim.t;
  } else {
    sim.tmUp = true;
    sim.runningAt = sim.t + RECOVERY;
  }
  draw();
}

const STATE_LABEL = { inactive: 'молчит', pending: 'pending', firing: 'firing' };

/** Рамка: график лага сверху, под ним по дорожке на каждое правило. */
function buildScene() {
  const cv = diagram.canvas(svg, 720, ROWS_TOP + RULES.length * ROW + 26);
  cv.groups.append('text').attr('class', 'dg-node-title').attr('x', 0).attr('y', CHART_TOP + 14).attr('text-anchor', 'start').text('Лаг в Prometheus');
  cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', CHART_TOP + 32).text('красная зона: ряда нет');
  RULES.forEach((rule, r) => {
    const y = ROWS_TOP + r * ROW;
    cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', y + 14).text(rule.name.replace('PayGuard', ''));
    cv.groups.append('rect').attr('class', 'dg-track').attr('x', LEFT).attr('y', y + 4).attr('width', RIGHT - LEFT).attr('height', ROW - 10).attr('rx', 4);
  });
  return {
    cv,
    gaps: cv.groups.append('g'),
    area: cv.edges.append('path').attr('class', 'dg-area'),
    line: cv.edges.append('path').attr('class', 'dg-series tone-1'),
    threshold: cv.edges.append('g').attr('class', 'dg-threshold'),
    axis: cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${CHART_TOP + CHART_HEIGHT})`),
    runs: cv.nodes.append('g'),
    timeAxis: cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(0,${ROWS_TOP + RULES.length * ROW})`),
  };
}

/** Подряд идущие одинаковые состояния правила сливаются в один отрезок. */
function runsOf(states, samples) {
  const runs = [];
  states.forEach((state, i) => {
    const last = runs[runs.length - 1];
    if (last && last.state === state) last.to = samples[i].t;
    else runs.push({ state, from: samples[i].t, to: samples[i].t });
  });
  return runs.filter(run => run.state !== 'inactive');
}

function drawChart(visible, x) {
  const maxLag = Math.max(LAG_THRESHOLD * 2, d3.max(visible, s => s.lag || 0));
  const y = d3.scaleLinear().domain([0, maxLag]).range([CHART_TOP + CHART_HEIGHT, CHART_TOP]).nice();
  const area = d3.area().defined(s => s.present).x(s => x(s.t)).y0(y(0)).y1(s => y(s.lag)).curve(d3.curveMonotoneX);
  scene.area.attr('d', area(visible));
  scene.line.attr('d', area.lineY1()(visible));
  scene.axis.call(d3.axisLeft(y).ticks(3).tickSize(4).tickFormat(d3.format('~s'))).attr('transform', `translate(${LEFT},0)`);
  scene.threshold.selectAll('*').remove();
  scene.threshold.append('line').attr('x1', LEFT).attr('x2', RIGHT).attr('y1', y(LAG_THRESHOLD)).attr('y2', y(LAG_THRESHOLD));
  scene.threshold.append('text').attr('x', RIGHT - 4).attr('y', y(LAG_THRESHOLD) - 5).attr('text-anchor', 'end').text('порог 5000');
  scene.gaps.selectAll('rect').data(visible.filter(s => !s.present), s => s.t).join('rect').attr('class', 'dg-gap')
    .attr('x', s => x(s.t) - x.step / 2).attr('width', x.step).attr('y', CHART_TOP).attr('height', CHART_HEIGHT);
}

function drawRules(offset, x) {
  const items = RULES.flatMap((rule, r) => runsOf(sim.states[r].slice(offset), sim.samples.slice(offset))
    .map(run => ({ ...run, r, key: r + ':' + run.from })));
  scene.runs.selectAll('rect').data(items, d => d.key).join('rect')
    .attr('class', d => 'dg-run is-' + d.state).attr('rx', 4)
    .attr('x', d => x(d.from) - x.step / 2 + 1).attr('width', d => x(d.to) - x(d.from) + x.step - 2)
    .attr('y', d => ROWS_TOP + d.r * ROW + 4).attr('height', ROW - 10);
}

function draw() {
  if (!scene) scene = buildScene();
  const visible = sim.samples.slice(-WINDOW);
  const offset = sim.samples.length - visible.length;
  const x = d3.scaleLinear().domain([sim.t - (WINDOW - 1) * STEP, sim.t]).range([LEFT + 8, RIGHT - 26]);
  x.step = x(STEP) - x(0);
  drawChart(visible, x);
  drawRules(offset, x);
  scene.timeAxis.call(d3.axisBottom(x).tickValues(d3.range(sim.t, sim.t - WINDOW * STEP, -60)).tickSize(4)
    .tickFormat(t => (t === sim.t ? 'сейчас' : '−' + (sim.t - t) / 60 + ' мин')));
  tmButton.textContent = sim.tmUp ? 'Остановить TaskManager' : 'Вернуть TaskManager';
  note.textContent = describe();
}

function describe() {
  const parts = ['t = ' + sim.t + ' с.'];
  if (!sim.tmUp) parts.push('TaskManager остановлен ' + (sim.t - sim.stoppedAt) + ' с, метрик источника нет.');
  else if (sim.t < sim.runningAt) parts.push('TaskManager вернулся, задание поднимается.');
  else parts.push('Задание работает, лаг ' + sim.backlog + ' записей.');
  const lastStates = RULES.map((rule, i) => sim.states[i].length ? rule.name + ' ' + STATE_LABEL[sim.states[i][sim.states[i].length - 1]] : null)
    .filter(Boolean).filter(s => !s.endsWith('молчит'));
  parts.push(lastStates.length ? 'Сейчас ' + lastStates.join(', ') + '.' : 'Все правила молчат.');
  return parts.join(' ');
}

function toggleRun() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    runButton.textContent = 'Пуск';
    return;
  }
  timer = setInterval(advance, 350);
  runButton.textContent = 'Пауза';
}

function reset() {
  if (timer) toggleRun();
  sim = initial();
  for (let i = 0; i < 6; i++) advance();
}

tmButton.addEventListener('click', toggleTaskManager);
runButton.addEventListener('click', toggleRun);
document.getElementById('viz-l17-step').addEventListener('click', advance);
document.getElementById('viz-l17-reset').addEventListener('click', reset);
reset();
diagram.legend(svg, [['var(--color-actor-1)', 'pending, условие выполнено, ждём for'], ['var(--color-error)', 'firing, алерт ушёл в Alertmanager']]);
