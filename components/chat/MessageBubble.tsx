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
        {body !== undefined ? <div>{renderMessageBody(body)}</div> : null}
        {children}
      </div>
      {footer ? <div className="msg-footer">{footer}</div> : null}
    </div>
  );
});

function renderMessageBody(body: string) {
  const lines = body.split('\n');
  return lines.map((line, index) => (
    <div key={`line-${index}`}>{renderInlineBold(line)}</div>
  ));
}

function renderInlineBold(text: string) {
  const tokens = text.split(/(\*\*[^*]+\*\*)/g);
  return tokens.map((token, index) => {
    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={`bold-${index}`}>{boldMatch[1]}</strong>;
    }
    return <span key={`text-${index}`}>{token}</span>;
  });
}
