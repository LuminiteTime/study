/* Поток между участниками. Участники встают в ряд, каждая пара из data-steps связана дугой:
   вперёд по ряду дуга идёт сверху, назад снизу. На шаге подсвечивается участник, и пакет летит по дуге. */
const { $, $$, diagram } = window.Course;
const WIDTH = 800, GAP = 20, NODE_H = 52, ROW_Y = 84, HEIGHT = 224;
const START_LABEL = 'Нажми «Следующий шаг»';
const WRAP_AT = 15;

/** «Kafka, fraud.alerts» становится заголовком и подписью, длинное имя без запятой переносится по пробелу. */
function splitName(name) {
  const comma = name.indexOf(', ');
  if (comma > 0) return [name.slice(0, comma), name.slice(comma + 2)];
  if (name.length <= WRAP_AT || !name.includes(' ')) return [name, ''];
  const middle = name.length / 2;
  const spaces = [...name].map((c, i) => (c === ' ' ? i : -1)).filter(i => i > 0);
  const cut = spaces.reduce((best, i) => (Math.abs(i - middle) < Math.abs(best - middle) ? i : best));
  return [name.slice(0, cut) + '\n' + name.slice(cut + 1), ''];
}

function drawActors(cv, actors) {
  const w = (WIDTH - GAP * (actors.length - 1)) / actors.length;
  return new Map(actors.map((actor, i) => {
    const [title, sub] = splitName($('span', actor).textContent);
    return [actor.id, diagram.node(cv, { x: i * (w + GAP), y: ROW_Y, w, h: NODE_H, title, sub })];
  }));
}

function drawRoutes(cv, nodes, steps) {
  const order = [...nodes.keys()];
  const routes = new Map();
  steps.filter(step => step.packet).forEach(step => {
    const from = 'flow-' + step.from, to = 'flow-' + step.to, key = from + '>' + to;
    if (routes.has(key)) return;
    const distance = order.indexOf(to) - order.indexOf(from);
    const bend = Math.sign(distance) * (26 + 14 * Math.abs(distance));
    routes.set(key, diagram.edge(cv, nodes.get(from), nodes.get(to), { bend }));
  });
  return routes;
}

function showStep(scene, step) {
  scene.nodes.forEach((handle, id) => handle.setState(id === step.highlight ? 'active' : ''));
  scene.routes.forEach(route => route.setActive(false));
  if (!step.packet) return;
  const route = scene.routes.get('flow-' + step.from + '>flow-' + step.to);
  route.setActive(true);
  diagram.sendPacket(scene.cv, route, { radius: 6, duration: 0.9 });
}

function reset(scene) {
  scene.nodes.forEach(handle => handle.setState(''));
  scene.routes.forEach(route => route.setActive(false));
}

function wire(root) {
  const steps = JSON.parse(root.dataset.steps || '[]');
  const holder = $('.flow-actors', root);
  const cv = diagram.canvas(holder, WIDTH, HEIGHT);
  const actors = $$('.flow-actor', holder);
  const nodes = drawActors(cv, actors);
  actors.forEach(actor => actor.remove());
  $('.flow-packet', root)?.remove();
  const scene = { cv, nodes, routes: drawRoutes(cv, nodes, steps) };
  const label = $('.flow-step-label', root);
  const progress = $('.flow-progress', root);
  let current = 0;
  const renderProgress = () => { progress.textContent = `Шаг ${current} из ${steps.length}`; };

  $('.flow-next-btn', root).addEventListener('click', () => {
    if (current >= steps.length) return;
    showStep(scene, steps[current]);
    label.textContent = steps[current].label || '';
    current += 1;
    renderProgress();
  });
  $('.flow-reset-btn', root).addEventListener('click', () => {
    current = 0;
    reset(scene);
    label.textContent = START_LABEL;
    renderProgress();
  });
  renderProgress();
}

$$('.flow-animation').forEach(wire);
