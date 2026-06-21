import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'full' | 'mark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

const sizes = {
  sm: { mark: 28, full: { w: 120, h: 28 } },
  md: { mark: 36, full: { w: 140, h: 34 } },
  lg: { mark: 44, full: { w: 180, h: 44 } },
};

export default function Logo({ variant = 'full', size = 'md', className, showText = true }: LogoProps) {
  if (variant === 'mark' || !showText) {
    const dim = sizes[size].mark;
    return (
      <Image
        src="/branding/logo-mark.svg"
        alt="KluConnect"
        width={dim}
        height={dim}
        className={cn('shrink-0', className)}
        priority
      />
    );
  }

  const { w, h } = sizes[size].full;
  return (
    <Image
      src="/branding/logo.svg"
      alt="KluConnect"
      width={w}
      height={h}
      className={cn('shrink-0', className)}
      priority
    />
  );
}
