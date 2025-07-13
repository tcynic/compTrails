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
import { usePageLoadingState } from "@/hooks/useGlobalLoadingState";
import { HistoryLoadingScreen } from "@/components/ui/HistoryLoadingScreen";
import { format } from "date-fns";
import { currencyOptions } from "@/lib/validations/salary";
import type { DecryptedSalaryData } from "@/lib/db/types";

// Use the type from the hook which already includes decryptedData
type SalaryRecord = ReturnType<typeof usePageLoadingState>['data'][0];

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
    data: salaries,
    showGlobalLoading,
    showIndividualLoading,
    refetch
  } = usePageLoadingState('salary');

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
  if (showGlobalLoading) {
    return (
      <HistoryLoadingScreen
        message="Loading your salary history..."
        stage="decrypting"
      />
    );
  }

  // Show individual loading for refreshes
  if (showIndividualLoading) {
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
        // Type assertion since we know these are salary records from useSalaryData
        const salaryData = salary.decryptedData as DecryptedSalaryData;
        return (
          <Card key={salary.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">
                    {salaryData.title}
                  </CardTitle>
                  <CardDescription className="text-base font-medium text-gray-700">
                    {salaryData.company}
                  </CardDescription>
                </div>
              <div className="flex items-center space-x-2">
                {salaryData.isCurrentPosition && (
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
                      salaryData.amount,
                      salaryData.currency
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
                {salaryData.location}
              </div>
              <div className="flex items-center text-gray-600">
                <Calendar className="h-4 w-4 mr-2" />
                {formatDate(salaryData.startDate)}
                {salaryData.endDate && (
                  <span> - {formatDate(salaryData.endDate)}</span>
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

            {salaryData.notes && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  {salaryData.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        );
      })}
    </div>
  );
}
