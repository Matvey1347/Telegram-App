const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ANSI = {
  cyan: "\x1B[36m",
  dim: "\x1B[2m",
  green: "\x1B[32m",
  red: "\x1B[31m",
  reset: "\x1B[0m",
};

export function createDevTerminalDashboard({
  title = "Local development",
  columns,
  stream = process.stdout,
  errorStream = process.stderr,
  interactive = Boolean(stream.isTTY),
  spinnerIntervalMs = 100,
} = {}) {
  const services = new Map();
  let renderedLines = 0;
  let spinnerIndex = 0;
  let spinnerTimer;

  function register(id, { column, label, detail = "Waiting" }) {
    services.set(id, { column, label, detail, state: "waiting" });
  }

  function update(id, state, detail) {
    const service = services.get(id);
    if (!service) throw new Error(`Unknown development service: ${id}`);
    service.state = state;
    if (detail) service.detail = detail;
    if (!interactive) {
      stream.write(
        `${statusIcon(service.state, spinnerIndex)} ${service.column} · ${service.label} — ${service.detail}\n`,
      );
      spinnerIndex = (spinnerIndex + 1) % SPINNER.length;
      return;
    }
    render();
    synchronizeSpinner();
  }

  function render() {
    const lines = dashboardLines({
      title,
      columns,
      services,
      spinnerIndex,
      colors: true,
    });
    spinnerIndex = (spinnerIndex + 1) % SPINNER.length;
    if (!interactive) return;
    if (renderedLines) stream.write(`\x1B[${renderedLines}A\x1B[0J`);
    stream.write(`${lines.join("\n")}\n`);
    renderedLines = lines.length;
  }

  function notice(message) {
    if (interactive && renderedLines)
      stream.write(`\x1B[${renderedLines}A\x1B[0J`);
    stream.write(`ℹ ${message}\n`);
    renderedLines = 0;
    render();
  }

  function fail(id, error, recentLines = []) {
    const service = services.get(id);
    if (!service) throw new Error(`Unknown development service: ${id}`);
    service.state = "failed";
    service.detail = conciseError(error);
    const details = recentLines.filter(isUsefulDiagnostic).slice(-8);
    if (interactive && renderedLines) {
      stream.write(`\x1B[${renderedLines}A\x1B[0J`);
      renderedLines = 0;
    }
    if (details.length) {
      errorStream.write(
        `\n${serviceLabel(services.get(id))} recent diagnostic output:\n${details.map((line) => `  ${compactLine(line)}`).join("\n")}\n`,
      );
    }
    if (!interactive) {
      stream.write(
        `✗ ${service.column} · ${service.label} — ${service.detail}\n`,
      );
      return;
    }
    render();
    synchronizeSpinner();
  }

  function synchronizeSpinner() {
    const hasStartingService = [...services.values()].some(
      (service) => service.state === "starting",
    );
    if (hasStartingService && !spinnerTimer) {
      spinnerTimer = setInterval(render, spinnerIntervalMs);
      spinnerTimer.unref?.();
      return;
    }
    if (!hasStartingService && spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = undefined;
    }
  }

  function dispose() {
    if (spinnerTimer) clearInterval(spinnerTimer);
    spinnerTimer = undefined;
  }

  return { register, update, render, notice, fail, dispose };
}

export function dashboardLines({
  title,
  columns = [],
  services,
  spinnerIndex = 0,
  colors = false,
}) {
  const columnWidth = 36;
  const rows = Math.max(
    1,
    ...columns
      .map((column) =>
        [...services.values()].filter(
          (service) => service.column === column.id,
        ),
      )
      .map((items) => items.length),
  );
  const itemsByColumn = new Map(
    columns.map((column) => [
      column.id,
      [...services.values()].filter((service) => service.column === column.id),
    ]),
  );
  const formatRow = (cells) => `│ ${cells.join(" │ ")} │`;
  const totalWidth = formatRow(
    columns.map(() => "".padEnd(columnWidth)),
  ).length;
  const lines = [
    `╭─ ${title} ${"─".repeat(Math.max(1, totalWidth - title.length - 5))}╮`,
    formatRow(columns.map((column) => column.label.padEnd(columnWidth))),
  ];
  for (let index = 0; index < rows; index += 1) {
    lines.push(
      formatRow(
        columns.map((column) =>
          formatService(
            itemsByColumn.get(column.id)?.[index],
            spinnerIndex,
            columnWidth,
            colors,
          ),
        ),
      ),
    );
  }
  lines.push(`╰${"─".repeat(Math.max(1, totalWidth - 2))}╯`);
  return lines;
}

function formatService(service, spinnerIndex, width, colors) {
  if (!service) return "—".padEnd(width);
  const icon = statusIcon(service.state, spinnerIndex);
  const line = truncateTerminalLine(
    `${icon} ${service.label} — ${service.detail}`,
    width,
  );
  if (!colors) return line;
  return `${statusIcon(service.state, spinnerIndex, true)}${line.slice(icon.length)}`;
}

function truncateTerminalLine(value, width) {
  if (value.length <= width) return value.padEnd(width);
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function statusIcon(state, spinnerIndex, colors = false) {
  const [icon, color] =
    state === "ready"
      ? ["✓", ANSI.green]
      : state === "failed"
        ? ["✗", ANSI.red]
        : state === "starting"
          ? [SPINNER[spinnerIndex], ANSI.cyan]
          : ["·", ANSI.dim];
  return colors ? `${color}${icon}${ANSI.reset}` : icon;
}

function serviceLabel(service) {
  return service ? `${service.column}/${service.label}` : "Development service";
}

export function compactLine(line) {
  return String(line).replace(/\s+/gu, " ").trim().slice(0, 320);
}

export function conciseError(error) {
  return compactLine(error instanceof Error ? error.message : String(error));
}

export function isUsefulDiagnostic(line) {
  return /(?:^ERROR in\b|\bTS\d{4}\b|\bEADDRINUSE\b|\bERR_PNPM\b|\bPrismaClient\w*Error\b|\[.*\]\s+ERROR\b|\b(?:Unhandled|Fatal)\b|\bError:\s|\b(?:recovery|startup) failed\b|did not become ready)/u.test(
    line,
  );
}

export function createOutputCapture({
  onDiagnostic = () => {},
  onLine = () => {},
} = {}) {
  const recentLines = [];
  let pending = "";
  return {
    write(chunk) {
      pending += String(chunk);
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        onLine(line);
        recentLines.push(line);
        if (recentLines.length > 40) recentLines.shift();
        if (isUsefulDiagnostic(line)) onDiagnostic(compactLine(line));
      }
    },
    recentLines() {
      return [...recentLines];
    },
  };
}
