import { memo } from 'react';

export type ChatRole = 'user' | 'assistant';

export const MessageBubble = memo(function MessageBubble({
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
        {body !== undefined ? <div>{body}</div> : null}
        {children}
      </div>
      {footer ? <div className="msg-footer">{footer}</div> : null}
    </div>
  );
});
