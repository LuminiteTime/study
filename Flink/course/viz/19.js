/* Урок 19: калькулятор памяти TaskManager. Расчёт в viz/19-model.js, здесь ввод, полоса и таблица. */
const { diagram, memory } = window.Course;
const { MIB, DEFAULTS, ConfigError, mib, derive } = memory;
const root = document.getElementById('viz-l19');

const PRESETS = {
  course: { process: '2048', flink: '', taskHeap: '', managed: '', managedFraction: 0.4, networkFraction: 0.1, overheadFraction: 0.1, metaspace: 256, slots: 4 },
  conflict: { process: '1024', flink: '2048', taskHeap: '', managed: '', managedFraction: 0.4, networkFraction: 0.1, overheadFraction: 0.1, metaspace: 256, slots: 4 },
  lesson1: { process: '1728', flink: '1024', taskHeap: '512', managed: '256', managedFraction: 0.4, networkFraction: 0.1, overheadFraction: 0.1, metaspace: 256, slots: 4 }
};

const field = id => document.getElementById('viz-l19-' + id);
const inputs = ['process', 'flink', 'taskHeap', 'managed', 'managedFraction', 'networkFraction', 'overheadFraction', 'metaspace', 'slots'];
const svg = field('svg');
const table = field('table');
const note = field('result');

function optionalMiB(value) {
  const text = String(value).trim();
  return text === '' ? null : Math.round(Number(text) * MIB);
}

function readConfig() {
  return {
    process: optionalMiB(field('process').value),
    flink: optionalMiB(field('flink').value),
    taskHeap: optionalMiB(field('taskHeap').value),
    managed: optionalMiB(field('managed').value),
    managedFraction: Number(field('managedFraction').value),
    networkFraction: Number(field('networkFraction').value),
    overheadFraction: Number(field('overheadFraction').value),
    metaspace: Number(field('metaspace').value) * MIB,
    slots: Math.max(1, Math.round(Number(field('slots').value)))
  };
}


const AREAS = [
  { key: 'frameworkHeap', label: 'Framework Heap', tone: 1, solid: false },
  { key: 'taskHeap', label: 'Task Heap', tone: 1, solid: true },
  { key: 'frameworkOffHeap', label: 'Framework Off-Heap', tone: 3, solid: false },
  { key: 'taskOffHeap', label: 'Task Off-Heap', tone: 3, solid: false },
  { key: 'network', label: 'Network', tone: 3, solid: true },
  { key: 'managed', label: 'Managed', tone: 2, solid: true },
  { key: 'metaspace', label: 'Metaspace', tone: 5, solid: false },
  { key: 'overhead', label: 'JVM Overhead', tone: 5, solid: true }
];
const GROUPS = [
  { from: 0, to: 2, label: 'куча JVM, -Xmx' },
  { from: 2, to: 5, label: 'direct, -XX:MaxDirectMemorySize' },
  { from: 5, to: 6, label: 'managed, native' },
  { from: 6, to: 8, label: 'вне Total Flink' }
];
const BAR_W = 720, BAR_TOP = 34, BAR_H = 56;
let scene = null;

function buildScene() {
  const cv = diagram.canvas(svg, BAR_W, 124);
  const segments = cv.nodes.selectAll('g').data(AREAS, a => a.key).join('g')
    .attr('class', a => 'dg-seg tone-' + a.tone + (a.solid ? ' is-solid' : ''));
  segments.append('rect').attr('y', BAR_TOP).attr('height', BAR_H);
  segments.append('text').attr('class', 'dg-seg-name').attr('y', BAR_TOP + 24).attr('text-anchor', 'middle');
  segments.append('text').attr('class', 'dg-seg-value').attr('y', BAR_TOP + 42).attr('text-anchor', 'middle');
  const brackets = cv.groups.selectAll('g').data(GROUPS).join('g').attr('class', 'dg-range');
  brackets.append('path');
  brackets.append('text').attr('y', 14).attr('text-anchor', 'middle');
  const total = cv.groups.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', 118);
  const error = cv.packets.append('g').attr('class', 'dg-status is-error').attr('opacity', 0);
  error.append('rect').attr('x', BAR_W / 2 - 110).attr('y', BAR_TOP + 16).attr('width', 220).attr('height', 24).attr('rx', 12);
  error.append('text').attr('x', BAR_W / 2).attr('y', BAR_TOP + 32).attr('text-anchor', 'middle').text('TaskManager не стартует');
  return { cv, segments, brackets, total, error };
}

/** Подпись влезает целиком, только числом или никак: решает ширина сегмента. */
function fitLabels(g, area, w, value) {
  const name = area.label.length * 6.6 + 12 < w ? area.label : '';
  const amount = mib(value) + ' МиБ';
  g.select('.dg-seg-name').text(name);
  g.select('.dg-seg-value').text(amount.length * 6.6 + 8 < w ? amount : '').attr('y', BAR_TOP + (name ? 42 : 33));
}

function drawBar(values, total) {
  if (!scene) scene = buildScene();
  scene.error.attr('opacity', 0);
  const x = d3.scaleLinear().domain([0, total || 1]).range([0, BAR_W]);
  const starts = d3.cumsum([0, ...AREAS.map(a => values[a.key])]).map(x);
  scene.segments.each(function (area, i) {
    const w = Math.max(0, starts[i + 1] - starts[i]), g = d3.select(this);
    diagram.tween(g.select('rect').node(), { attr: { x: starts[i], width: w }, duration: 0.45 });
    diagram.tween(g.selectAll('text').nodes(), { attr: { x: starts[i] + w / 2 }, duration: 0.45 });
    fitLabels(g, area, w, values[area.key]);
  });
  scene.brackets.each(function (group) {
    const x1 = starts[group.from], x2 = starts[group.to], g = d3.select(this);
    g.attr('opacity', x2 - x1 < 1 ? 0 : 1);
    g.select('path').attr('d', `M${x1 + 1} 26V20H${x2 - 1}V26`);
    g.select('text').attr('x', (x1 + x2) / 2).text(x2 - x1 > group.label.length * 6.2 ? group.label : '');
  });
  scene.total.text('totalProcessMemory ' + mib(total) + ' МиБ');
}

function drawError() {
  if (!scene) scene = buildScene();
  scene.segments.select('rect').attr('width', 0);
  scene.segments.selectAll('text').text('');
  scene.brackets.attr('opacity', 0);
  scene.total.text('');
  scene.error.attr('opacity', 1);
}

function row(name, value) {
  const tr = document.createElement('tr');
  const th = document.createElement('td');
  th.innerHTML = '<code>' + name + '</code>';
  const td = document.createElement('td');
  td.textContent = value;
  tr.appendChild(th);
  tr.appendChild(td);
  return tr;
}

function render() {
  const c = readConfig();
  ['managedFraction', 'networkFraction', 'overheadFraction'].forEach(key => {
    field(key + '-value').textContent = c[key].toFixed(2);
  });
  table.replaceChildren();
  let result;
  try {
    result = derive(c);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    drawError();
    note.innerHTML = '<strong>IllegalConfigurationException</strong>. TaskManager memory configuration failed: ' + error.message;
    return;
  }
  drawBar({ ...result.flink, ...result.jvm }, result.totalProcess);
  const perSlot = Math.floor(result.flink.managed / c.slots);
  fillTable(result, perSlot);
  note.textContent = memoryNotes(result, perSlot).join(' ');
}

/** Те же поля и то же округление, что выводит scripts/tm-memory.sh, плюс деление managed на слоты. */
function fillTable(result, perSlot) {
  const f = result.flink;
  [['frameworkHeap', f.frameworkHeap], ['taskHeap', f.taskHeap], ['frameworkOffHeap', f.frameworkOffHeap], ['taskOffHeap', f.taskOffHeap],
    ['networkMemory', f.network], ['managedMemory', f.managed], ['jvmMetaspace', result.jvm.metaspace], ['jvmOverhead', result.jvm.overhead],
    ['totalFlinkMemory', f.total], ['totalProcessMemory', result.totalProcess]]
    .forEach(([name, bytes]) => table.appendChild(row(name, mib(bytes) + ' МиБ')));
  // TaskExecutorResourceUtils делит managed на число слотов, RocksDBMemoryControllerUtils делит слот на кэш и буферы записи.
  const cache = Math.floor((3 - DEFAULTS.writeBufferRatio) * perSlot / 3);
  const writeBuffers = Math.floor(2 * perSlot * DEFAULTS.writeBufferRatio / 3);
  table.appendChild(row('managed на слот', mib(perSlot) + ' МиБ'));
  table.appendChild(row('block_cache_capacity', cache + ' байт, ' + mib(cache) + ' МиБ'));
  table.appendChild(row('write buffer manager', mib(writeBuffers) + ' МиБ'));
}

function memoryNotes(result, perSlot) {
  const f = result.flink;
  const messages = result.notes.slice();
  messages.push('Куча JVM (-Xmx) ' + mib(f.frameworkHeap + f.taskHeap) + ' МиБ, предел direct-памяти '
    + mib(f.frameworkOffHeap + f.taskOffHeap + f.network) + ' МиБ.');
  if (f.taskHeap < 128 * MIB) messages.push('Внимание, на кучу задач осталось меньше 128 МиБ. Задание с объектами в куче будет жить на грани OutOfMemoryError.');
  if (f.managed > 0 && perSlot < 64 * MIB) messages.push('Внимание, у RocksDB в каждом слоте меньше 64 МиБ на кэш и memtable.');
  return messages;
}

function applyPreset(name) {
  const p = PRESETS[name];
  inputs.forEach(id => { field(id).value = p[id]; });
  render();
}

inputs.forEach(id => field(id).addEventListener('input', render));
root.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
render();
