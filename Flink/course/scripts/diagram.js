/* Набор деталей для схем курса поверх D3 и GSAP: холст, узел, группа, ребро со стрелкой, пакет на ребре.
   Цвета и толщины задаёт viz.css через классы, здесь только геометрия. */
gsap.registerPlugin(MotionPathPlugin);

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LINE = 15;
let canvasCount = 0;

/** SVG с viewBox и слоями (готовый svg из разметки или новый внутри контейнера): группы снизу, затем рёбра, узлы и пакеты сверху. */
function canvas(container, width, height) {
  const id = 'dg' + (++canvasCount);
  const own = container instanceof SVGSVGElement ? container : container.querySelector(':scope > svg.dg');
  const root = (own ? d3.select(own) : d3.select(container).append('svg').attr('role', 'img'))
    .attr('class', 'dg').attr('viewBox', `0 0 ${width} ${height}`);
  root.selectAll('*').remove();
  const defs = root.append('defs');
  ['', ' tone-1', ' tone-2', ' tone-3', ' tone-4', ' is-active'].forEach(tone => {
    defs.append('marker').attr('id', id + markerSuffix(tone)).attr('class', 'dg-arrow' + tone)
      .attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M1 1L9 5L1 9');
  });
  const layer = name => root.append('g').attr('class', 'dg-layer-' + name);
  return { id, root, width, height, groups: layer('groups'), edges: layer('edges'), nodes: layer('nodes'), packets: layer('packets') };
}

function markerSuffix(tone) {
  return tone ? '-' + tone.trim() : '';
}

/** Пунктирная рамка с подписью: TaskManager, слот, кластер. */
function group(cv, { x, y, w, h, label }) {
  const g = cv.groups.append('g').attr('class', 'dg-group');
  g.append('rect').attr('x', x).attr('y', y).attr('width', w).attr('height', h).attr('rx', 12);
  if (label) g.append('text').attr('class', 'dg-group-label').attr('x', x + 12).attr('y', y + 18).text(label);
  return g;
}

/** Узел: карточка с заголовком и подписью моноширинным шрифтом. Состояние меняется классом. */
function node(cv, { x, y, w, h = 44, title, sub }) {
  const g = cv.nodes.append('g').attr('class', 'dg-node').attr('transform', `translate(${x},${y})`);
  g.append('rect').attr('class', 'dg-node-box').attr('width', w).attr('height', h).attr('rx', 8);
  const titleText = g.append('text').attr('class', 'dg-node-title').attr('x', w / 2).attr('text-anchor', 'middle');
  const subText = g.append('text').attr('class', 'dg-node-sub').attr('x', w / 2).attr('text-anchor', 'middle');
  const handle = {
    box: { x, y, w, h },
    el: g,
    setText(nextTitle, nextSub = '') {
      const lines = String(nextTitle).split('\n');
      const top = h / 2 - ((lines.length - 1) * LINE + (nextSub ? LINE : 0)) / 2 + 4;
      titleText.selectAll('tspan').data(lines).join('tspan').attr('x', w / 2).attr('y', (_, i) => top + i * LINE).text(line => line);
      subText.text(nextSub).attr('y', top + lines.length * LINE - 1);
      return handle;
    },
    setState(state) {
      g.attr('class', 'dg-node' + (state ? ' is-' + state : ''));
      return handle;
    },
  };
  return handle.setText(title, sub);
}

/** Точки выхода и входа ребра: по сторонам, обращённым друг к другу. */
function anchors(from, to) {
  const a = from.box, b = to.box;
  if (b.x >= a.x + a.w) return [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }, 'h'];
  if (a.x >= b.x + b.w) return [{ x: a.x, y: a.y + a.h / 2 }, { x: b.x + b.w, y: b.y + b.h / 2 }, 'h'];
  if (b.y >= a.y + a.h) return [{ x: a.x + a.w / 2, y: a.y + a.h }, { x: b.x + b.w / 2, y: b.y }, 'v'];
  return [{ x: a.x + a.w / 2, y: a.y }, { x: b.x + b.w / 2, y: b.y + b.h }, 'v'];
}

/** Кривая Безье между узлами. bend поднимает середину над прямой: так рёбра в одном ряду не накрывают соседей. */
function edgePath(from, to, bend = 0) {
  const [p, q, axis] = anchors(from, to);
  if (bend) return `M${p.x},${p.y} C${p.x},${p.y - bend} ${q.x},${q.y - bend} ${q.x},${q.y}`;
  if (axis === 'h') {
    const mid = (p.x + q.x) / 2;
    return `M${p.x},${p.y} C${mid},${p.y} ${mid},${q.y} ${q.x},${q.y}`;
  }
  const mid = (p.y + q.y) / 2;
  return `M${p.x},${p.y} C${p.x},${mid} ${q.x},${mid} ${q.x},${q.y}`;
}

/** Ребро со стрелкой. Для рёбер в одном ряду from и to берутся сверху или снизу узлов: bend задаёт высоту дуги. */
function edge(cv, from, to, { tone = '', label = '', bend = 0, dashed = false } = {}) {
  const d = bend ? arcPath(from, to, bend) : edgePath(from, to);
  const g = cv.edges.append('g').attr('class', ['dg-edge', tone && 'tone-' + tone, dashed && 'is-dashed'].filter(Boolean).join(' '));
  const path = g.append('path').attr('d', d).attr('marker-end', markerUrl(cv, tone, false));
  if (label) {
    const point = path.node().getPointAtLength(path.node().getTotalLength() / 2);
    g.append('text').attr('class', 'dg-edge-label').attr('x', point.x).attr('y', point.y - 6).attr('text-anchor', 'middle').text(label);
  }
  return {
    el: g,
    path: path.node(),
    setActive(active) {
      g.classed('is-active', active);
      path.attr('marker-end', markerUrl(cv, tone, active));
    },
  };
}

function markerUrl(cv, tone, active) {
  if (active) return `url(#${cv.id}-is-active)`;
  return `url(#${cv.id}${tone ? '-tone-' + tone : ''})`;
}

/** Дуга между узлами одного ряда: положительный bend выгибает вверх от верхних граней, отрицательный вниз от нижних. */
function arcPath(from, to, bend) {
  const a = from.box, b = to.box, up = bend > 0;
  const p = { x: a.x + a.w / 2 + (b.x > a.x ? 8 : -8), y: up ? a.y : a.y + a.h };
  const q = { x: b.x + b.w / 2 + (b.x > a.x ? -8 : 8), y: up ? b.y : b.y + b.h };
  const lift = up ? -Math.abs(bend) : Math.abs(bend);
  return `M${p.x},${p.y} C${p.x},${p.y + lift} ${q.x},${q.y + lift} ${q.x},${q.y}`;
}

/** Пакет пролетает по ребру и исчезает. Возвращает промис конца полёта, чтобы шаги шли друг за другом. */
function sendPacket(cv, route, { tone = '', duration = 0.8, delay = 0, radius = 5 } = {}) {
  const dot = cv.packets.append('circle').attr('class', 'dg-packet' + (tone ? ' tone-' + tone : '')).attr('r', radius).attr('opacity', 0).node();
  return new Promise(resolve => {
    gsap.to(dot, {
      duration: REDUCED_MOTION ? 0 : duration,
      delay: REDUCED_MOTION ? 0 : delay,
      ease: 'power2.inOut',
      motionPath: { path: route.path, align: route.path, alignOrigin: [0.5, 0.5] },
      onStart: () => dot.setAttribute('opacity', 1),
      onComplete: () => { dot.remove(); resolve(); },
    });
  });
}

/** Плавная смена числового атрибута или стиля через GSAP с учётом reduced motion. */
function tween(target, vars) {
  return gsap.to(target, { duration: 0.6, ease: 'power3.out', ...vars, ...(REDUCED_MOTION ? { duration: 0, delay: 0, stagger: 0 } : {}) });
}

/** Легенда под схемой: [цвет, подпись]. Цвет это CSS-значение, например var(--color-actor-1). */
function legend(after, items) {
  const list = document.createElement('ul');
  list.className = 'viz-legend';
  items.forEach(([color, label]) => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'viz-swatch';
    swatch.style.setProperty('--swatch', color);
    item.append(swatch, label);
    list.append(item);
  });
  after.after(list);
  return list;
}

window.Course.diagram = { legend, canvas, group, node, edge, sendPacket, tween, REDUCED_MOTION };
