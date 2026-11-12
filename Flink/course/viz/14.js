/* Урок 14: девять платежей превращаются в таблицу результата и поток изменений в трёх режимах. */
const { diagram } = window.Course;

const WINDOW_SECONDS = 60;
const WATERMARK_DELAY_SECONDS = 10;
const PAYMENTS = [
  { second: 10, merchant: 'm-1', amount: 100 },
  { second: 25, merchant: 'm-2', amount: 50 },
  { second: 40, merchant: 'm-1', amount: 30 },
  { second: 55, merchant: 'm-1', amount: 70 },
  { second: 65, merchant: 'm-2', amount: 20 },
  { second: 72, merchant: 'm-1', amount: 40 },
  { second: 58, merchant: 'm-2', amount: 15 },
  { second: 90, merchant: 'm-2', amount: 10 },
  { second: 135, merchant: 'm-1', amount: 5 },
];
const GROUP_BY_QUERY = 'SELECT merchantId, COUNT(*), SUM(amountMinor) FROM payments GROUP BY merchantId';
const WINDOW_QUERY = 'SELECT merchantId, window_start, COUNT(*), SUM(amountMinor) FROM TABLE(TUMBLE(...)) GROUP BY merchantId, window_start, window_end';
const KIND_CLASS = { '+I': 'is-insert', '-U': 'is-retract', '+U': 'is-update' };

const modeSelect = document.getElementById('viz-l14-mode');
const queryBox = document.getElementById('viz-l14-query');
const streamBox = document.getElementById('viz-l14-stream');
const tableBox = document.getElementById('viz-l14-table');
const changelogBox = document.getElementById('viz-l14-log');
const statsBox = document.getElementById('viz-l14-stats');
const noteBox = document.getElementById('viz-l14-note');
const nextButton = document.getElementById('viz-l14-next');
const resetButton = document.getElementById('viz-l14-reset');
let run = newRun(), seen = { log: 0, rows: new Map() };

function newRun() {
  return { nextIndex: 0, results: new Map(), openWindows: new Map(), changelog: [], watermark: -Infinity, dropped: 0, note: '' };
}

function clockOf(second) {
  const minutes = String(Math.floor(second / 60)).padStart(2, '0');
  return minutes + ':' + String(second % 60).padStart(2, '0');
}

function totalsAfter(previous, payment) {
  const count = previous ? previous.count + 1 : 1;
  const sum = previous ? previous.sum + payment.amount : payment.amount;
  return { count, sum };
}

function rowText(label, totals) {
  return label + ', ' + totals.count + ', ' + totals.sum;
}

function applyToGroupBy(payment, emitsBefore) {
  const previous = run.results.get(payment.merchant);
  const updated = totalsAfter(previous, payment);
  run.results.set(payment.merchant, updated);
  if (!previous) {
    run.changelog.push({ kind: '+I', text: rowText(payment.merchant, updated) });
    run.note = 'Такого продавца ещё не было, поэтому в таблице появилась новая строка.';
    return;
  }
  if (emitsBefore) run.changelog.push({ kind: '-U', text: rowText(payment.merchant, previous) });
  run.changelog.push({ kind: '+U', text: rowText(payment.merchant, updated) });
  run.note = emitsBefore
    ? 'Строка изменилась, и приёмник получил две записи. Сначала отмена старого значения, потом новое.'
    : 'Строка изменилась. Приёмник знает ключ, поэтому ему хватает одной записи с новым значением.';
}

function fireClosedWindows() {
  let fired = 0;
  run.openWindows.forEach((totals, key) => {
    const [windowStart, merchant] = key.split('|');
    if (Number(windowStart) + WINDOW_SECONDS > run.watermark) return;
    const row = clockOf(Number(windowStart)) + ', ' + rowText(merchant, totals);
    run.results.set(key, { row });
    run.changelog.push({ kind: '+I', text: row });
    run.openWindows.delete(key);
    fired += 1;
  });
  return fired;
}

function applyToWindow(payment) {
  const windowStart = Math.floor(payment.second / WINDOW_SECONDS) * WINDOW_SECONDS;
  if (windowStart + WINDOW_SECONDS <= run.watermark) {
    run.dropped += 1;
    run.note = 'Окно этого платежа уже закрыто, поэтому он отброшен и попадает только в счётчик опоздавших.';
    return;
  }
  const key = windowStart + '|' + payment.merchant;
  run.openWindows.set(key, totalsAfter(run.openWindows.get(key), payment));
  run.watermark = Math.max(run.watermark, payment.second - WATERMARK_DELAY_SECONDS);
  const fired = fireClosedWindows();
  run.note = fired
    ? 'Водяной знак прошёл конец окна. Вышли итоговые строки, и состояние окна очищено.'
    : 'Платёж лёг в состояние открытого окна. Наружу пока ничего не выходит.';
}

function applyNextPayment() {
  if (run.nextIndex >= PAYMENTS.length) return;
  const payment = PAYMENTS[run.nextIndex];
  if (modeSelect.value === 'window') applyToWindow(payment);
  else applyToGroupBy(payment, modeSelect.value === 'retract');
  run.nextIndex += 1;
  render();
}

function addRow(parent, text, className = '') {
  const row = document.createElement('div');
  row.className = 'viz-row ' + className;
  row.textContent = text;
  parent.appendChild(row);
  return row;
}

/** Новая или изменившаяся строка коротко подсвечивается, чтобы было видно, что принёс последний платёж. */
function flash(rows) {
  rows.forEach(row => row.classList.add('is-fresh'));
  diagram.tween(rows, { opacity: 1, y: 0, startAt: { opacity: 0, y: -6 }, duration: 0.35, stagger: 0.08 });
}

function renderStream() {
  streamBox.textContent = '';
  PAYMENTS.forEach((payment, index) => {
    const state = index < run.nextIndex ? 'is-done' : index === run.nextIndex ? 'is-next' : '';
    addRow(streamBox, clockOf(payment.second) + '  ' + payment.merchant + '  ' + payment.amount, state);
  });
}

function renderTable() {
  tableBox.textContent = '';
  if (run.results.size === 0) addRow(tableBox, 'пусто', 'is-empty');
  const changed = [];
  run.results.forEach((value, key) => {
    const text = value.row || rowText(key, value);
    const row = addRow(tableBox, text);
    if (seen.rows.get(key) !== text) changed.push(row);
    seen.rows.set(key, text);
  });
  flash(changed);
}

function renderChangelog() {
  changelogBox.textContent = '';
  if (run.changelog.length === 0) addRow(changelogBox, 'пусто', 'is-empty');
  const rows = run.changelog.map(entry => {
    const row = addRow(changelogBox, entry.text);
    const badge = document.createElement('span');
    badge.className = 'viz-kind ' + KIND_CLASS[entry.kind];
    badge.textContent = entry.kind;
    row.prepend(badge);
    return row;
  });
  flash(rows.slice(seen.log));
  seen.log = run.changelog.length;
}

function renderStats() {
  const isWindow = modeSelect.value === 'window';
  const stateRows = isWindow ? run.openWindows.size : run.results.size;
  const lateNote = isWindow ? ', отброшено опоздавших ' + run.dropped : '';
  statsBox.textContent = 'Строк в состоянии ' + stateRows + ', записей в changelog ' + run.changelog.length + lateNote + '.';
}

function render() {
  queryBox.textContent = modeSelect.value === 'window' ? WINDOW_QUERY : GROUP_BY_QUERY;
  renderStream();
  renderTable();
  renderChangelog();
  renderStats();
  noteBox.textContent = run.note || 'Нажимай кнопку и смотри, что появляется в таблице и в потоке изменений.';
  nextButton.disabled = run.nextIndex >= PAYMENTS.length;
}

function restart() {
  run = newRun();
  seen = { log: 0, rows: new Map() };
  render();
}

nextButton.addEventListener('click', applyNextPayment);
resetButton.addEventListener('click', restart);
modeSelect.addEventListener('change', restart);
render();
