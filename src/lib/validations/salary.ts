import { z } from "zod";
import { LocalStorageService } from "@/services/localStorageService";
import { EncryptionService } from "@/services/encryptionService";
import type { DecryptedSalaryData } from "@/lib/db/types";

export const salarySchema = z
  .object({
    company: z.string().min(1, "Company is required"),
    title: z.string().min(1, "Job title is required"),
    location: z.string().min(1, "Location is required"),
    amount: z.number().min(0, "Amount must be positive"),
    currency: z.string().min(1, "Currency is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().optional(),
    isCurrentPosition: z.boolean(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      // If this is the current position, endDate should not be provided
      if (
        data.isCurrentPosition &&
        data.endDate &&
        data.endDate.trim() !== ""
      ) {
        return false;
      }
      // If this is not the current position, endDate should be provided
      if (
        !data.isCurrentPosition &&
        (!data.endDate || data.endDate.trim() === "")
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Current positions cannot have an end date, and non-current positions must have an end date",
      path: ["endDate"],
    }
  );

export type SalaryFormData = z.infer<typeof salarySchema>;

export const currencyOptions = [
  { value: "USD", label: "$" },
  { value: "EUR", label: "€" },
  { value: "GBP", label: "£" },
  { value: "CAD", label: "C$" },
  { value: "AUD", label: "A$" },
  { value: "JPY", label: "¥" },
  { value: "CHF", label: "CHF" },
  { value: "SEK", label: "SEK" },
  { value: "NOK", label: "NOK" },
  { value: "DKK", label: "DKK" },
];

/**
 * Validates that only one salary can be set as current (without end date)
 * Returns the ID of the previous current salary if found (for automatic end date setting)
 */
export async function validateCurrentSalaryConstraint(
  userId: string,
  isCurrentPosition: boolean,
  password: string,
  editingRecordId?: number
): Promise<{ 
  isValid: boolean; 
  message?: string; 
  previousCurrentSalaryId?: number;
  previousCurrentSalaryData?: DecryptedSalaryData;
}> {
  if (!isCurrentPosition) {
    return { isValid: true };
  }

  try {
    // Get all salary records for the user
    const salaryRecords = await LocalStorageService.getCompensationRecords(
      userId,
      "salary"
    );

    // Decrypt and check each salary record
    for (const record of salaryRecords) {
      // Skip the record we're currently editing
      if (editingRecordId && record.id === editingRecordId) {
        continue;
      }

      try {
        const decryptionResult = await EncryptionService.decryptData(
          record.encryptedData,
          password
        );
        if (!decryptionResult.success) {
          continue; // Skip records that can't be decrypted
        }
        const decryptedData: DecryptedSalaryData = JSON.parse(
          decryptionResult.data
        );

        // Check if this salary is current (no end date and isCurrentPosition is true)
        if (
          decryptedData.isCurrentPosition &&
          (!decryptedData.endDate || decryptedData.endDate.trim() === "")
        ) {
          // Return the previous current salary for automatic end date setting
          return {
            isValid: true,
            previousCurrentSalaryId: record.id!,
            previousCurrentSalaryData: decryptedData,
          };
        }
      } catch (decryptionError) {
        // Skip records that can't be decrypted (might be corrupted or use different password)
        console.warn(
          "Could not decrypt salary record for validation:",
          decryptionError
        );
        continue;
      }
    }

    return { isValid: true };
  } catch (error) {
    console.error("Error validating current salary constraint:", error);
    // In case of error, allow the operation to proceed to avoid blocking the user
    return { isValid: true };
  }
}
