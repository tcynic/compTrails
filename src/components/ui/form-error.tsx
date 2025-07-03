import { forwardRef, type HTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormErrorProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const FormError = forwardRef<HTMLDivElement, FormErrorProps>(
  ({ className, message, ...props }, ref) => {
    if (!message) return null;

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-2 text-sm text-red-600',
          className
        )}
        {...props}
      >
        <AlertCircle className="h-4 w-4" />
        <span>{message}</span>
      </div>
    );
  }
);
FormError.displayName = 'FormError';

export { FormError };