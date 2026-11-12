/* Урок 15: модель удержания WAL логическим слотом. Одна клетка это журнал за один интервал чекпоинта. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l15-svg');
const note = document.getElementById('viz-l15-note');
const jobButton = document.getElementById('viz-l15-job');
const dropButton = document.getElementById('viz-l15-drop');
const limitBox = document.getElementById('viz-l15-limit');
const SEGMENTS = 24, TOP = 46, CELL_H = 30, COMMIT_DELAY = 3, WAL_LIMIT = 8;
const x = d3.scaleBand().domain(d3.range(SEGMENTS)).range([0, 720]).paddingInner(0.12);
let state, scene = null;

function initialState() {
  return { head: 5, slot: 2, jobRunning: true, slotExists: true, slotLost: false };
}


function firstKeptSegment() {
  if (!state.slotExists) return state.head - 1;
  if (state.slotLost) return state.head - WAL_LIMIT;
  return state.slot;
}

function cellClass(index, firstKept) {
  if (index >= state.head) return 'dg-wal';
  if (index < firstKept) return 'dg-wal is-freed';
  return 'dg-wal ' + (state.jobRunning ? 'is-kept' : 'is-stuck');
}

/** Лента сегментов WAL и два флажка: где сервер пишет сейчас и докуда журнал держит слот. */
function buildScene() {
  const cv = diagram.canvas(svg, 720, 130);
  const cells = cv.nodes.selectAll('rect').data(d3.range(SEGMENTS)).join('rect')
    .attr('x', i => x(i)).attr('y', TOP).attr('width', x.bandwidth()).attr('height', CELL_H).attr('rx', 4);
  const flag = (y, cls) => {
    const g = cv.packets.append('g').attr('class', 'dg-marker ' + cls);
    g.append('line').attr('y1', TOP - 4).attr('y2', TOP + CELL_H + 4);
    g.append('text').attr('y', y);
    return g;
  };
  const kept = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 720).attr('y', 124).attr('text-anchor', 'end');
  return { cv, cells, head: flag(TOP - 12, 'is-head'), slot: flag(TOP + CELL_H + 22, 'is-slot'), kept };
}

function moveFlag(flag, index, label) {
  const left = index >= SEGMENTS - 4;
  flag.select('text').attr('text-anchor', left ? 'end' : 'start').attr('x', left ? -6 : 6).text(label);
  diagram.tween(flag.node(), { x: Math.min(index, SEGMENTS) * x.step() - x.step() * 0.06, duration: 0.4 });
}

function draw() {
  if (!scene) scene = buildScene();
  const firstKept = firstKeptSegment();
  scene.cells.attr('class', i => cellClass(i, firstKept));
  moveFlag(scene.head, state.head, 'запись сейчас');
  scene.slot.attr('opacity', state.slotExists ? 1 : 0);
  if (state.slotExists) moveFlag(scene.slot, firstKept, state.slotLost ? 'граница лимита' : 'позиция слота');
  scene.kept.text('удержано сегментов ' + Math.max(0, Math.min(state.head, SEGMENTS) - firstKept) + ' из ' + SEGMENTS);
  note.textContent = describe(state.head - firstKept);
  jobButton.textContent = state.jobRunning ? 'Остановить задание' : 'Запустить задание';
  jobButton.disabled = !state.slotExists || state.slotLost;
  dropButton.disabled = !state.slotExists || state.jobRunning;
}

function describe(keptSegments) {
  if (state.head >= SEGMENTS) return 'Лента закончилась. На настоящем сервере в этот момент заканчивается диск под pg_wal.';
  if (!state.slotExists) return 'Слота нет. Сервер снова может освобождать старый журнал, в модели удержан один сегмент.';
  if (state.slotLost) return 'Слот отстал сильнее лимита и получил wal_status = lost. Диск спасён, задание придётся запускать заново со снимка.';
  if (state.jobRunning) return 'Задание работает. Удержано сегментов ' + keptSegments + ', слот двигается вслед за чекпоинтами.';
  return 'Задание остановлено, слот на месте. Удержано сегментов ' + keptSegments + ', и число растёт с каждым интервалом.';
}

function advanceInterval() {
  if (state.head >= SEGMENTS) return;
  state.head += 1;
  if (state.jobRunning) state.slot = Math.max(state.slot, state.head - COMMIT_DELAY);
  if (limitBox.checked && state.slotExists && state.head - state.slot > WAL_LIMIT) {
    state.slotLost = true;
    state.jobRunning = false;
  }
  draw();
}

function toggleJob() {
  state.jobRunning = !state.jobRunning;
  draw();
}

function dropSlot() {
  state.slotExists = false;
  draw();
}

function reset() {
  state = initialState();
  limitBox.checked = false;
  draw();
}

document.getElementById('viz-l15-tick').addEventListener('click', advanceInterval);
jobButton.addEventListener('click', toggleJob);
dropButton.addEventListener('click', dropSlot);
document.getElementById('viz-l15-reset').addEventListener('click', reset);
reset();
