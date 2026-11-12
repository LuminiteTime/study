/* Урок 1: одни и те же события едут в модели micro-batch и в поштучной модели. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l01-svg');
const slider = document.getElementById('viz-l01-interval');
const value = document.getElementById('viz-l01-value');
const button = document.getElementById('viz-l01-run');
const result = document.getElementById('viz-l01-result');
const EVENTS = 40, DURATION = 10, TRAVEL = 0.6, SPEEDUP = 2;
const LANE_START = 160, LANE_END = 590, TRAIN = 300;
const LANES = { batch: 52, stream: 140 };
let scene = null, timeline = null;

function drawFrame() {
  const cv = diagram.canvas(svg, 720, 192);
  const sinks = {};
  [['batch', 'Micro-batch', 'порция раз в ' + slider.value + ' с'], ['stream', 'Поштучно', 'сразу']].forEach(([key, title, sub]) => {
    diagram.node(cv, { x: 0, y: LANES[key] - 26, w: 140, h: 52, title, sub });
    cv.groups.append('line').attr('class', 'dg-lane').attr('x1', LANE_START).attr('x2', LANE_END + 10)
      .attr('y1', LANES[key]).attr('y2', LANES[key]);
    sinks[key] = diagram.node(cv, { x: 600, y: LANES[key] - 26, w: 120, h: 52, title: 'Приёмник', sub: 'доставлено 0' });
  });
  return { cv, sinks, delivered: { batch: 0, stream: 0 } };
}

/** Момент прибытия: в micro-batch событие ждёт ближайшую границу интервала. */
function arrival(createdAt, interval, batched) {
  const departure = batched ? Math.ceil(createdAt / interval + 1e-9) * interval : createdAt;
  return { departure, arrival: departure + TRAVEL };
}

function average(events, key) {
  return events.reduce((sum, e) => sum + e[key].arrival - e.created, 0) / events.length;
}

function plan(interval) {
  const queued = new Map();
  return Array.from({ length: EVENTS }, (_, i) => {
    const created = i * DURATION / EVENTS;
    const batch = arrival(created, interval, true);
    const slot = queued.get(batch.departure) || 0;
    queued.set(batch.departure, slot + 1);
    return { created, slot, batch, stream: arrival(created, interval, false) };
  });
}

/** Точка появляется в момент создания события, ждёт отправки (в micro-batch копится порцией) и едет к приёмнику. */
function schedule(event, lane, gap) {
  const route = event[lane];
  const startX = lane === 'batch' ? LANE_START + 8 + event.slot * gap : LANE_START + 8;
  const dot = scene.cv.packets.append('circle').attr('class', 'dg-packet' + (lane === 'stream' ? ' tone-1' : ''))
    .attr('r', 4).attr('cx', startX).attr('cy', LANES[lane]).attr('opacity', 0).node();
  timeline.set(dot, { attr: { opacity: 1 } }, event.created / SPEEDUP);
  timeline.to(dot, { attr: { cx: LANE_END }, duration: TRAVEL / SPEEDUP, ease: 'power2.in' }, route.departure / SPEEDUP);
  timeline.call(() => {
    dot.remove();
    scene.sinks[lane].setText('Приёмник', 'доставлено ' + (++scene.delivered[lane]));
  }, null, route.arrival / SPEEDUP);
}

function run() {
  if (timeline) timeline.kill();
  scene = drawFrame();
  const interval = Number(slider.value);
  const events = plan(interval);
  const gap = Math.min(8, TRAIN / (interval * EVENTS / DURATION));
  button.disabled = true;
  timeline = gsap.timeline({
    onComplete: () => {
      button.disabled = false;
      result.textContent = 'Средняя задержка события в этой модели: micro-batch '
        + average(events, 'batch').toFixed(1).replace('.', ',') + ' с, поштучно '
        + average(events, 'stream').toFixed(1).replace('.', ',')
        + ' с. Всю разницу здесь создаёт интервал запуска.';
    },
  });
  events.forEach(event => ['batch', 'stream'].forEach(lane => schedule(event, lane, gap)));
  if (diagram.REDUCED_MOTION) timeline.progress(1);
}

slider.addEventListener('input', () => {
  value.textContent = slider.value + ' с';
  if (!timeline || !timeline.isActive()) scene = drawFrame();
});
button.addEventListener('click', run);
scene = drawFrame();
