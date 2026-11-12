/* Урок 8: оператор с двумя входами берёт минимум watermark, и вход правил решает, двигается ли время. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l08-svg');
const button = document.getElementById('viz-l08-run');
const note = document.getElementById('viz-l08-note');
const modeInputs = Array.from(document.querySelectorAll('input[name="viz-l08-mode"]'));

const TICKS = 30, TICK_MS = 220;
const STEP_S = 10, BOUND_S = 10, BUCKET_S = 10, WINDOW_S = 60;
const CHART_X0 = 480, CHART_X1 = 720, CHART_TOP = 36, CHART_BOTTOM = 196, MAX_BUCKETS = 32;
let timer = null, scene = null;


function clock(seconds) {
  const total = 12 * 3600 + seconds;
  const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function mode() {
  const checked = modeInputs.find(input => input.checked);
  return checked ? checked.value : 'none';
}

/**
 * Модель одной карты в DynamicRules. Каждые 10 с приходит платёж и открывает корзину,
 * таймер на конец корзины плюс минута удаляет старые корзины, когда watermark оператора до него дошёл.
 */
function simulate(rulesMode) {
  const states = [];
  let buckets = [], timers = [], fired = 0, operatorWm = -Infinity;
  for (let k = 1; k <= TICKS; k++) {
    const eventTime = k * STEP_S;
    if (!buckets.includes(eventTime)) buckets.push(eventTime);
    timers.push(eventTime + BUCKET_S + WINDOW_S);
    const paymentsWm = eventTime - BOUND_S;
    const rulesWm = rulesMode === 'max' ? Infinity : -Infinity;
    operatorWm = Math.max(operatorWm, Math.min(paymentsWm, rulesWm));
    const due = timers.filter(t => t <= operatorWm);
    timers = timers.filter(t => t > operatorWm);
    due.forEach(t => { buckets = buckets.filter(b => b + BUCKET_S > t - WINDOW_S); });
    fired += due.length;
    states.push({ k, paymentsWm, rulesWm, operatorWm, buckets: buckets.length, fired });
  }
  return states;
}

function wmText(value) {
  if (value === Infinity) return 'Long.MAX_VALUE';
  if (value === -Infinity) return 'Long.MIN_VALUE';
  return clock(value);
}

const bucketY = d3.scaleLinear().domain([0, MAX_BUCKETS]).range([CHART_BOTTOM, CHART_TOP]);
const tickX = d3.scaleBand().domain(d3.range(1, TICKS + 1)).range([CHART_X0 + 24, CHART_X1]).paddingInner(0.2);

/** Два входа сходятся в оператор, справа столбцы: сколько корзин карты лежит в состоянии на каждом шаге. */
function drawFrame() {
  const cv = diagram.canvas(svg, 720, 222);
  const payments = diagram.node(cv, { x: 0, y: 24, w: 190, h: 56, title: 'Вход 1, платежи', sub: 'ещё нет' });
  const rules = diagram.node(cv, { x: 0, y: 140, w: 190, h: 56, title: 'Вход 2, правила', sub: 'ещё нет' });
  const operator = diagram.node(cv, { x: 240, y: 82, w: 190, h: 56, title: 'rules-dynamic', sub: 'min(вход 1, вход 2)' });
  const edges = [diagram.edge(cv, payments, operator, { tone: '1' }), diagram.edge(cv, rules, operator, { tone: '3' })];
  const fired = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 335).attr('y', 160).attr('text-anchor', 'middle');
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', CHART_X0).attr('y', 12).text('корзин карты в состоянии');
  cv.groups.append('g').attr('class', 'dg-axis').attr('transform', `translate(${CHART_X0 + 24},0)`)
    .call(d3.axisLeft(bucketY).ticks(4).tickSize(4));
  cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', CHART_X1).attr('y', CHART_BOTTOM + 20).attr('text-anchor', 'end')
    .text('время события, 5 минут');
  return { cv, payments, rules, operator, edges, fired, bars: cv.nodes.append('g') };
}

function draw(history) {
  if (!scene || history.length === 0) scene = drawFrame();
  const last = history[history.length - 1];
  if (!last) return;
  const stuck = last.operatorWm === -Infinity;
  scene.payments.setText('Вход 1, платежи', wmText(last.paymentsWm));
  scene.rules.setText('Вход 2, правила', wmText(last.rulesWm));
  scene.operator.setText('rules-dynamic', 'min = ' + wmText(last.operatorWm)).setState(stuck ? 'error' : 'active');
  scene.fired.text('таймеров сработало ' + last.fired);
  scene.edges.forEach((edge, i) => diagram.sendPacket(scene.cv, edge, { tone: i ? '3' : '1', duration: 0.2, radius: 4 }));
  drawBars(history, stuck);
}

function drawBars(history, stuck) {
  scene.bars.selectAll('rect').data(history, d => d.k).join(enter => enter.append('rect')
    .attr('x', d => tickX(d.k)).attr('width', tickX.bandwidth()).attr('y', CHART_BOTTOM).attr('height', 0)
    .each(function (d) {
      const top = bucketY(d.buckets);
      diagram.tween(this, { attr: { y: top, height: CHART_BOTTOM - top }, duration: 0.2 });
    }))
    .attr('class', 'dg-bar ' + (stuck ? 'tone-4' : 'tone-2'));
}

function finish(history) {
  const last = history[history.length - 1];
  note.textContent = last.operatorWm === -Infinity
    ? 'Платежи пять минут двигали своё время, а оператор так и стоит на Long.MIN_VALUE. Ни один таймер очистки не сработал, корзин уже ' + last.buckets + ', и с каждой минутой их больше. В логе при этом ни одной ошибки.'
    : 'Вход правил обещает Long.MAX_VALUE, поэтому минимум равен watermark платежей. Сработало таймеров ' + last.fired + ', в состоянии держится ' + last.buckets + ' корзин, то есть минута плюс корзины, которые ждут своего таймера.';
}

function run() {
  if (timer) clearInterval(timer);
  const states = simulate(mode());
  let shown = 0;
  button.disabled = true;
  note.textContent = 'Время событий идёт, каждый шаг равен 10 секундам.';
  timer = setInterval(() => {
    shown++;
    draw(states.slice(0, shown));
    if (shown >= states.length) {
      clearInterval(timer);
      timer = null;
      button.disabled = false;
      finish(states);
    }
  }, TICK_MS);
}

button.addEventListener('click', run);
modeInputs.forEach(input => input.addEventListener('change', () => {
  if (timer) return;
  draw([]);
  note.textContent = 'Выбери стратегию для входа правил и нажми кнопку.';
}));
draw([]);
