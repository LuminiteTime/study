/* Урок 21: хронология инцидента с InvalidPidMappingException. Шаги и цифры взяты из настоящего прогона урока 20,
   ветка «с томом» опирается на проверку удаления пода Kafka с PVC из того же урока. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l21-svg');
const note = document.getElementById('viz-l21-note');
const modeSelect = document.getElementById('viz-l21-mode');
const backButton = document.getElementById('viz-l21-back');
const nextButton = document.getElementById('viz-l21-next');
const resetButton = document.getElementById('viz-l21-reset');
const counter = document.getElementById('viz-l21-step');

const COMMON = [
  { boxes: { kafka: 'active', committer: 'active' }, txn: 'payguard-alerts-0-11 = pid 31, эпоха 2', snapshot: 'последний чекпоинт',
    arrows: [], restored: 0, failed: 0,
    text: 'Задание работает. Приёмник алертов пишет в транзакцию payguard-alerts-0-11, брокер выдал ей producerId 31 и эпоху 2 и хранит эту связь в журнале __transaction_state.' },
  { boxes: { operator: 'active', snapshot: 'active' }, txn: 'payguard-alerts-0-11 = pid 31, эпоха 2', snapshot: 'savepoint перед апгрейдом',
    arrows: ['operator-snapshot'], restored: 0, failed: 0,
    text: 'Patch parallelism с 2 на 3. Оператор снимает savepoint, и в состояние приёмника попадает подготовленная транзакция KafkaCommittable с producerId 31, эпохой 2 и transactionalId payguard-alerts-0-11.' },
  { boxes: { kafka: 'error' }, txn: 'брокер перезапускается', snapshot: 'savepoint перед апгрейдом',
    arrows: [], restored: 0, failed: 0,
    text: 'Пока поднимаются новые поды, minikube упирается в память, и под Kafka перезапускается.' }
];

const SCENARIOS = {
  novolume: COMMON.concat([
    { boxes: { kafka: 'error', txn: 'error' }, txn: 'журнал создан заново, связи нет', snapshot: 'savepoint перед апгрейдом',
      arrows: [], restored: 0, failed: 0,
      text: 'Тома у пода нет. Новый контейнер стартует с пустым диском, __transaction_state создаётся заново, от топиков остались только автосозданные payments.raw, payments.confirmations и rules.config.' },
    { boxes: { snapshot: 'active', committer: 'active' }, txn: 'журнал создан заново, связи нет', snapshot: 'savepoint перед апгрейдом',
      arrows: ['snapshot-committer', 'committer-kafka'], restored: 1, failed: 0,
      text: 'Задание восстанавливается из savepoint. Committer получает committable с producer=null, вызывает resumeTransaction(31, 2) и отправляет брокеру коммит.' },
    { boxes: { committer: 'error', kafka: 'error', txn: 'error' }, txn: 'журнал создан заново, связи нет', snapshot: 'savepoint перед апгрейдом',
      arrows: ['committer-kafka'], restored: 1, failed: 0,
      text: 'Брокер отвечает InvalidPidMappingException, потому что producerId 31 не связан с этим transactionalId. KafkaCommitter не знает такой ошибки, общий catch вызывает signalFailedWithUnknownReason, и подзадача падает.' },
    { boxes: { jobmanager: 'error', committer: 'error' }, txn: 'журнал создан заново, связи нет', snapshot: 'savepoint перед апгрейдом',
      arrows: ['snapshot-committer', 'committer-kafka'], restored: 17, failed: 11,
      text: 'Стратегия exponential-delay перезапускает задание снова и снова. Каждый раз из состояния приходит тот же committable и та же ошибка. По замерам 17 восстановлений, 11 чекпоинтов FAILED, RESTARTING без конца.' },
    { boxes: { kafka: 'ok', txn: 'ok', jobmanager: 'ok', committer: 'ok', snapshot: 'error' }, txn: 'новый журнал на PVC kafka-data', snapshot: 'состояние выброшено',
      arrows: [], restored: 0, failed: 0,
      text: 'Лечение. Kafka переезжает на PVC kafka-data. FlinkDeployment и ConfigMap с метаданными HA удалены, задание стартует без состояния. Цикл кончился, но вместе с ним пропали профили карт и позиции чтения.' }
  ]),
  volume: COMMON.concat([
    { boxes: { kafka: 'ok', txn: 'ok' }, txn: 'payguard-alerts-0-11 = pid 31, эпоха 2', snapshot: 'savepoint перед апгрейдом',
      arrows: [], restored: 0, failed: 0,
      text: 'У пода есть PVC kafka-data. Новый контейнер монтирует тот же диск, брокер читает журналы, связь transactionalId с producerId 31 на месте.' },
    { boxes: { snapshot: 'active', committer: 'active' }, txn: 'payguard-alerts-0-11 = pid 31, эпоха 2', snapshot: 'savepoint перед апгрейдом',
      arrows: ['snapshot-committer', 'committer-kafka'], restored: 1, failed: 0,
      text: 'Задание восстанавливается из savepoint, Committer возобновляет транзакцию с producerId 31 и эпохой 2 и отправляет коммит.' },
    { boxes: { committer: 'ok', kafka: 'ok', txn: 'ok', jobmanager: 'ok' }, txn: 'транзакция зафиксирована', snapshot: 'новые чекпоинты',
      arrows: ['committer-kafka'], restored: 1, failed: 0,
      text: 'Брокер узнаёт транзакцию и фиксирует её. В уроке 20 под Kafka с томом удаляли под нагрузкой, и через 90 с задание было RUNNING, чекпоинты шли дальше (completed 2488, потом 2494, failed 0), __transaction_state остался на месте.' }
  ])
};

let step = 0;

let scene = null;
let shownArrows = '';

function drawFrame() {
  const cv = diagram.canvas(svg, 720, 250);
  const job = diagram.group(cv, { x: 230, y: 0, w: 220, h: 200, label: 'задание Flink' });
  const kafka = diagram.group(cv, { x: 490, y: 0, w: 230, h: 200, label: 'брокер Kafka' });
  const nodes = {
    operator: diagram.node(cv, { x: 0, y: 30, w: 180, h: 52, title: 'Оператор', sub: 'FlinkDeployment' }),
    snapshot: diagram.node(cv, { x: 0, y: 140, w: 180, h: 52, title: 'Том flink-data', sub: '' }),
    committer: diagram.node(cv, { x: 255, y: 110, w: 170, h: 52, title: 'Committer', sub: 'alerts-sink' }),
    txn: diagram.node(cv, { x: 505, y: 60, w: 200, h: 100, title: '__transaction_state', sub: '' }),
  };
  const txnText = cv.nodes.append('text').attr('class', 'dg-node-sub').attr('text-anchor', 'middle');
  const arrows = {
    'operator-snapshot': diagram.edge(cv, nodes.operator, nodes.snapshot),
    'snapshot-committer': diagram.edge(cv, nodes.snapshot, nodes.committer),
    'committer-kafka': diagram.edge(cv, nodes.committer, nodes.txn),
  };
  const counters = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 230).attr('y', 236);
  return { cv, job, kafka, nodes, txnText, arrows, counters };
}

function setGroupState(group, state) {
  group.attr('class', 'dg-group' + (state ? ' is-' + state : ''));
}

function drawTxn(text) {
  scene.txnText.selectAll('tspan').data(wrap(text, 28)).join('tspan')
    .attr('x', 605).attr('y', (_, i) => 124 + i * 14).text(line => line);
}

function drawArrows(s) {
  const key = s.arrows.join(',');
  Object.entries(scene.arrows).forEach(([name, edge]) => edge.setActive(s.arrows.includes(name)));
  if (key !== shownArrows) s.arrows.forEach(name => diagram.sendPacket(scene.cv, scene.arrows[name], { duration: 0.7 }));
  shownArrows = key;
}

function draw() {
  const steps = SCENARIOS[modeSelect.value];
  const s = steps[step];
  if (!scene) scene = drawFrame();
  ['operator', 'snapshot', 'committer', 'txn'].forEach(id => scene.nodes[id].setState(s.boxes[id] || ''));
  scene.nodes.snapshot.setText('Том flink-data', s.snapshot);
  scene.nodes.txn.el.selectAll('.dg-node-title tspan').attr('y', 28);
  setGroupState(scene.job, s.boxes.jobmanager);
  setGroupState(scene.kafka, s.boxes.kafka);
  drawTxn(s.txn);
  drawArrows(s);
  scene.counters.text('восстановлений ' + s.restored + ' · чекпоинтов FAILED ' + s.failed);
  note.textContent = s.text;
  counter.textContent = 'Шаг ' + (step + 1) + ' из ' + steps.length;
  backButton.disabled = step === 0;
  nextButton.disabled = step === steps.length - 1;
}

function wrap(text, width) {
  const lines = [];
  let line = '';
  text.split(' ').forEach(word => {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  });
  if (line.trim()) lines.push(line.trim());
  return lines;
}

nextButton.addEventListener('click', () => { step += 1; draw(); });
backButton.addEventListener('click', () => { step -= 1; draw(); });
resetButton.addEventListener('click', () => { step = 0; draw(); });
modeSelect.addEventListener('change', () => {
  step = Math.min(step, SCENARIOS[modeSelect.value].length - 1);
  draw();
});
draw();
