import { useId, useMemo, useState, type ReactElement } from "react";
import { rootClass, useNotifyClient, useNotifyContext, type NotifyInboxItem, type NotifyTheme } from "./provider.js";
import { fill, notifyStrings } from "./strings.js";

/** The `approval` an approval-request inbox item carries in `data` (ProductCraft Notify approval types). */
export interface NotifyApprovalData {
  id: string;
  title?: string;
  body?: string | null;
  status?: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  requester?: { kind?: string; name?: string } | null;
  expires_at?: string;
  reason_policy?: "optional" | "required_on_reject" | "required";
  decided_by?: string | null;
  reason?: string | null;
}

/** The approval request an inbox item carries, or null for an ordinary item. */
export function approvalOf(item: Pick<NotifyInboxItem, "data">): NotifyApprovalData | null {
  const a = (item.data as { approval?: unknown } | null | undefined)?.approval as NotifyApprovalData | undefined;
  return a && typeof a.id === "string" ? a : null;
}

export interface NotifyApprovalProps {
  /** An inbox item of an approval type (from `useInbox` or `<NotifyInbox>`). */
  item: NotifyInboxItem;
  /** Called with the request after this person answered. */
  onDecided?: (approval: { id: string; status: string }) => void;
  /** Extra class on the root element. */
  className?: string;
  /** Pins the colour scheme; default: the provider's `theme`. */
  theme?: NotifyTheme;
}

/**
 * An approval request in the inbox: who asks, what, and Approve / Reject with an optional (or required)
 * reason. The first answer of any approver decides; afterwards it shows the outcome. Answers go through
 * the client API with the recipient token (`client.approvals.decide`), and the requester gets the signed
 * `approval.resolved` webhook. `<NotifyInbox>` renders approval items with this component on its own.
 */
export function NotifyApproval(props: NotifyApprovalProps): ReactElement | null {
  const { item, onDecided, className } = props;
  const { locale, strings: overrides, theme } = useNotifyContext("<NotifyApproval>");
  const client = useNotifyClient();
  const t = useMemo(() => notifyStrings(locale, overrides), [locale, overrides]);
  const a = approvalOf(item);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<{ status: string; reason: string | null } | null>(null);
  const reasonId = useId();
  if (!a) return null;

  const status = decided?.status ?? a.status ?? "pending";
  const expired = status === "pending" && a.expires_at !== undefined && Date.parse(a.expires_at) <= Date.now();
  const policy = a.reason_policy ?? "optional";
  const decide = async (decision: "approve" | "reject"): Promise<void> => {
    const r = reason.trim();
    if (policy === "required" || (policy === "required_on_reject" && decision === "reject")) {
      if (!r) return setError(t.approvalReasonRequired);
    }
    setBusy(decision);
    setError(null);
    try {
      const out = await client.approvals.decide(a.id, decision, r || undefined);
      setDecided({ status: out.status, reason: out.reason ?? null });
      onDecided?.({ id: out.id, status: out.status });
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(code === "APPROVAL_NOT_PENDING" ? t.approvalAlreadyDecided : t.approvalError);
    } finally {
      setBusy(null);
    }
  };

  const outcome: Record<string, string> = { approved: t.approvalApproved, rejected: t.approvalRejected, expired: t.approvalExpired, cancelled: t.approvalCancelled };
  return (
    <div className={rootClass("pcn-approval", props.theme ?? theme, className)} data-status={expired ? "expired" : status}>
      {a.requester?.name && (
        <p className="pcn-approval-requester">
          {fill(a.requester.kind === "agent" ? t.approvalRequestedByAgent : t.approvalRequestedBy, { name: a.requester.name })}
        </p>
      )}
      {status === "pending" && !expired ? (
        <>
          <label className="pcn-approval-reason-label" htmlFor={reasonId}>
            {policy === "optional" ? t.approvalReasonOptional : t.approvalReason}
          </label>
          <textarea id={reasonId} className="pcn-approval-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="pcn-actions">
            <button type="button" className="pcn-action pcn-action-primary" disabled={busy !== null} onClick={() => void decide("approve")}>
              {busy === "approve" ? t.approvalSending : t.approvalApprove}
            </button>
            <button type="button" className="pcn-action" disabled={busy !== null} onClick={() => void decide("reject")}>
              {busy === "reject" ? t.approvalSending : t.approvalReject}
            </button>
          </div>
          {error && (
            <p className="pcn-approval-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="pcn-approval-outcome" role="status">
          {expired ? t.approvalExpired : (outcome[status] ?? status)}
          {status !== "expired" && status !== "cancelled" && (decided || a.decided_by) ? ` · ${decided ? t.approvalByYou : a.decided_by}` : ""}
          {(decided?.reason ?? a.reason) ? ` · “${decided?.reason ?? a.reason}”` : ""}
        </p>
      )}
    </div>
  );
}
