'use client';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md';
}

export default function StarRating({ value, onChange, size = 'md' }: StarRatingProps) {
  const starClass = size === 'sm' ? 'text-base leading-none' : 'text-xl leading-none';
  const interactive = typeof onChange === 'function';

  return (
    <div className="inline-flex items-center gap-0.5" role={interactive ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map(star => {
        const filled = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(star)}
            className={`${starClass} transition-transform ${
              interactive ? 'hover:scale-110 cursor-pointer' : 'cursor-default'
            } ${filled ? 'text-amber-400' : 'text-gray-200'}`}
            aria-label={`${star}점`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
