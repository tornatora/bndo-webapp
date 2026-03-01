'use client';

export type ChatRole = 'user' | 'assistant';

export function MessageBubble({
  role,
  body,
  footer,
  children
}: {
  role: ChatRole;
  body?: string;
  footer?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`msg-row ${role}`}>
      <div className="msg-bubble">
        {body ? <div>{body}</div> : null}
        {children}
      </div>
      {footer ? <div className="msg-footer">{footer}</div> : null}
    </div>
  );
}
