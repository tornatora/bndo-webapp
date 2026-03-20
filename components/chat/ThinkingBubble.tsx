import { memo } from 'react';
import './ThinkingBubble.css';

export const ThinkingBubble = memo(function ThinkingBubble() {
  return (
    <div className="thinking-row">
      <div className="thinking-text-only">
        Sto ragionando...
      </div>
    </div>
  );
});
