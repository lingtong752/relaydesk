import type { ApprovalRecord } from "@shared";
import { SectionHeader } from "../../../shared/ui/SectionHeader";

interface ApprovalQueueProps {
  approvalActionId: string | null;
  approvals: ApprovalRecord[];
  onApprove(approvalId: string): void;
  onReject(approvalId: string): void;
}

export function ApprovalQueue({
  approvalActionId,
  approvals,
  onApprove,
  onReject
}: ApprovalQueueProps): JSX.Element | null {
  if (approvals.length === 0) {
    return null;
  }

  return (
    <section className="approval-panel">
      <SectionHeader
        actions={<span className="muted">{approvals.length} 项</span>}
        description="这些动作已经把流程卡在等待人工决策的节点上，建议优先处理。"
        eyebrow="审批队列"
        title="待处理审批"
      />
      <div className="approval-list">
        {approvals.map((approval) => (
          <article className="approval-card" key={approval.id}>
            <div className="approval-card-top">
              <div className="approval-card-copy">
                <span className="approval-badge">待人工确认</span>
                <strong>{approval.title}</strong>
              </div>
              <span className="muted">{new Date(approval.createdAt).toLocaleTimeString()}</span>
            </div>
            <p>{approval.reason}</p>
            <div className="button-row approval-actions">
              <button
                className="primary-button compact"
                disabled={approvalActionId === approval.id}
                onClick={() => onApprove(approval.id)}
                type="button"
              >
                批准继续
              </button>
              <button
                className="secondary-button compact"
                disabled={approvalActionId === approval.id}
                onClick={() => onReject(approval.id)}
                type="button"
              >
                拒绝并停止
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
