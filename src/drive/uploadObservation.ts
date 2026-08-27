import { apiRequest } from "../api/client";

export const UPLOAD_OBSERVATION_INTERVAL_MS = 30_000;
const STALL_MS = 30_000;

type UploadKind = "single" | "multiple" | "folder";
type FileState = {
  observationId: string;
  sizeBytes: number;
  relativeDepth: number;
  startedAt?: number;
  finishedAt?: number;
  lastProgressAt: number;
  status?: number;
  errorCode?: string;
  retryCount: number;
  completed: boolean;
};

export class UploadObservation {
  readonly uploadSessionId = crypto.randomUUID();
  private readonly startedAt = Date.now();
  private readonly files = new Map<File, FileState>();
  private retryCount = 0;
  private retriedFiles = new Set<string>();
  private requestIds = new Set<string>();
  private httpStatusCounts: Record<string, number> = {};
  private errorCodeCounts: Record<string, number> = {};
  private cancelledFiles = 0;
  private longTaskCount = 0;
  private longTaskTotalDurationMs = 0;
  private longTaskMaxDurationMs = 0;
  private backgroundDurationMs = 0;
  private backgroundStartedAt: number | null = null;
  private stallCount = 0;
  private timer: number | null = null;
  private observer?: PerformanceObserver;
  private registration?: Promise<void>;
  private readonly visibilityListener = () => this.onVisibilityChange();

  constructor(
    files: File[],
    private readonly concurrency: number,
    private readonly uploadKind: UploadKind,
    private readonly organizationId: number | null = null,
  ) {
    for (const file of files) {
      const relativePath = (file as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      this.files.set(file, {
        observationId: crypto.randomUUID(),
        sizeBytes: file.size,
        relativeDepth: relativePath
          ? Math.max(0, relativePath.split("/").length - 1)
          : 0,
        retryCount: 0,
        lastProgressAt: Date.now(),
        completed: false,
      });
    }
    this.installBrowserObservers();
  }

  async start() {
    this.registration = this.bestEffort(this.metricPath(), "POST", {
      upload_session_id: this.uploadSessionId,
      ...this.staticMetrics(),
      upload_kind: this.uploadKind,
      status: "in_progress",
      started_at: new Date(this.startedAt).toISOString(),
      frontend_version: import.meta.env.VITE_GIT_COMMIT_SHA,
      metadata: { long_task_supported: Boolean(this.observer) },
    });
    await this.registration;
    this.timer = window.setInterval(
      () => void this.updateMetric("in_progress"),
      UPLOAD_OBSERVATION_INTERVAL_MS,
    );
  }

  begin(file: File, retry = false) {
    const state = this.files.get(file);
    if (!state) return;
    const wasStarted = state.startedAt !== undefined;
    state.startedAt = Date.now();
    state.lastProgressAt = Date.now();
    state.completed = false;
    if (retry || wasStarted) {
      state.retryCount += 1;
      this.retryCount += 1;
      this.retriedFiles.add(state.observationId);
    }
  }

  progress(file: File) {
    const state = this.files.get(file);
    if (state) state.lastProgressAt = Date.now();
  }

  recordRequestId(requestId: string) {
    if (this.requestIds.size < 500) this.requestIds.add(requestId);
  }

  finish(file: File, status: number, errorCode?: string) {
    const state = this.files.get(file);
    if (!state) return;
    state.finishedAt = Date.now();
    state.status = status;
    state.errorCode = errorCode;
    increment(this.httpStatusCounts, String(status));
    if (errorCode) increment(this.errorCodeCounts, errorCode);
    state.completed = status >= 200 && status < 300;
    if (errorCode === "cancelled") this.cancelledFiles += 1;
  }

  reflected(file: File) {
    void file;
    // 一覧反映待ちはセッション経過時間へ含まれ、個別名やパスは保持しない。
  }

  async complete(
    status: "completed" | "completed_with_errors" | "failed" | "cancelled",
  ) {
    if (this.timer !== null) window.clearInterval(this.timer);
    await this.registration;
    await this.updateMetric(status, true);
    this.dispose();
  }

  private async updateMetric(status: string, final = false) {
    this.detectStalls();
    const elapsedMs = Date.now() - this.startedAt;
    const completed = [...this.files.values()].filter((file) => file.completed);
    const failed = [...this.files.values()].filter(
      (file) => file.finishedAt !== undefined && !file.completed,
    );
    await this.bestEffort(this.metricPath(this.uploadSessionId), "PATCH", {
      status,
      completed_at: final ? new Date().toISOString() : undefined,
      last_observed_at: new Date().toISOString(),
      completed_files: completed.length,
      completed_bytes: completed.reduce((sum, file) => sum + file.sizeBytes, 0),
      failed_files: failed.length,
      retried_files: this.retriedFiles.size,
      retry_count: this.retryCount,
      cancelled_files: this.cancelledFiles,
      max_concurrency: this.concurrency,
      elapsed_ms: elapsedMs,
      effective_throughput_bytes_per_second: elapsedMs
        ? Math.round(
            (completed.reduce((sum, file) => sum + file.sizeBytes, 0) * 1000) /
              elapsedMs,
          )
        : 0,
      progress_stall_count: this.stallCount,
      long_task_count: this.longTaskCount,
      long_task_total_duration_ms: Math.round(this.longTaskTotalDurationMs),
      long_task_max_duration_ms: Math.round(this.longTaskMaxDurationMs),
      background_duration_ms: this.currentBackgroundDuration(),
      http_status_counts: this.httpStatusCounts,
      error_code_counts: this.errorCodeCounts,
      request_ids: [...this.requestIds],
    });
  }

  private staticMetrics() {
    const sizes = [...this.files.values()]
      .map((file) => file.sizeBytes)
      .sort((a, b) => a - b);
    const buckets = sizeBuckets(sizes);
    return {
      total_files: sizes.length,
      total_bytes: sizes.reduce((sum, size) => sum + size, 0),
      max_concurrency: this.concurrency,
      min_file_size_bytes: sizes[0] ?? 0,
      max_file_size_bytes: sizes.at(-1) ?? 0,
      average_file_size_bytes: sizes.length
        ? Math.round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length)
        : 0,
      max_relative_depth: Math.max(
        0,
        ...[...this.files.values()].map((file) => file.relativeDepth),
      ),
      ...buckets,
    };
  }

  private detectStalls() {
    for (const file of this.files.values()) {
      if (
        !file.completed &&
        file.startedAt !== undefined &&
        file.finishedAt === undefined &&
        Date.now() - file.lastProgressAt >= STALL_MS
      ) {
        this.stallCount += 1;
        file.lastProgressAt = Date.now();
      }
    }
  }

  private async bestEffort(path: string, method: string, body: unknown) {
    try {
      await apiRequest(path, { method, body, retryCsrf: false });
    } catch {
      // 統計API障害を通常アップロードへ波及させない。
    }
  }

  private installBrowserObservers() {
    document.addEventListener("visibilitychange", this.visibilityListener);
    if (document.hidden) this.backgroundStartedAt = Date.now();
    try {
      if (
        !("PerformanceObserver" in window) ||
        !PerformanceObserver.supportedEntryTypes?.includes("longtask")
      )
        return;
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.longTaskCount += 1;
          this.longTaskTotalDurationMs += entry.duration;
          this.longTaskMaxDurationMs = Math.max(
            this.longTaskMaxDurationMs,
            entry.duration,
          );
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      this.observer = undefined;
    }
  }

  private onVisibilityChange() {
    if (document.hidden) this.backgroundStartedAt ??= Date.now();
    else if (this.backgroundStartedAt !== null) {
      this.backgroundDurationMs += Date.now() - this.backgroundStartedAt;
      this.backgroundStartedAt = null;
    }
  }

  private currentBackgroundDuration() {
    return (
      this.backgroundDurationMs +
      (this.backgroundStartedAt === null ? 0 : Date.now() - this.backgroundStartedAt)
    );
  }

  private metricPath(uploadSessionId?: string) {
    const prefix =
      this.organizationId === null
        ? "/api/v1"
        : `/api/v1/organizations/${this.organizationId}`;
    return `${prefix}/upload_metrics${uploadSessionId ? `/${uploadSessionId}` : ""}`;
  }

  private dispose() {
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityListener);
    this.files.clear();
  }
}

function sizeBuckets(values: number[]) {
  return {
    under_1mb_count: values.filter((value) => value < 1024 ** 2).length,
    between_1mb_and_100mb_count: values.filter(
      (value) => value >= 1024 ** 2 && value < 100 * 1024 ** 2,
    ).length,
    between_100mb_and_1gb_count: values.filter(
      (value) => value >= 100 * 1024 ** 2 && value < 1024 ** 3,
    ).length,
    over_1gb_count: values.filter((value) => value >= 1024 ** 3).length,
  };
}

function increment(counts: Record<string, number>, key: string) {
  if (Object.keys(counts).length >= 100 && !(key in counts)) return;
  counts[key] = (counts[key] ?? 0) + 1;
}
