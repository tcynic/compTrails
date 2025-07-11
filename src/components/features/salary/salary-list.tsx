"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useSecurePassword } from "@/hooks/usePassword";
import { LocalStorageService } from "@/services/localStorageService";
import { EncryptionService } from "@/services/encryptionService";
import { format } from "date-fns";
import type { CompensationRecord, DecryptedSalaryData } from "@/lib/db/types";
import { currencyOptions } from "@/lib/validations/salary";

interface DecryptedSalaryRecord extends CompensationRecord {
  decryptedData: DecryptedSalaryData;
}

interface SalaryListProps {
  onEdit?: (record: DecryptedSalaryRecord) => void;
  onDelete?: (record: DecryptedSalaryRecord) => void;
  refreshTrigger?: number;
}

export function SalaryList({
  onEdit,
  onDelete,
  refreshTrigger,
}: SalaryListProps) {
  const [salaries, setSalaries] = useState<DecryptedSalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const password = useSecurePassword();

  const loadSalaries = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const records = await LocalStorageService.getCompensationRecords(
        user.id,
        "salary"
      );

      // Get user's master password from secure context
      if (!password) {
        console.warn("Password not available, cannot decrypt data");
        return;
      }

      // Use batch decryption for better performance
      console.time('[SalaryList] Batch decryption');
      const encryptedDataArray = records.map(record => record.encryptedData);
      const decryptResults = await EncryptionService.batchDecryptData(
        encryptedDataArray,
        password
      );
      console.timeEnd('[SalaryList] Batch decryption');

      const decryptedRecords = records.map((record, index) => {
        const decryptResult = decryptResults[index];
        if (decryptResult.success) {
          try {
            const decryptedData = JSON.parse(
              decryptResult.data
            ) as DecryptedSalaryData;
            return { ...record, decryptedData };
          } catch (error) {
            console.error("Error parsing decrypted salary data:", error);
            return null;
          }
        } else {
          console.error(
            "Error decrypting salary record:",
            decryptResult.error
          );
          return null;
        }
      });

      // Sort salaries by start date (newest to oldest)
      const sortedSalaries = (
        decryptedRecords.filter(Boolean) as DecryptedSalaryRecord[]
      ).sort((a, b) => {
        const dateA = new Date(a.decryptedData.startDate);
        const dateB = new Date(b.decryptedData.startDate);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });

      setSalaries(sortedSalaries);
    } catch (error) {
      console.error("Error loading salaries:", error);
    } finally {
      setLoading(false);
    }
  }, [user, password]);

  useEffect(() => {
    loadSalaries();
  }, [user, refreshTrigger, loadSalaries]);

  const formatCurrency = (amount: number, currency: string) => {
    const currencySymbol =
      currencyOptions.find((c) => c.value === currency)?.label || currency;
    return `${currencySymbol}${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM yyyy");
  };

  if (loading) {
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
      {salaries.map((salary) => (
        <Card key={salary.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">
                  {salary.decryptedData.title}
                </CardTitle>
                <CardDescription className="text-base font-medium text-gray-700">
                  {salary.decryptedData.company}
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                {salary.decryptedData.isCurrentPosition && (
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
                      salary.decryptedData.amount,
                      salary.decryptedData.currency
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
                {salary.decryptedData.location}
              </div>
              <div className="flex items-center text-gray-600">
                <Calendar className="h-4 w-4 mr-2" />
                {formatDate(salary.decryptedData.startDate)}
                {salary.decryptedData.endDate && (
                  <span> - {formatDate(salary.decryptedData.endDate)}</span>
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

            {salary.decryptedData.notes && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  {salary.decryptedData.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
