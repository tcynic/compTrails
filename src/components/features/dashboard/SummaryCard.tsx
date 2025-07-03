'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReactNode } from 'react';

interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function SummaryCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  action,
  isLoading = false,
  isEmpty = false,
  emptyMessage,
  className = '',
}: SummaryCardProps) {
  if (isLoading) {
    return (
      <Card className={`animate-pulse ${className}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            {icon && <div className="h-5 w-5 bg-gray-200 rounded"></div>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-8 bg-gray-200 rounded w-32"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className={`border-dashed border-2 ${className}`}>
        <CardContent className="text-center py-8">
          {icon && <div className="mx-auto mb-3 text-gray-400">{icon}</div>}
          <p className="text-gray-500 text-sm mb-3">
            {emptyMessage || 'No data available'}
          </p>
          {action && (
            <Button size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-600">
            {title}
          </CardTitle>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-2xl font-bold">
            {formatValue(value)}
          </div>
          
          {subtitle && (
            <p className="text-sm text-gray-600">
              {subtitle}
            </p>
          )}
          
          {trend && (
            <div className="flex items-center space-x-1">
              <span className={`text-sm font-medium ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
              <span className="text-sm text-gray-500">
                {trend.label}
              </span>
            </div>
          )}
          
          {action && (
            <div className="pt-2">
              <Button size="sm" variant="outline" onClick={action.onClick}>
                {action.label}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}