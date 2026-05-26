/**
 * VoiceAI Dashboard — Performance Monitoring
 *
 * Lightweight in-process metrics collection for API routes and WebSocket operations.
 * Metrics are stored in-memory and exposed via GET /api/monitoring.
 */

// ── Metrics Types ────────────────────────────────────────────────────

export interface RequestMetric {
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

export interface RouteAggregate {
  path: string;
  method: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  statusCodes: Record<number, number>;
  errors: number;
  lastRequest: number;
}

export interface MonitoringSnapshot {
  uptime: number;
  totalRequests: number;
  routes: RouteAggregate[];
  wsClients: number;
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
}

// ── In-memory Metrics Store ──────────────────────────────────────────

const routeMetrics = new Map<string, RouteAggregate>();
let totalRequests = 0;
const startTime = Date.now();
let wsClientCount = 0;

// ── Metrics Collection ──────────────────────────────────────────────

/**
 * Record an API request metric.
 */
export function recordRequest(metric: RequestMetric): void {
  totalRequests++;
  const key = `${metric.method}:${metric.path}`;

  const existing = routeMetrics.get(key);
  if (existing) {
    existing.count++;
    existing.totalDurationMs += metric.durationMs;
    existing.avgDurationMs = Math.round(existing.totalDurationMs / existing.count);
    existing.minDurationMs = Math.min(existing.minDurationMs, metric.durationMs);
    existing.maxDurationMs = Math.max(existing.maxDurationMs, metric.durationMs);
    existing.statusCodes[metric.statusCode] =
      (existing.statusCodes[metric.statusCode] ?? 0) + 1;
    if (metric.statusCode >= 400) {
      existing.errors++;
    }
    existing.lastRequest = metric.timestamp;
  } else {
    routeMetrics.set(key, {
      path: metric.path,
      method: metric.method,
      count: 1,
      totalDurationMs: metric.durationMs,
      avgDurationMs: metric.durationMs,
      minDurationMs: metric.durationMs,
      maxDurationMs: metric.durationMs,
      statusCodes: { [metric.statusCode]: 1 },
      errors: metric.statusCode >= 400 ? 1 : 0,
      lastRequest: metric.timestamp,
    });
  }
}

/**
 * Update the current WebSocket client count.
 */
export function updateWsClientCount(count: number): void {
  wsClientCount = count;
}

/**
 * Get a snapshot of all current metrics.
 */
export function getMetricsSnapshot(): MonitoringSnapshot {
  let mem: { heapUsed: number; heapTotal: number; rss: number } = { heapUsed: 0, heapTotal: 0, rss: 0 };
  try {
    mem = process.memoryUsage();
  } catch {
    // Not available in Edge Runtime
  }
  return {
    uptime: Math.round((Date.now() - startTime) / 1000),
    totalRequests,
    routes: Array.from(routeMetrics.values()).sort(
      (a, b) => b.lastRequest - a.lastRequest
    ),
    wsClients: wsClientCount,
    memory: {
      heapUsedMB: Math.round((mem.heapUsed ?? 0) / 1024 / 1024),
      heapTotalMB: Math.round((mem.heapTotal ?? 0) / 1024 / 1024),
      rssMB: Math.round((mem.rss ?? 0) / 1024 / 1024),
    },
  };
}

/**
 * Reset all metrics (useful for testing).
 */
export function resetMetrics(): void {
  routeMetrics.clear();
  totalRequests = 0;
  wsClientCount = 0;
}

// ── Structured Logging ──────────────────────────────────────────────

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  path?: string;
  method?: string;
  durationMs?: number;
  statusCode?: number;
  error?: string;
  timestamp: number;
}

const MAX_LOG_ENTRIES = 1000;
const recentLogs: LogEntry[] = [];

/**
 * Write a structured log entry (stored in ring buffer + console).
 */
export function log(entry: Omit<LogEntry, "timestamp">): void {
  const full: LogEntry = { ...entry, timestamp: Date.now() };
  recentLogs.push(full);

  // Trim ring buffer
  if (recentLogs.length > MAX_LOG_ENTRIES) {
    recentLogs.splice(0, recentLogs.length - MAX_LOG_ENTRIES);
  }

  // Console output with consistent format
  const prefix = `[${new Date(full.timestamp).toISOString()}] [${full.level.toUpperCase()}]`;
  const details = [full.path, full.method, full.durationMs ? `${full.durationMs}ms` : null]
    .filter(Boolean)
    .join(" ");

  if (full.level === "error") {
    console.error(`${prefix} ${full.message} ${details} ${full.error ?? ""}`);
  } else if (full.level === "warn") {
    console.warn(`${prefix} ${full.message} ${details}`);
  } else {
    console.log(`${prefix} ${full.message} ${details}`);
  }
}

/**
 * Get recent log entries (up to 100).
 */
export function getRecentLogs(limit = 100): LogEntry[] {
  return recentLogs.slice(-limit);
}
