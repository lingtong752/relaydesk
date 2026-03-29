import { useEffect, useState } from "react";
import type { ApprovalRecord, AuditEventRecord, RunCheckpointRecord, RunRecord } from "@shared";
import { api } from "../../../lib/api";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { SectionHeader } from "../../../shared/ui/SectionHeader";

interface RunHistoryPanelProps {
  token: string;
  run: RunRecord | null;
  onRunRestored?: (run: RunRecord | null, approval: ApprovalRecord | null) => void;
}

function formatLabel(value: string): string {
  return value.replace(/\./g, " / ");
}

function formatRunStatusLabel(value: RunRecord["status"]): string {
  const statusLabelMap: Record<RunRecord["status"], string> = {
    draft: "草稿",
    running: "运行中",
    waiting_human: "等待人工",
    paused: "已暂停",
    stopped: "已停止",
    completed: "已完成",
    failed: "执行失败"
  };

  return statusLabelMap[value];
}

export function RunHistoryPanel({ token, run, onRunRestored }: RunHistoryPanelProps): JSX.Element {
  const [events, setEvents] = useState<AuditEventRecord[]>([]);
  const [checkpoints, setCheckpoints] = useState<RunCheckpointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringCheckpointId, setRestoringCheckpointId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!run) {
      setEvents([]);
      setCheckpoints([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api.listRunAuditEvents(token, run.id, 12),
      api.listRunCheckpoints(token, run.id, 12)
    ])
      .then(([eventsResponse, checkpointsResponse]) => {
        if (cancelled) {
          return;
        }

        setEvents(eventsResponse.events);
        setCheckpoints(checkpointsResponse.checkpoints);
        setError(null);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "加载运行轨迹失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [run?.id, run?.updatedAt, token]);

  const canRestore =
    run !== null && ["paused", "stopped", "completed", "failed"].includes(run.status);

  async function handleRestore(checkpointId: string): Promise<void> {
    if (!run) {
      return;
    }

    setRestoringCheckpointId(checkpointId);
    try {
      const response = await api.restoreRun(token, run.id, { checkpointId });
      onRunRestored?.(response.run, response.approval);
      setError(null);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "从检查点恢复失败");
    } finally {
      setRestoringCheckpointId(null);
    }
  }

  return (
    <section className="run-history-panel">
      <SectionHeader
        description={
          run
            ? canRestore
              ? "检查点优先用于恢复，审计事件用于回看关键动作与责任归属。"
              : "检查点用于恢复，审计事件用于回看关键动作与责任归属。"
            : "启动一次替身运行后，这里会显示关键节点。"
        }
        eyebrow="运行轨迹"
        title={run ? `最近运行：${formatRunStatusLabel(run.status)}` : "暂无运行轨迹"}
      />

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? <p className="muted">加载运行轨迹...</p> : null}

      {run ? (
        <div className="run-history-summary">
          <article className="run-history-overview">
            <span className="agent-summary-label">本轮目标</span>
            <strong>{run.objective}</strong>
            <p>{run.constraints || "未填写额外约束，默认沿当前上下文保守推进。"}</p>
          </article>

          <article className="run-history-metric">
            <span className="agent-summary-label">当前状态</span>
            <strong>{formatRunStatusLabel(run.status)}</strong>
            <p>开始于 {new Date(run.startedAt).toLocaleString("zh-CN", { hour12: false })}</p>
          </article>

          <article className="run-history-metric">
            <span className="agent-summary-label">检查点</span>
            <strong>{checkpoints.length}</strong>
            <p>可用于恢复流程的关键节点。</p>
          </article>

          <article className="run-history-metric">
            <span className="agent-summary-label">审计事件</span>
            <strong>{events.length}</strong>
            <p>按时间记录的关键动作与状态变更。</p>
          </article>
        </div>
      ) : null}

      <div className="run-history-grid">
        <div className="timeline-section">
          <div className="section-title-row">
            <h4>检查点</h4>
            <span className="muted">{checkpoints.length} 项</span>
          </div>
          <div className="timeline-list">
            {!loading && checkpoints.length === 0 ? (
              <EmptyState message="还没有检查点，替身推进到关键节点后会在这里留下恢复锚点。" />
            ) : null}
            {checkpoints.map((checkpoint) => (
              <article className="timeline-card" key={checkpoint.id}>
                <div className="timeline-meta">
                  <strong>{checkpoint.summary}</strong>
                  <span>{new Date(checkpoint.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="timeline-tags">
                  <span className="timeline-badge">{formatRunStatusLabel(checkpoint.runStatus)}</span>
                  <span className="muted">{formatLabel(checkpoint.source)}</span>
                </div>
                {canRestore ? (
                  <div className="timeline-actions">
                    <button
                      className="secondary-button compact"
                      disabled={restoringCheckpointId !== null}
                      onClick={() => void handleRestore(checkpoint.id)}
                      type="button"
                    >
                      {restoringCheckpointId === checkpoint.id ? "恢复中..." : "从此恢复"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <div className="timeline-section">
          <div className="section-title-row">
            <h4>审计事件</h4>
            <span className="muted">{events.length} 项</span>
          </div>
          <div className="timeline-list">
            {!loading && events.length === 0 ? (
              <EmptyState message="还没有审计事件，关键操作、切换与异常会按时间顺序记录在这里。" />
            ) : null}
            {events.map((event) => (
              <article className="timeline-card" key={event.id}>
                <div className="timeline-meta">
                  <strong>{event.summary}</strong>
                  <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="timeline-tags">
                  <span className="timeline-badge">{formatLabel(event.eventType)}</span>
                  <span className="muted">{event.actorType}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
