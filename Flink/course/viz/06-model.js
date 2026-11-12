/* Урок 6, модель: окна одного ключа без DOM, отрисовка в viz/06.js.
   Логика повторяет WindowOperator, EventTimeTrigger и isWindowLate. */

const ON_TIME = [3, 8, 14, 22, 27, 41, 44, 70, 74, 79, 103, 108];
const LATE_EVENT = { ts: 52, arrivesAt: 75 };
const SIZE = 30, SLIDE = 10, GAP = 10, LATENESS = 20, WATERMARK_END = 125;

/** Последняя миллисекунда окна: WindowOperator сравнивает с watermark именно её. */
function maxTimestamp(w) {
  return w.end - 1;
}

function sameSpan(a, b) {
  return a.start === b.start && a.end === b.end;
}

function span(windows) {
  return windows.map(w => '[' + w.start + ', ' + w.end + ')').join(', ');
}

/** Окна, в которые WindowAssigner кладёт платёж с временем ts. */
function assign(type, ts) {
  if (type === 'tumbling') {
    const start = ts - (ts % SIZE);
    return [{ start, end: start + SIZE }];
  }
  if (type === 'sliding') {
    const windows = [];
    for (let start = ts - (ts % SLIDE); start > ts - SIZE; start -= SLIDE) windows.push({ start, end: start + SIZE });
    return windows;
  }
  if (type === 'session') return [{ start: ts, end: ts + GAP }];
  return [{ start: -Infinity, end: Infinity }];
}

/** Симулятор одного ключа. watermark это текущий W, lateness это allowedLateness. */
class WindowSimulation {
  constructor(type, lateness) {
    this.type = type;
    this.lateness = lateness;
    this.watermark = -Infinity;
    this.windows = [];
    this.arrived = [];
    this.fired = 0;
    this.lateFirings = 0;
    this.lateOutcome = '';
  }

  isGlobal() {
    return this.type === 'global';
  }

  cleanupTime(w) {
    return this.isGlobal() ? Infinity : maxTimestamp(w) + this.lateness;
  }

  isWindowLate(w) {
    return !this.isGlobal() && this.cleanupTime(w) <= this.watermark;
  }

  active() {
    return this.windows.filter(w => w.status !== 'gone');
  }

  rowOf(w) {
    if (this.type !== 'sliding') return 0;
    return ((Math.round(w.start / SLIDE) % 3) + 3) % 3;
  }

  /** Платёж в окно, чей конец watermark уже прошёл, сразу вызывает повторное срабатывание. */
  onElement(w) {
    if (this.isGlobal() || maxTimestamp(w) > this.watermark) return;
    w.status = 'refired';
    this.lateFirings++;
  }

  mergeSession(candidate) {
    const merged = { start: candidate.start, end: candidate.end, count: 0, status: 'open', row: 0 };
    let overlapping = this.overlapping(merged);
    while (overlapping) {
      merged.start = Math.min(merged.start, overlapping.start);
      merged.end = Math.max(merged.end, overlapping.end);
      merged.count += overlapping.count;
      this.windows.splice(this.windows.indexOf(overlapping), 1);
      overlapping = this.overlapping(merged);
    }
    return merged;
  }

  overlapping(session) {
    return this.active().find(w => w.start <= session.end && w.end >= session.start);
  }

  addEvent(ts, late) {
    const outcome = this.type === 'session' ? this.addToSession(ts, late) : this.addToWindows(ts);
    const sideOutput = outcome.skipped && !this.isGlobal() && ts + this.lateness <= this.watermark;
    this.arrived.push({ ts, late, sideOutput });
    if (late) this.lateOutcome = this.describeLate(outcome);
    return outcome.touched.length;
  }

  addToSession(ts, late) {
    const session = this.mergeSession(assign(this.type, ts)[0]);
    if (late && session.count === 0) session.row = 1;
    if (this.isWindowLate(session)) return { skipped: true, touched: [], dropped: [] };
    session.count++;
    this.windows.push(session);
    this.onElement(session);
    return { skipped: false, touched: [session], dropped: [] };
  }

  addToWindows(ts) {
    const outcome = { skipped: true, touched: [], dropped: [] };
    assign(this.type, ts).forEach(candidate => this.addToWindow(candidate, outcome));
    return outcome;
  }

  addToWindow(candidate, outcome) {
    const existing = this.windows.find(v => sameSpan(v, candidate) && v.status !== 'gone');
    const w = existing || { ...candidate, count: 0, status: 'open', row: this.rowOf(candidate) };
    if (this.isWindowLate(w)) {
      outcome.dropped.push(w);
      return;
    }
    outcome.skipped = false;
    if (!existing) this.windows.push(w);
    w.count++;
    this.onElement(w);
    outcome.touched.push(w);
  }

  describeLate({ skipped, touched, dropped }) {
    if (this.isGlobal()) return 'Опоздавший платёж лёг в global окно. Для него опозданий не бывает, но и итога тоже не будет.';
    if (skipped) return 'Опоздавший платёж ушёл в побочный выход, потому что все его окна уже удалены из состояния.';
    const names = span(touched);
    if (this.type === 'session' && touched.length === 1 && touched[0].count === 1) {
      return 'Прежняя сессия уже удалена, поэтому опоздавший платёж открыл новую сессию ' + names
        + ' из одного платежа, и она сразу сработала.';
    }
    const refired = touched.filter(w => w.status === 'refired').length;
    let text = 'Опоздавший платёж добавлен в ' + names + '. ';
    text += refired > 0
      ? 'Сразу пересчитано окон ' + refired + ', потому что watermark уже прошёл их конец. '
      : 'Окна, куда он попал, ещё не срабатывали и выпустят итог уже с ним. ';
    if (dropped.length > 0) {
      text += 'Окна ' + span(dropped) + ' уже удалены, туда он не попал, но в побочный выход платёж не уходит, '
        + 'раз его приняло хотя бы одно окно.';
    }
    return text;
  }

  advance(watermark) {
    this.watermark = watermark;
    if (this.isGlobal()) return;
    this.windows.filter(w => w.status !== 'gone').forEach(w => {
      if (w.status === 'open' && maxTimestamp(w) <= watermark) {
        w.status = 'fired';
        this.fired++;
      }
      if (this.cleanupTime(w) <= watermark) w.status = 'gone';
    });
  }
}

window.Course.windowModel = { ON_TIME, LATE_EVENT, LATENESS, WATERMARK_END, WindowSimulation };
