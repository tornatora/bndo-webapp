'use client';

type EmbeddedPaneViewProps = {
  src: string;
  title: string;
  stageClassName: string;
  frameClassName: string;
};

export function EmbeddedPaneView({ src, title, stageClassName, frameClassName }: EmbeddedPaneViewProps) {
  return (
    <div className={stageClassName}>
      <div className={frameClassName}>
        <iframe
          src={src}
          title={title}
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
