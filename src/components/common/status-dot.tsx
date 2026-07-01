import { cn } from '@/lib/utils';

export type StatusColor = 'green' | 'yellow' | 'red' | 'gray';

const COLOR_MAP: Record<
  StatusColor,
  { dot: string; ring: string; text: string }
> = {
  green: {
    dot: 'bg-emerald-500',
    ring: 'shadow-[0_0_8px_rgba(16,185,129,0.55)]',
    text: 'text-emerald-400',
  },
  yellow: {
    dot: 'bg-amber-400',
    ring: 'shadow-[0_0_8px_rgba(251,191,36,0.55)]',
    text: 'text-amber-300',
  },
  red: {
    dot: 'bg-red-500',
    ring: 'shadow-[0_0_8px_rgba(239,68,68,0.55)]',
    text: 'text-red-400',
  },
  gray: {
    dot: 'bg-muted-foreground/60',
    ring: '',
    text: 'text-muted-foreground',
  },
};

interface StatusDotProps {
  color: StatusColor;
  label?: string;
  blink?: boolean;
  className?: string;
}

export function StatusDot({ color, label, blink, className }: StatusDotProps) {
  const c = COLOR_MAP[color];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'w-2 h-2 rounded-full',
          c.dot,
          c.ring,
          blink ? 'status-dot-blink' : 'status-dot-breath',
        )}
      />
      {label !== undefined && (
        <span className={cn('text-xs', c.text)}>{label}</span>
      )}
    </span>
  );
}
