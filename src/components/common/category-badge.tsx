import { cn } from '@/lib/utils';
import type { AccountCategory } from '@/lib/types';

const COLOR_MAP: Record<AccountCategory, string> = {
  科技: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  民生: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  养生: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  副业: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  本地: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  三农: 'bg-lime-500/15 text-lime-300 border-lime-500/25',
  情感: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
};

export function CategoryBadge({
  category,
  className,
}: {
  category: AccountCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] border',
        COLOR_MAP[category],
        className,
      )}
    >
      {category}
    </span>
  );
}
