// src/components/ResizeHandle.tsx
import { useRef } from 'react';

type Props = {
  onDrag: (dx: number) => void;     // horizontal delta
  onDragEnd?: () => void;
  'aria-label'?: string;
  thickness?: number;               // px, default 6
  hitArea?: number;                 // px, default 10 (for easier touch/mouse)
  style?: React.CSSProperties;      // additional styles (e.g., gridArea)
};

export default function ResizeHandle({
  onDrag,
  onDragEnd,
  thickness = 6,
  hitArea = 10,
  style,
  ...aria
}: Props) {
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);

  const endDrag = () => {
    dragging.current = false;
    startX.current = null;
    document.body.style.userSelect = '';
    onDragEnd?.();
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', endDrag);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.current || startX.current == null) return;
    onDrag(e.clientX - startX.current);
    startX.current = e.clientX;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!dragging.current || startX.current == null) return;
    onDrag(e.touches[0].clientX - startX.current);
    startX.current = e.touches[0].clientX;
  };

  const begin = (x: number) => {
    dragging.current = true;
    startX.current = x;
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', endDrag);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      {...aria}
      onMouseDown={(e) => begin(e.clientX)}
      onTouchStart={(e) => begin(e.touches[0].clientX)}
      style={{
        cursor: 'col-resize',
        // visual line
        width: thickness,
        background:
          'linear-gradient(90deg, transparent 0, rgba(0,0,0,0.08) 50%, transparent 100%)',
        // generous hit area (invisible overflow)
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -(hitArea - thickness) / 2,
          top: 0,
          bottom: 0,
          width: hitArea,
        }}
      />
    </div>
  );
}
