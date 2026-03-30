import type { SessionRecord } from "@shared";
import { getSessionCapabilities } from "../../../lib/sessionRuntime";
import { AgentStatusHeader } from "./AgentStatusHeader";

interface RunControlPanelProps {
  activeRunStatus: string | null;
  displayedRunStatus: string | null;
  hasBlockingRun: boolean;
  realtimeLabel: string;
  realtimeStateClassName: string;
  runAction: "stop" | "takeover" | "resume" | null;
  runConstraints: string;
  runObjective: string;
  selectedSession: SessionRecord | null;
  onRunConstraintsChange(value: string): void;
  onRunObjectiveChange(value: string): void;
  onStartRun(event: React.FormEvent<HTMLFormElement>): void | Promise<void>;
  onStopRun(): void;
  onTakeoverRun(): void;
  onResumeRun(): void;
}

type AgentActionConfig = {
  kind: "start" | "stop" | "takeover" | "resume";
  label: string;
  tone: "primary" | "secondary";
  disabled: boolean;
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function getSessionModeLabel(
  selectedSession: SessionRecord | null,
  canRunImportedCliSession: boolean
): string {
  if (!selectedSession) {
    return "等待选择会话";
  }

  if (selectedSession.origin !== "imported_cli") {
    return "RelayDesk 托管运行";
  }

  return canRunImportedCliSession ? "叠加真实 CLI 会话" : "历史会话只读";
}

function getActionGuidance(input: {
  activeRunStatus: string | null;
  canRunImportedCliSession: boolean;
  hasBlockingRun: boolean;
  selectedSession: SessionRecord | null;
}): { title: string; description: string } {
  if (!input.selectedSession) {
    return {
      title: "先选中一条会话",
      description: "替身必须挂在明确的项目上下文上运行，先去协作页选择或创建会话。"
    };
  }

  if (input.selectedSession.origin === "imported_cli" && !input.canRunImportedCliSession) {
    return {
      title: "当前历史会话仍为只读",
      description: "这个 provider 目前只支持查看上下文。切换到可叠加的 Claude、Codex 或 Gemini 会话后再启动替身。"
    };
  }

  if (input.activeRunStatus === "running") {
    return {
      title: "运行中，优先决定是否介入",
      description: "可以立即停止，也可以人工接管，避免替身继续沿错误方向推进。"
    };
  }

  if (input.activeRunStatus === "waiting_human") {
    return {
      title: "流程正在等待人工决策",
      description: "审批已明确时适合直接接管；如果判断风险更高，也可以先停下这一轮。"
    };
  }

  if (input.activeRunStatus === "paused") {
    return {
      title: "已暂停，适合补充边界后再决定",
      description: "这时最适合修改目标或约束，再决定恢复替身还是直接结束本轮。"
    };
  }

  if (input.hasBlockingRun) {
    return {
      title: "当前已有进行中的替身",
      description: "先把当前这轮处理完，再开始新的目标，避免同一会话上出现冲突状态。"
    };
  }

  return {
    title: "目标和边界写清后即可启动",
    description: "目标描述结果，约束圈定边界。表达越短越具体，替身越不容易在执行中跑偏。"
  };
}

function buildActionList(input: {
  activeRunStatus: string | null;
  canRunImportedCliSession: boolean;
  hasBlockingRun: boolean;
  isImportedCliSession: boolean;
  runAction: "stop" | "takeover" | "resume" | null;
  selectedSession: SessionRecord | null;
}): AgentActionConfig[] {
  const canStart =
    !!input.selectedSession &&
    !input.hasBlockingRun &&
    (!input.isImportedCliSession || input.canRunImportedCliSession);
  const canStop =
    !!input.activeRunStatus &&
    ["running", "waiting_human", "paused"].includes(input.activeRunStatus) &&
    input.runAction === null;
  const canTakeover =
    !!input.activeRunStatus &&
    ["running", "waiting_human"].includes(input.activeRunStatus) &&
    input.runAction === null;
  const canResume = input.activeRunStatus === "paused" && input.runAction === null;

  if (!input.activeRunStatus || ["stopped", "completed", "failed", "draft"].includes(input.activeRunStatus)) {
    return [
      {
        kind: "start",
        label: "启动替身",
        tone: "primary",
        disabled: !canStart
      }
    ];
  }

  if (input.activeRunStatus === "running") {
    return [
      {
        kind: "stop",
        label: input.runAction === "stop" ? "停止中..." : "停止替身",
        tone: "primary",
        disabled: !canStop
      },
      {
        kind: "takeover",
        label: input.runAction === "takeover" ? "接管中..." : "人工接管",
        tone: "secondary",
        disabled: !canTakeover
      }
    ];
  }

  if (input.activeRunStatus === "waiting_human") {
    return [
      {
        kind: "takeover",
        label: input.runAction === "takeover" ? "接管中..." : "人工接管",
        tone: "primary",
        disabled: !canTakeover
      },
      {
        kind: "stop",
        label: input.runAction === "stop" ? "停止中..." : "停止替身",
        tone: "secondary",
        disabled: !canStop
      }
    ];
  }

  if (input.activeRunStatus === "paused") {
    return [
      {
        kind: "resume",
        label: input.runAction === "resume" ? "恢复中..." : "恢复替身",
        tone: "primary",
        disabled: !canResume
      },
      {
        kind: "stop",
        label: input.runAction === "stop" ? "停止中..." : "结束本轮",
        tone: "secondary",
        disabled: !canStop
      }
    ];
  }

  return [
    {
      kind: "start",
      label: "启动替身",
      tone: "primary",
      disabled: !canStart
    }
  ];
}

export function RunControlPanel({
  activeRunStatus,
  displayedRunStatus,
  hasBlockingRun,
  realtimeLabel,
  realtimeStateClassName,
  runAction,
  runConstraints,
  runObjective,
  selectedSession,
  onRunConstraintsChange,
  onRunObjectiveChange,
  onStartRun,
  onStopRun,
  onTakeoverRun,
  onResumeRun
}: RunControlPanelProps): JSX.Element {
  const isImportedCliSession = selectedSession?.origin === "imported_cli";
  const canRunImportedCliSession = getSessionCapabilities(selectedSession).canStartRuns;
  const actionGuidance = getActionGuidance({
    activeRunStatus,
    canRunImportedCliSession,
    hasBlockingRun,
    selectedSession
  });
  const actionList = buildActionList({
    activeRunStatus,
    canRunImportedCliSession,
    hasBlockingRun,
    isImportedCliSession,
    runAction,
    selectedSession
  });

  return (
    <section className="run-panel">
      <div className="agent-status-panel">
        <AgentStatusHeader
          activeRunStatus={activeRunStatus}
          displayedRunStatus={displayedRunStatus}
          realtimeLabel={realtimeLabel}
          realtimeStateClassName={realtimeStateClassName}
          selectedSession={selectedSession}
        />

        <div className="agent-summary-grid">
          <article className="agent-summary-card">
            <span className="agent-summary-label">当前会话</span>
            <strong>{selectedSession?.title ?? "未选择会话"}</strong>
            <p>
              {selectedSession
                ? `${selectedSession.provider} · ${
                    selectedSession.origin === "imported_cli" ? "CLI 历史会话" : "RelayDesk 会话"
                  }`
                : "先进入协作模块选择一条会话，替身才能挂接到正确上下文上。"}
            </p>
          </article>

          <article className="agent-summary-card">
            <span className="agent-summary-label">执行模式</span>
            <strong>{getSessionModeLabel(selectedSession, canRunImportedCliSession)}</strong>
            <p>
              {selectedSession
                ? isImportedCliSession
                  ? canRunImportedCliSession
                    ? "将直接叠加到真实 CLI 会话之上执行，保留原有上下文。"
                    : "当前 provider 还不能承载替身执行，只能查看历史内容。"
                  : "运行会由 RelayDesk 托管，状态和轨迹会集中记录在这页。"
                : "没有选中会话时，替身无法判断应该承接哪段工作。"}
            </p>
          </article>

          <article className="agent-summary-card">
            <span className="agent-summary-label">目标草稿</span>
            <strong>{runObjective.trim() ? truncateText(runObjective.trim(), 72) : "尚未填写本轮目标"}</strong>
            <p>
              {runConstraints.trim()
                ? `边界：${truncateText(runConstraints.trim(), 92)}`
                : "先把要达成的结果写清，再补充必要的边界和风险约束。"}
            </p>
          </article>
        </div>

        {isImportedCliSession ? (
          <div className="info-box agent-info-box">
            {canRunImportedCliSession
              ? "当前会话来自本机 CLI 历史记录。替身 Agent 现在会叠加到真实 CLI 会话之上执行。"
              : "当前会话来自本机 CLI 历史记录。这个 provider 暂时还不能承载替身运行。"}
          </div>
        ) : null}
      </div>

      <form className="run-form" onSubmit={onStartRun}>
        <div className="run-form-copy">
          <div className="eyebrow">执行编排</div>
          <h4>先写清这轮要推进到哪里，再把执行权交给替身</h4>
          <p className="muted">目标负责描述结果，约束负责圈定边界。保持短句、可执行、能判断是否完成。</p>
        </div>

        <label className="run-field">
          <span className="run-field-label">本轮目标</span>
          <span className="field-hint">一句话写清这轮要达成的结果，例如“拆解下一步开发任务并给出执行顺序”。</span>
          <textarea
            disabled={isImportedCliSession && !canRunImportedCliSession}
            onChange={(event) => onRunObjectiveChange(event.target.value)}
            placeholder="例如：梳理登录模块的下一步开发任务，并给出建议执行顺序"
            rows={4}
            value={runObjective}
          />
        </label>

        <label className="run-field">
          <div className="run-field-header">
            <span className="run-field-label">执行边界与约束</span>
            <span className="run-field-optional">可选</span>
          </div>
          <span className="field-hint">例如：保守推进、遇到风险操作停下、优先补测试、不要改动外部依赖。</span>
          <textarea
            disabled={isImportedCliSession && !canRunImportedCliSession}
            onChange={(event) => onRunConstraintsChange(event.target.value)}
            placeholder="例如：保持保守推进，遇到风险操作先等待人工介入"
            rows={3}
            value={runConstraints}
          />
        </label>

        <div className="run-action-bar">
          <div className="run-action-copy">
            <strong>{actionGuidance.title}</strong>
            <p className="muted">{actionGuidance.description}</p>
          </div>
          <div className="button-row run-action-buttons">
            {actionList.map((action) => {
              const className = action.tone === "primary" ? "primary-button" : "secondary-button";

              if (action.kind === "start") {
                return (
                  <button className={className} disabled={action.disabled} key={action.kind} type="submit">
                    {action.label}
                  </button>
                );
              }

              const onClick =
                action.kind === "stop"
                  ? onStopRun
                  : action.kind === "takeover"
                    ? onTakeoverRun
                    : onResumeRun;

              return (
                <button
                  className={className}
                  disabled={action.disabled}
                  key={action.kind}
                  onClick={onClick}
                  type="button"
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </section>
  );
}
