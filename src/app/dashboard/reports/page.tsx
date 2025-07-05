'use client';

import { DashboardLayout } from '@/components/layouts/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  TrendingUp, 
  Calendar,
  DollarSign,
  Building2
} from 'lucide-react';

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Reports</h1>
            <p className="text-gray-600">Generate and export compensation reports</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Export All
            </Button>
          </div>
        </div>

        {/* Available Reports */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Compensation Summary */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Compensation Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Complete overview of all compensation including salary, bonuses, and equity
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">PDF & Excel</Badge>
                <Button size="sm" variant="outline">Generate</Button>
              </div>
            </CardContent>
          </Card>

          {/* Year-over-Year Analysis */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Year-over-Year Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Compare compensation growth across different years and positions
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">PDF & Excel</Badge>
                <Button size="sm" variant="outline">Generate</Button>
              </div>
            </CardContent>
          </Card>

          {/* Company Comparison */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Compare compensation packages across different companies
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">PDF & Excel</Badge>
                <Button size="sm" variant="outline">Generate</Button>
              </div>
            </CardContent>
          </Card>

          {/* Equity Vesting Schedule */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Equity Vesting Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Detailed timeline of equity vesting dates and expected values
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">PDF & Excel</Badge>
                <Button size="sm" variant="outline">Generate</Button>
              </div>
            </CardContent>
          </Card>

          {/* Tax Planning Report */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Tax Planning Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Compensation breakdown for tax planning and preparation
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="secondary">PDF & Excel</Badge>
                <Button size="sm" variant="outline">Generate</Button>
              </div>
            </CardContent>
          </Card>

          {/* Custom Report */}
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Custom Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Create a custom report with specific date ranges and criteria
              </p>
              <div className="flex justify-between items-center">
                <Badge variant="outline">Coming Soon</Badge>
                <Button size="sm" variant="outline" disabled>Create</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Reports */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">No reports generated yet</p>
              <p className="text-sm">Start by generating your first compensation report above.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}