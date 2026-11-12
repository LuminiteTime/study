/* Урок 10: какие совпадения найдёт шаблон «три мелких платежа и крупный» при разных видах смежности. */
const { diagram } = window.Course;
const svg = document.getElementById('viz-l10-svg');
const note = document.getElementById('viz-l10-note');
const innerSelect = document.getElementById('viz-l10-inner');
const betweenSelect = document.getElementById('viz-l10-between');
const presets = { attack: 'SSSSSL', gap: 'SSNSSL', middle: 'SSSNL' };
const LABELS = { S: 'М', N: 'О', L: 'К' };
const MIN_PROBES = 3, MAX_EVENTS = 10, MAX_ROWS = 8;
let sequence = presets.attack.split('');


/** Можно ли перейти от события from к событию to, если между ними есть пропущенные события. */
function gapAllowed(mode, from, to, wanted) {
  if (mode === 'strict') return to === from + 1;
  if (mode === 'relaxed') return sequence.slice(from + 1, to).indexOf(wanted) < 0;
  return true;
}

/** Перебор всех совпадений без пропуска (NO_SKIP), как их перечисляет документация FlinkCEP. */
function findMatches(inner, between) {
  const matches = [];
  function extend(taken) {
    const last = taken[taken.length - 1];
    for (let j = last + 1; j < sequence.length; j++) {
      if (sequence[j] === 'S' && gapAllowed(inner, last, j, 'S')) extend(taken.concat(j));
      if (sequence[j] === 'L' && taken.length >= MIN_PROBES && gapAllowed(between, last, j, 'L')) {
        matches.push(taken.concat(j));
      }
    }
  }
  sequence.forEach((type, i) => { if (type === 'S') extend([i]); });
  return matches;
}

const RADIUS = { S: 6, N: 9, L: 13 };
const TONE = { S: 'tone-1', N: '', L: 'tone-4' };
const x = i => 64 + i * 66;
const ROW_TOP = 118, ROW_H = 34;

/** Ряд платежей: размер кружка это сумма, подпись под ним это тип и номер. */
function drawSequence(cv) {
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', 14).text('платежи одной карты по времени события');
  cv.groups.append('line').attr('class', 'dg-lane').attr('x1', 40).attr('x2', 700).attr('y1', 46).attr('y2', 46);
  const g = cv.nodes.selectAll('g.dg-event').data(sequence).join('g').attr('class', 'dg-event').attr('transform', (_, i) => `translate(${x(i)},46)`);
  g.append('circle').attr('class', type => 'dg-dot ' + TONE[type]).attr('r', type => RADIUS[type]);
  g.append('text').attr('class', 'dg-node-sub').attr('text-anchor', 'middle').attr('y', 32).text((type, i) => LABELS[type] + (i + 1));
}

/** Строка совпадения: все платежи бледные, вошедшие в совпадение соединены линией. */
function drawMatch(cv, match, row) {
  const y = ROW_TOP + row * ROW_H;
  const g = cv.nodes.append('g').attr('class', 'dg-match').attr('opacity', 0);
  g.append('text').attr('class', 'dg-node-sub').attr('x', 0).attr('y', y + 4).text('#' + (row + 1));
  g.append('path').attr('class', 'dg-match-line').attr('d', d3.line().curve(d3.curveMonotoneX)(match.map(i => [x(i), y])));
  sequence.forEach((type, i) => {
    g.append('circle').attr('class', 'dg-dot ' + (match.includes(i) ? TONE[type] : 'is-faint'))
      .attr('cx', x(i)).attr('cy', y).attr('r', match.includes(i) ? 5 : 3);
  });
  diagram.tween(g.node(), { opacity: 1, duration: 0.35, delay: row * 0.06 });
}

function draw() {
  const matches = findMatches(innerSelect.value, betweenSelect.value);
  const rows = Math.min(matches.length, MAX_ROWS);
  const cv = diagram.canvas(svg, 720, ROW_TOP + Math.max(rows, 1) * ROW_H);
  drawSequence(cv);
  cv.groups.append('text').attr('class', 'dg-caption').attr('x', 0).attr('y', ROW_TOP - 22)
    .text(matches.length ? 'найденные совпадения' : 'совпадений нет');
  matches.slice(0, MAX_ROWS).forEach((match, row) => drawMatch(cv, match, row));
  const hidden = matches.length > MAX_ROWS ? ' Показаны первые ' + MAX_ROWS + '.' : '';
  note.textContent = 'Совпадений ' + matches.length + '.' + hidden +
    ' Перебор без стратегии пропуска, каждое совпадение стало бы отдельным алертом.';
}

document.querySelectorAll('[data-l10-add]').forEach(button => button.addEventListener('click', () => {
  if (sequence.length < MAX_EVENTS) sequence.push(button.getAttribute('data-l10-add'));
  draw();
}));
document.querySelectorAll('[data-l10-preset]').forEach(button => button.addEventListener('click', () => {
  sequence = presets[button.getAttribute('data-l10-preset')].split('');
  draw();
}));
document.getElementById('viz-l10-clear').addEventListener('click', () => { sequence = []; draw(); });
innerSelect.addEventListener('change', draw);
betweenSelect.addEventListener('change', draw);
draw();
