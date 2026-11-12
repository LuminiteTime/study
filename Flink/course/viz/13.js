/* Урок 13: как группы ключей переходят между подзадачами при восстановлении с другим параллелизмом.
   Диапазоны считаются как в KeyGroupRangeAssignment.computeKeyGroupRangeForOperatorIndex,
   выбор старых файлов повторяет StateAssignmentOperation.reAssignSubKeyedStates. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l13-svg');
const maxSelect = document.getElementById('viz-l13-max');
const oldInput = document.getElementById('viz-l13-old');
const newInput = document.getElementById('viz-l13-new');
const oldValue = document.getElementById('viz-l13-old-value');
const newValue = document.getElementById('viz-l13-new-value');
const runButton = document.getElementById('viz-l13-run');
const resetButton = document.getElementById('viz-l13-reset');
const note = document.getElementById('viz-l13-result');

const WIDTH = 720, STRIP_H = 30, TOP_Y = 28, BOTTOM_Y = 176, HEIGHT = 250;
let scene = null;

function rangeOf(maxParallelism, parallelism, index) {
  const start = Math.floor((index * maxParallelism + parallelism - 1) / parallelism);
  const end = Math.floor(((index + 1) * maxParallelism - 1) / parallelism);
  return { start, end };
}

function ownerOf(maxParallelism, parallelism, keyGroup) {
  return Math.floor(keyGroup * parallelism / maxParallelism);
}

function settings() {
  return { max: Number(maxSelect.value), oldP: Number(oldInput.value), newP: Number(newInput.value) };
}

/** Цвет подзадачи: четыре тона шкалы данных, после четвёртой те же тона светлее. */
function tone(subtask) {
  return 'tone-' + (subtask % 4 + 1) + (subtask >= 4 ? ' is-pale' : '');
}

function drawStrip(cv, s, { y, parallelism, label }) {
  const x = d3.scaleBand().domain(d3.range(s.max)).range([0, WIDTH]).paddingInner(s.max > 16 ? 0 : 0.06);
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', y - 8).text(label);
  const cells = cv.nodes.append('g').selectAll('rect').data(d3.range(s.max)).join('rect')
    .attr('class', k => 'dg-bar dg-strip ' + tone(ownerOf(s.max, parallelism, k)))
    .attr('x', k => x(k)).attr('y', y).attr('width', x.bandwidth()).attr('height', STRIP_H);
  if (x.bandwidth() >= 24) {
    cv.nodes.append('g').selectAll('text').data(d3.range(s.max)).join('text').attr('class', 'dg-cell-label')
      .attr('x', k => x(k) + x.bandwidth() / 2).attr('y', y + STRIP_H / 2 + 4).attr('text-anchor', 'middle').text(k => k);
  }
  drawRanges(cv, s, { x, y: y + STRIP_H, parallelism });
  return { x, cells };
}

/** Скобки под полосой: какой диапазон групп достался каждой подзадаче. */
function drawRanges(cv, s, { x, y, parallelism }) {
  d3.range(parallelism).forEach(i => {
    const r = rangeOf(s.max, parallelism, i);
    const left = x(r.start), right = x(r.end) + x.bandwidth();
    cv.groups.append('path').attr('class', 'dg-bracket').attr('d', `M${left + 1},${y + 4}v5H${right - 1}v-5`);
    if (right - left > 70) {
      cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', (left + right) / 2).attr('y', y + 22)
        .attr('text-anchor', 'middle').text('#' + i + ' · ' + r.start + '–' + r.end);
    }
  });
}

/** Средняя полоса: отмечены группы, у которых сменилась подзадача-владелец. */
function drawMoved(cv, s, top) {
  const y = (TOP_Y + STRIP_H + BOTTOM_Y) / 2;
  const changed = d3.range(s.max).filter(k => ownerOf(s.max, s.oldP, k) !== ownerOf(s.max, s.newP, k));
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', y - 10).text('сменили владельца · ' + changed.length);
  cv.groups.append('rect').attr('class', 'dg-track').attr('x', 0).attr('y', y).attr('width', WIDTH).attr('height', 8).attr('rx', 2);
  return cv.edges.selectAll('rect').data(changed).join('rect').attr('class', 'dg-moved')
    .attr('x', k => top.x(k)).attr('y', y).attr('width', top.x.bandwidth()).attr('height', 8);
}

function render(showNew) {
  const s = settings();
  oldValue.textContent = String(s.oldP);
  newValue.textContent = String(s.newP);
  const cv = diagram.canvas(svg, WIDTH, HEIGHT);
  const top = drawStrip(cv, s, { y: TOP_Y, parallelism: s.oldP, label: 'до остановки, параллелизм ' + s.oldP });
  scene = { s, cv, top };
  if (!showNew) return scene;
  scene.moved = drawMoved(cv, s, top);
  scene.bottom = drawStrip(cv, s, { y: BOTTOM_Y, parallelism: s.newP, label: 'после восстановления, параллелизм ' + s.newP });
  return scene;
}

function sourcesFor(s, index) {
  if (s.oldP === s.newP) return [index];
  const target = rangeOf(s.max, s.newP, index);
  return d3.range(s.oldP).filter(j => {
    const r = rangeOf(s.max, s.oldP, j);
    return r.start <= target.end && target.start <= r.end;
  });
}

function summary(s, moved) {
  if (s.oldP === s.newP) {
    return 'Параллелизм не изменился. Каждая подзадача получает файлы своей прежней подзадачи целиком, пересчёта диапазонов нет.';
  }
  const reads = d3.range(s.newP).map(i => 'подзадача ' + i + ' читает куски от старых ' + sourcesFor(s, i).join(' и ')).join('; ');
  return 'Сменили владельца ' + moved + ' групп из ' + s.max + '. Номер группы у каждого ключа остался прежним, ' +
    'поэтому состояние переносится целыми группами без перехеширования. П' + reads.slice(1) + '.';
}

function run() {
  const s = settings();
  if (s.newP > s.max) {
    render(false);
    note.textContent = 'Восстановление упадёт. StateAssignmentOperation бросит IllegalStateException с текстом ' +
      '«The maximum parallelism (' + s.max + ') of the restored state is lower than the configured parallelism (' + s.newP + ')». ' +
      'Подзадачам сверх числа групп нечего было бы хранить.';
    return;
  }
  const { moved: marks, bottom } = render(true);
  const moved = d3.range(s.max).filter(k => ownerOf(s.max, s.oldP, k) !== ownerOf(s.max, s.newP, k)).length;
  gsap.set(bottom.cells.nodes(), { opacity: 0 });
  gsap.set(marks.nodes(), { opacity: 0 });
  diagram.tween(marks.nodes(), { opacity: 1, duration: 0.2, delay: 0.6, stagger: 1.2 / s.max });
  diagram.tween(bottom.cells.nodes(), { opacity: 1, duration: 0.3, stagger: 1.2 / s.max });
  note.textContent = summary(s, moved);
}

function clampOldParallelism() {
  const limit = Math.min(8, Number(maxSelect.value));
  oldInput.max = String(limit);
  if (Number(oldInput.value) > limit) oldInput.value = String(limit);
}

function reset() {
  clampOldParallelism();
  render(false);
  note.textContent = 'Цвет группы показывает её владельца до остановки. Выбери новый параллелизм и нажми «Восстановить».';
}

[maxSelect, oldInput, newInput].forEach(control => control.addEventListener('input', reset));
runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
reset();
