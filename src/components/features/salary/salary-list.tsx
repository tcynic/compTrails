"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, MapPin, Calendar, DollarSign } from "lucide-react";
import { useOptimizedPageState } from "@/hooks/useOptimizedPageState";
import { HistoryLoadingScreen } from "@/components/ui/HistoryLoadingScreen";
import { format } from "date-fns";
import { currencyOptions } from "@/lib/validations/salary";
import type { SalarySummary } from "@/hooks/useCompensationSummaries";

// Use the specific salary summary type
type SalaryRecord = SalarySummary;

interface SalaryListProps {
  onEdit?: (record: SalaryRecord) => void;
  onDelete?: (record: SalaryRecord) => void;
  refreshTrigger?: number;
}

export function SalaryList({
  onEdit,
  onDelete,
  refreshTrigger,
}: SalaryListProps) {
  // Use page loading state that respects global loading
  const {
    data: salariesData,
    showLoadingScreen,
    showSkeleton,
    refetch
  } = useOptimizedPageState('salary');
  
  // Cast to specific salary type since we know this hook filters for salary records
  const salaries = salariesData as SalarySummary[];

  // Handle external refresh trigger
  useEffect(() => {
    if (refreshTrigger) {
      refetch();
    }
  }, [refreshTrigger, refetch]);

  const formatCurrency = (amount: number, currency: string) => {
    const currencySymbol =
      currencyOptions.find((c) => c.value === currency)?.label || currency;
    return `${currencySymbol}${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM yyyy");
  };

  // Show global loading screen for initial load
  if (showLoadingScreen) {
    return (
      <HistoryLoadingScreen
        message="Loading your salary history..."
        stage="decrypting"
      />
    );
  }

  // Show individual loading for refreshes
  if (showSkeleton) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (salaries.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No salary records
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by adding your first salary record.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {salaries.map((salary) => {
        // Work directly with summary data - no need for decryptedData
        return (
          <Card key={salary.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {salary.title}
                  </CardTitle>
                  <CardDescription className="text-base font-medium text-gray-700">
                    {salary.company}
                  </CardDescription>
                </div>
              <div className="flex items-center space-x-2">
                {salary.isCurrentPosition && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    Current
                  </Badge>
                )}
                <div className="text-right">
                  <div className="text-lg font-semibold text-gray-900">
                    {formatCurrency(
                      salary.amount,
                      salary.currency
                    )}
                  </div>
                  <div className="text-sm text-gray-500">per year</div>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center text-gray-600">
                <MapPin className="h-4 w-4 mr-2" />
                Location: N/A
              </div>
              <div className="flex items-center text-gray-600">
                <Calendar className="h-4 w-4 mr-2" />
                {formatDate(salary.startDate)}
                {salary.endDate && (
                  <span> - {formatDate(salary.endDate)}</span>
                )}
              </div>
              <div className="flex items-center justify-end space-x-2">
                {onEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(salary)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(salary)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Notes not available in summary data - would need full record */}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
