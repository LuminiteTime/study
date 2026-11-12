/* Урок 11: барьер чекпоинта на операторе с двумя входами. Логика повторяет SingleCheckpointBarrierHandler
   (канал блокируется после барьера) и CheckpointBarrierTracker (каналы не блокируются). */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l11-svg');
const nextButton = document.getElementById('viz-l11-next');
const resetButton = document.getElementById('viz-l11-reset');
const modeSelect = document.getElementById('viz-l11-mode');
const result = document.getElementById('viz-l11-result');

const CHECKPOINT_ID = 7;
const LANE_Y = [112, 196];
const LANE_RIGHT = 452, SLOT = 46, OPERATOR_X = 500;
const SOURCE_NAMES = ['Источник 1', 'Источник 2'];
let sim, frame;


function record(id) { return { kind: 'record', id }; }
function barrier() { return { kind: 'barrier' }; }

function aligned() { return modeSelect.value === 'aligned'; }

function reset() {
  sim = {
    phase: 'idle',
    channels: [[record('a1')], [record('b1'), record('b2'), record('b3')]],
    blocked: [false, false],
    barrierSeen: [false, false],
    afterBarrier: new Set(),
    processed: [],
    snapshot: null,
    acked: false,
    downstream: [],
    turn: 0
  };
  render('Оператор с двумя входами читает оба канала по очереди. Нажми «Шаг», и координатор начнёт чекпоинт ' + CHECKPOINT_ID + '.');
}

function trigger() {
  sim.channels[0].push(barrier(), record('a2'), record('a3'));
  sim.channels[1].push(barrier(), record('b4'));
  sim.phase = 'running';
  return 'Координатор отправил команду только источникам. Каждый источник вставил барьер ' + CHECKPOINT_ID +
    ' в свой выход и продолжил отдавать записи. Источник 1 почти пуст, поэтому его барьер оказался ближе к оператору.';
}

function pickChannel() {
  for (let i = 0; i < 2; i++) {
    const channel = (sim.turn + i) % 2;
    if (!sim.blocked[channel] && sim.channels[channel].length > 0) {
      sim.turn = (channel + 1) % 2;
      return channel;
    }
  }
  return -1;
}

function takeSnapshot() {
  sim.snapshot = sim.processed.slice();
  sim.downstream.push('барьер ' + CHECKPOINT_ID);
  sim.blocked = [false, false];
  sim.phase = 'snapshot';
  const late = sim.snapshot.filter(id => sim.afterBarrier.has(id));
  let text = 'Барьеры пришли по обоим каналам. Оператор отдал барьер дальше и снял снимок состояния ' +
    sim.snapshot.join(', ') + '.';
  if (late.length > 0) {
    text += ' В снимок попали ' + late.join(', ') + ', хотя они шли за барьером. Источник 1 запомнил смещение до них, ' +
      'и после восстановления он отдаст их ещё раз. Состояние посчитает их дважды.';
  } else if (aligned()) {
    text += ' В снимке ровно то, что было до барьеров, и каналы снова открыты.';
  }
  return text;
}

function processOne() {
  const channel = pickChannel();
  if (channel < 0) {
    sim.phase = 'done';
    return 'Все записи обработаны. Нажми «Сначала» или смени режим.';
  }
  const item = sim.channels[channel].shift();
  const name = SOURCE_NAMES[channel].toLowerCase();
  if (item.kind === 'record') {
    if (sim.barrierSeen[channel] && !sim.snapshot) sim.afterBarrier.add(item.id);
    sim.processed.push(item.id);
    let text = 'Оператор обработал ' + item.id + ' из канала «' + name + '» и обновил состояние.';
    if (sim.afterBarrier.has(item.id)) {
      text += ' Эта запись идёт за барьером, а снимок ещё не снят. Без блокировки она попадёт в чекпоинт ' + CHECKPOINT_ID + '.';
    }
    return text;
  }
  sim.barrierSeen[channel] = true;
  if (sim.barrierSeen[0] && sim.barrierSeen[1]) return takeSnapshot();
  if (aligned()) {
    sim.blocked[channel] = true;
    return 'Барьер пришёл по каналу «' + name + '». Канал заблокирован, записи за барьером ждут в буфере. ' +
      'Второй канал читается дальше, пока по нему не придёт свой барьер.';
  }
  return 'Барьер пришёл по каналу «' + name + '». Режим at-least-once канал не блокирует, оператор читает его дальше.';
}

function step() {
  let text;
  if (sim.phase === 'idle') text = trigger();
  else if (sim.phase === 'snapshot') {
    sim.phase = 'running';
    sim.acked = true;
    text = 'Асинхронная часть выгрузила снимок в хранилище, и подзадача отправила подтверждение координатору. ' +
      'Когда подтвердят все подзадачи, чекпоинт ' + CHECKPOINT_ID + ' станет завершённым.';
  } else if (sim.phase === 'done') text = 'Все записи обработаны. Нажми «Сначала» или смени режим.';
  else text = processOne();
  render(text);
}

function drawFrame() {
  const cv = diagram.canvas(svg, 720, 262);
  const coordinator = diagram.node(cv, { x: 0, y: 0, w: 720, h: 48, title: '' });
  const sources = SOURCE_NAMES.map((name, i) => diagram.node(cv, { x: 0, y: LANE_Y[i] - 22, w: 104, h: 44, title: name }));
  LANE_Y.forEach(y => cv.groups.append('line').attr('class', 'dg-lane').attr('x1', 104).attr('x2', OPERATOR_X).attr('y1', y).attr('y2', y));
  diagram.group(cv, { x: OPERATOR_X, y: 72, w: 220, h: 166, label: 'Оператор с состоянием' });
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', OPERATOR_X + 12).attr('y', 116).text('обработано');
  const snapshot = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', OPERATOR_X + 12).attr('y', 224);
  const blocked = LANE_Y.map(y => cv.packets.append('text').attr('class', 'dg-blocked').attr('x', LANE_RIGHT + 16).attr('y', y - 26).attr('text-anchor', 'end'));
  const downstream = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', 258);
  return { cv, coordinator, sources, snapshot, blocked, downstream, items: cv.nodes.append('g'), done: cv.nodes.append('g') };
}

/** Записи и барьеры каналов: ключ по id, поэтому при каждом шаге они плавно сдвигаются к оператору. */
function channelItems() {
  return sim.channels.flatMap((items, channel) => {
    let waiting = sim.blocked[channel] && sim.barrierSeen[channel];
    return items.map((item, index) => {
      if (item.kind === 'barrier') waiting = sim.blocked[channel];
      const key = item.kind === 'barrier' ? 'barrier-' + channel : item.id;
      return { key, item, x: LANE_RIGHT - index * SLOT, y: LANE_Y[channel], waiting: waiting && item.kind === 'record' };
    });
  });
}

function drawItems() {
  frame.items.selectAll('g.dg-chip').data(channelItems(), d => d.key)
    .join(
      enter => enter.append('g').attr('transform', d => `translate(${d.x - SLOT},${d.y})`).attr('opacity', 0).call(enterChip),
      update => update,
      exit => exit.each(leave),
    )
    .attr('class', d => 'dg-chip' + (d.item.kind === 'barrier' ? ' is-barrier' : '') + (d.waiting ? ' is-waiting' : ''))
    .each(function (d) { diagram.tween(this, { x: d.x, y: d.y, opacity: 1, duration: 0.45 }); });
}

/** Запись уходит в оператор: доезжает до него и гаснет. */
function leave() {
  diagram.tween(this, { opacity: 0, x: OPERATOR_X - 20, duration: 0.4, onComplete: () => this.remove() });
}

function enterChip(g) {
  g.filter(d => d.item.kind === 'record').call(chip => {
    chip.append('rect').attr('x', -17).attr('y', -12).attr('width', 34).attr('height', 24).attr('rx', 12);
    chip.append('text').attr('text-anchor', 'middle').attr('y', 4).text(d => d.item.id);
  });
  g.filter(d => d.item.kind === 'barrier').call(bar => {
    bar.append('rect').attr('x', -3).attr('y', -22).attr('width', 6).attr('height', 44).attr('rx', 3);
    bar.append('text').attr('text-anchor', 'middle').attr('y', -28).text('B' + CHECKPOINT_ID);
  });
}

function drawProcessed() {
  frame.done.selectAll('g.dg-chip').data(sim.processed, id => id)
    .join(enter => {
      const g = enter.append('g').attr('class', id => 'dg-chip' + (sim.afterBarrier.has(id) ? ' is-late' : '')).attr('opacity', 0);
      g.attr('transform', (_, i) => `translate(${OPERATOR_X + 30 + (i % 5) * 40},${136 + Math.floor(i / 5) * 32})`);
      g.append('rect').attr('x', -17).attr('y', -12).attr('width', 34).attr('height', 24).attr('rx', 12);
      g.append('text').attr('text-anchor', 'middle').attr('y', 4).text(id => id);
      g.each(function () { diagram.tween(this, { opacity: 1, duration: 0.3, delay: 0.25 }); });
      return g;
    });
}

function coordinatorStatus() {
  if (sim.acked) return 'Других подзадач в модели нет, подтверждение получено, чекпоинт ' + CHECKPOINT_ID + ' завершён';
  if (sim.phase !== 'idle') return 'Чекпоинт ' + CHECKPOINT_ID + ' запущен, ждём подтверждений';
  return 'Координатор чекпоинтов в JobManager ждёт интервала';
}

function render(message) {
  if (!frame || sim.phase === 'idle') frame = drawFrame();
  const mode = aligned() ? 'exactly-once: канал блокируется после барьера' : 'at-least-once: каналы не блокируются';
  frame.coordinator.setText(coordinatorStatus(), mode).setState(sim.acked ? 'ok' : sim.phase === 'idle' ? '' : 'active');
  drawItems();
  drawProcessed();
  frame.blocked.forEach((label, channel) => label.text(sim.blocked[channel] ? 'канал заблокирован' : ''));
  frame.snapshot.text(sim.snapshot ? 'снимок ' + CHECKPOINT_ID + ': ' + sim.snapshot.join(' ') : 'снимка пока нет');
  const gone = sim.downstream.join(', ');
  frame.downstream.text(gone ? 'дальше по графу ушёл ' + gone : 'дальше по графу барьер ещё не ушёл');
  result.textContent = message;
}

nextButton.addEventListener('click', step);
resetButton.addEventListener('click', reset);
modeSelect.addEventListener('change', reset);
reset();
