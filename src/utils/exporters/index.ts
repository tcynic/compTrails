export { CSVExporter } from './csvExporter';
export { JSONExporter } from './jsonExporter';
export type { ExportRecord, CSVExportOptions } from './csvExporter';
export type { JSONExportOptions, ExportMetadata, JSONExportData, ExportSchema } from './jsonExporter';

// Shared utility functions
export const exportUtils = {
  /**
   * Generate a filename with timestamp
   */
  generateFilename(prefix: string, extension: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${prefix}-${timestamp}.${extension}`;
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Estimate export file size
   */
  estimateExportSize(recordCount: number, format: 'csv' | 'json'): string {
    // Rough estimates based on average record sizes
    const avgRecordSizeCSV = 200; // bytes per record in CSV
    const avgRecordSizeJSON = 300; // bytes per record in JSON
    
    const estimatedBytes = recordCount * (format === 'csv' ? avgRecordSizeCSV : avgRecordSizeJSON);
    return this.formatFileSize(estimatedBytes);
  },

  /**
   * Validate date range
   */
  isValidDateRange(startDate: string, endDate: string): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start <= end;
  },

  /**
   * Get supported export formats
   */
  getSupportedFormats(): Array<{ value: string; label: string; description: string }> {
    return [
      {
        value: 'csv',
        label: 'CSV',
        description: 'Comma-separated values for spreadsheet applications'
      },
      {
        value: 'json',
        label: 'JSON',
        description: 'JavaScript Object Notation for data interchange'
      }
    ];
  }
};