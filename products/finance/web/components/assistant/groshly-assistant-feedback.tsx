import { CircleAlert, RotateCw, Square } from "lucide-react";

export function GroshlyAssistantProgress({
  text,
  waitingLabel,
  stopLabel,
  onStop,
}: {
  text: string;
  waitingLabel: string;
  stopLabel: string;
  onStop?: () => void;
}) {
  return (
    <div className="groshly-assistant-progress">
      {text ? (
        <div className="groshly-assistant-response bubble" translate="no">
          <span>{text}</span>
          {onStop && <span className="groshly-assistant-caret" aria-hidden />}
        </div>
      ) : (
        <div
          className="groshly-assistant-typing"
          role="status"
          aria-label={waitingLabel}
        >
          <span aria-hidden />
          <span aria-hidden />
          <span aria-hidden />
        </div>
      )}
      {text && onStop && (
        <button
          type="button"
          className="groshly-assistant-stop"
          onClick={onStop}
        >
          <Square size={13} aria-hidden />
          <span>{stopLabel}</span>
        </button>
      )}
    </div>
  );
}

export function GroshlyAssistantError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="groshly-assistant-error" role="alert">
      <CircleAlert size={19} aria-hidden />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            <RotateCw size={15} aria-hidden />
            <span>{retryLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
