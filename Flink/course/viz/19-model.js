/* Урок 19, модель: расчёт памяти TaskManager без DOM, отрисовка в viz/19.js.
   Порядок вычислений повторяет ProcessMemoryUtils.memoryProcessSpecFromConfig и
   TaskExecutorFlinkMemoryUtils (Flink 2.2.1), значения по умолчанию взяты из TaskManagerOptions.
   Доли в Flink имеют тип float, поэтому перед умножением они проходят через Math.fround,
   а результат умножения отбрасывает дробную часть, как MemorySize.multiply. */

const MIB = 1048576;
const DEFAULTS = {
  frameworkHeap: 128 * MIB,      // taskmanager.memory.framework.heap.size
  frameworkOffHeap: 128 * MIB,   // taskmanager.memory.framework.off-heap.size
  taskOffHeap: 0,                // taskmanager.memory.task.off-heap.size
  networkMin: 64 * MIB,          // taskmanager.memory.network.min
  networkMax: Number.MAX_SAFE_INTEGER, // taskmanager.memory.network.max, без предела
  overheadMin: 192 * MIB,        // taskmanager.memory.jvm-overhead.min
  overheadMax: 1024 * MIB,       // taskmanager.memory.jvm-overhead.max
  writeBufferRatio: 0.5          // state.backend.rocksdb.memory.write-buffer-ratio
};

function ConfigError(message) { this.message = message; }

function mib(bytes) { return Math.floor(bytes / MIB); }
// Как MemorySize.toHumanReadableString: самая крупная единица, которую размер строго превышает.
function human(bytes) {
  const units = [['tb', 1024 * 1024 * MIB], ['gb', 1024 * MIB], ['mb', MIB], ['kb', 1024]];
  const unit = units.find(u => bytes > u[1]);
  return unit ? (bytes / unit[1]).toFixed(3) + unit[0] + ' (' + bytes + ' bytes)' : bytes + ' bytes';
}

// ProcessMemoryUtils.getRangeFraction: доля обязана лежать в [0, 1).
function rangeFraction(min, max, fraction, key) {
  if (!(fraction >= 0 && fraction < 1) || min > max) {
    throw new ConfigError('Inconsistently configured ' + key + ' (' + fraction + '). Доля должна быть в диапазоне [0, 1).');
  }
  return { min, max, fraction: Math.fround(fraction) };
}

// ProcessMemoryUtils.deriveWithFraction и deriveWithInverseFraction с обрезкой по min и max.
function capped(base, range, { inverse, label }, notes) {
  const factor = inverse ? range.fraction / (1 - range.fraction) : range.fraction;
  const relative = Math.floor(base * factor);
  if (relative > range.max) {
    notes.push(label + ' по доле вышла ' + mib(relative) + ' МиБ, взят максимум ' + mib(range.max) + ' МиБ.');
    return range.max;
  }
  if (relative < range.min) {
    notes.push(label + ' по доле вышла ' + mib(relative) + ' МиБ, взят минимум ' + mib(range.min) + ' МиБ.');
    return range.min;
  }
  return relative;
}

function networkRange(c) { return rangeFraction(DEFAULTS.networkMin, DEFAULTS.networkMax, c.networkFraction, 'taskmanager.memory.network.fraction'); }
function managedRange(c) { return rangeFraction(0, Number.MAX_SAFE_INTEGER, c.managedFraction, 'taskmanager.memory.managed.fraction'); }
function overheadRange(c) { return rangeFraction(DEFAULTS.overheadMin, DEFAULTS.overheadMax, c.overheadFraction, 'taskmanager.memory.jvm-overhead.fraction'); }

function checkNetwork(network, c) {
  const range = networkRange(c);
  if (network > range.max || network < range.min) {
    throw new ConfigError('If Total Flink, Task Heap and (or) Managed Memory sizes are explicitly configured then the Network Memory size is the rest of the Total Flink memory ... Caused by: Derived Network Memory size (' +
      (network === 0 ? '0 bytes' : human(network)) + ') is not in configured Network Memory range [' + human(range.min) + ', ...]');
  }
}

function sumExceeds(parts, total) {
  return new ConfigError('Sum of configured ' + parts + ' exceed configured Total Flink Memory (' + human(total) + ').');
}

// TaskExecutorFlinkMemoryUtils.deriveFromRequiredFineGrainedOptions: заданы и task.heap, и managed.size.
function fromFineGrained(c, notes) {
  const excludeNetwork = DEFAULTS.frameworkHeap + DEFAULTS.frameworkOffHeap + c.taskHeap + DEFAULTS.taskOffHeap + c.managed;
  let network;
  if (c.flink !== null) {
    if (excludeNetwork > c.flink) throw sumExceeds('Framework Heap, Framework Off-Heap, Task Heap, Task Off-Heap and Managed Memory', c.flink);
    network = c.flink - excludeNetwork;
    checkNetwork(network, c);
  } else {
    network = capped(excludeNetwork, networkRange(c), { inverse: true, label: 'Network Memory' }, notes);
  }
  return flinkParts(c.taskHeap, network, c.managed);
}

// TaskExecutorFlinkMemoryUtils.deriveFromTotalFlinkMemory.
function fromTotalFlink(c, total, notes) {
  const managed = c.managed !== null ? c.managed : capped(total, managedRange(c), { inverse: false, label: 'Managed Memory' }, notes);
  if (c.taskHeap !== null) {
    const excludeNetwork = DEFAULTS.frameworkHeap + DEFAULTS.frameworkOffHeap + c.taskHeap + DEFAULTS.taskOffHeap + managed;
    if (excludeNetwork > total) throw sumExceeds('Framework Heap, Framework Off-Heap, Task Heap, Task Off-Heap and Managed Memory', total);
    const network = total - excludeNetwork;
    checkNetwork(network, c);
    return flinkParts(c.taskHeap, network, managed);
  }
  const network = capped(total, networkRange(c), { inverse: false, label: 'Network Memory' }, notes);
  const excludeTaskHeap = DEFAULTS.frameworkHeap + DEFAULTS.frameworkOffHeap + DEFAULTS.taskOffHeap + managed + network;
  if (excludeTaskHeap > total) throw sumExceeds('Framework Heap, Framework Off-Heap, Task Off-Heap, Managed and Network Memory', total);
  return flinkParts(total - excludeTaskHeap, network, managed);
}

function flinkParts(taskHeap, network, managed) {
  const { frameworkHeap, frameworkOffHeap, taskOffHeap } = DEFAULTS;
  const parts = { frameworkHeap, taskHeap, frameworkOffHeap, taskOffHeap, network, managed };
  parts.total = parts.frameworkHeap + parts.taskHeap + parts.frameworkOffHeap + parts.taskOffHeap + parts.network + parts.managed;
  return parts;
}

// ProcessMemoryUtils.deriveJvmMetaspaceAndOverheadFromTotalFlinkMemory.
function jvmFromTotalFlink(c, totalFlink, notes) {
  const range = overheadRange(c);
  if (c.process !== null) {
    if (c.process < totalFlink + c.metaspace) {
      throw new ConfigError('The configured Total Process Memory size (' + human(c.process) + ') is less than the sum of the derived Total Flink Memory size (' +
        human(totalFlink) + ') and the configured or default JVM Metaspace size (' + human(c.metaspace) + ').');
    }
    const overhead = c.process - totalFlink - c.metaspace;
    if (overhead > range.max || overhead < range.min) {
      throw new ConfigError('Derived JVM Overhead size (' + human(overhead) + ') is not in configured JVM Overhead range [' + human(range.min) + ', ' + human(range.max) + '].');
    }
    return { metaspace: c.metaspace, overhead };
  }
  return { metaspace: c.metaspace, overhead: capped(totalFlink + c.metaspace, range, { inverse: true, label: 'JVM Overhead' }, notes) };
}

// ProcessMemoryUtils.memoryProcessSpecFromConfig: три ветки по тому, что задано явно.
function derive(c) {
  const notes = [];
  let flink, jvm;
  if (c.taskHeap !== null && c.managed !== null) {
    flink = fromFineGrained(c, notes);
    jvm = jvmFromTotalFlink(c, flink.total, notes);
  } else if (c.flink !== null) {
    flink = fromTotalFlink(c, c.flink, notes);
    jvm = jvmFromTotalFlink(c, c.flink, notes);
  } else if (c.process !== null) {
    const overhead = capped(c.process, overheadRange(c), { inverse: false, label: 'JVM Overhead' }, notes);
    if (c.metaspace + overhead > c.process) {
      throw new ConfigError('Sum of configured JVM Metaspace (' + human(c.metaspace) + ') and JVM Overhead (' + human(overhead) + ') exceed configured Total Process Memory (' + human(c.process) + ').');
    }
    jvm = { metaspace: c.metaspace, overhead };
    flink = fromTotalFlink(c, c.process - c.metaspace - overhead, notes);
  } else {
    throw new ConfigError('Either required fine-grained memory (taskmanager.memory.task.heap.size and taskmanager.memory.managed.size), or Total Flink Memory size, or Total Process Memory size need to be configured explicitly.');
  }
  if (c.flink !== null && flink.total !== c.flink) {
    throw new ConfigError('Configured and Derived Flink internal memory sizes do not add up to the configured Total Flink Memory size (' + human(c.flink) + ').');
  }
  return { flink, jvm, totalProcess: flink.total + jvm.metaspace + jvm.overhead, notes };
}

window.Course.memory = { MIB, DEFAULTS, ConfigError, mib, derive };
