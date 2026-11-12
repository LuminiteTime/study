/* Урок 3: одна битая запись в потоке при трёх вариантах обработки ошибки. Модель, без настоящих замеров. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l03-svg');
const modeSelect = document.getElementById('viz-l03-mode');
const button = document.getElementById('viz-l03-run');
const result = document.getElementById('viz-l03-result');
const TOTAL = 16, CHECKPOINT_EVERY = 4, MAX_SHOWN_RESTARTS = 3;
const POISON = new Set([5, 11]);
const HOP = 0.32;
let scene;

function draw() {
  const cv = diagram.canvas(svg, 720, 210);
  const source = diagram.node(cv, { x: 0, y: 92, w: 150, h: 52, title: 'Kafka', sub: 'payments.raw' });
  const parser = diagram.node(cv, { x: 280, y: 92, w: 150, h: 52, title: 'Парсер', sub: 'process' });
  const main = diagram.node(cv, { x: 560, y: 24, w: 160, h: 52, title: 'Выход', sub: 'основной поток · 0' });
  const dlq = diagram.node(cv, { x: 560, y: 158, w: 160, h: 52, title: 'Kafka', sub: 'payments.dlq · 0' });
  const status = cv.packets.append('g').attr('class', 'dg-status').attr('transform', 'translate(355,62)');
  status.append('rect').attr('y', -14).attr('height', 22).attr('rx', 11);
  status.append('text').attr('text-anchor', 'middle').attr('y', 1);
  scene = {
    cv, parser, main, dlq, status,
    toParser: diagram.edge(cv, source, parser),
    toMain: diagram.edge(cv, parser, main),
    toDlq: diagram.edge(cv, parser, dlq, { tone: '4', dashed: true, label: 'REJECTED' }),
  };
  setStatus('RUNNING', '');
}

function setStatus(text, state) {
  const width = text.length * 7 + 24;
  scene.status.attr('class', 'dg-status' + (state ? ' is-' + state : ''));
  scene.status.select('rect').attr('x', -width / 2).attr('width', width);
  scene.status.select('text').text(text);
  scene.parser.setState(state);
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, diagram.REDUCED_MOTION ? 1 : ms));
}

function toneOf(index) {
  return POISON.has(index) ? '4' : '2';
}

function hop(route, index) {
  return diagram.sendPacket(scene.cv, route, { tone: toneOf(index), duration: HOP, radius: 6 });
}

async function runWithSideOutput() {
  let accepted = 0, rejected = 0;
  for (let index = 0; index < TOTAL; index++) {
    await hop(scene.toParser, index);
    const poison = POISON.has(index);
    await hop(poison ? scene.toDlq : scene.toMain, index);
    if (poison) scene.dlq.setText('Kafka', 'payments.dlq · ' + (++rejected));
    else scene.main.setText('Выход', 'основной поток · ' + (++accepted));
  }
  return 'Прочитаны все ' + TOTAL + ' записей. В основной поток ушло ' + accepted + ', в DLQ ' + rejected
    + ', перезапусков 0. Причина отказа лежит рядом с исходным текстом записи, разобрать её можно в любое время.';
}

async function runWithoutCheckpoints() {
  let accepted = 0;
  for (let index = 0; index < TOTAL; index++) {
    await hop(scene.toParser, index);
    if (POISON.has(index)) {
      setStatus('FAILED', 'error');
      return 'Задание остановилось на первой битой записи. На выход успело ' + accepted + ' из ' + TOTAL
        + ', остальные ждут в топике, пока кто-то не запустит задание руками. Без чекпоинтов перезапуска по умолчанию нет.';
    }
    await hop(scene.toMain, index);
    scene.main.setText('Выход', 'основной поток · ' + (++accepted));
  }
  return '';
}

async function runWithCheckpoints() {
  let emitted = 0, restarts = 0, offset = 0, checkpointOffset = 0;
  while (restarts <= MAX_SHOWN_RESTARTS) {
    await hop(scene.toParser, offset);
    if (POISON.has(offset)) {
      restarts++;
      setStatus('RESTARTING · попытка ' + restarts, 'error');
      await pause(900);
      setStatus('RUNNING', '');
      offset = checkpointOffset;
      continue;
    }
    await hop(scene.toMain, offset);
    scene.main.setText('Выход', 'основной поток · ' + (++emitted));
    offset++;
    if (offset % CHECKPOINT_EVERY === 0) checkpointOffset = offset;
  }
  setStatus('RESTARTING · и так далее', 'error');
  return 'Показано ' + MAX_SHOWN_RESTARTS + ' перезапуска, дальше то же самое. Чекпоинт хранит смещение ' + checkpointOffset
    + ', поэтому задание каждый раз доходит до той же записи и падает. На выход ушло ' + emitted
    + ' записей, часть из них повторно, а записи за битой не прочитаны ни разу.';
}

const RUNNERS = { dlq: runWithSideOutput, none: runWithoutCheckpoints, restart: runWithCheckpoints };

async function run() {
  button.disabled = true;
  draw();
  result.textContent = 'Поток идёт. Зелёные точки это нормальные платежи, красные битые.';
  result.textContent = await RUNNERS[modeSelect.value]();
  button.disabled = false;
}

button.addEventListener('click', run);
draw();
