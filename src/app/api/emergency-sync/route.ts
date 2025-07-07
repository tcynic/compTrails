import { NextRequest, NextResponse } from 'next/server';
import { api } from '../../../../convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { Id } from '../../../../convex/_generated/dataModel';

interface EmergencySyncItem {
  id: string;
  type: 'pending_sync' | 'offline_queue';
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  data?: any;
  tableName?: string;
}

interface EmergencySyncResponse {
  success: boolean;
  processed: number;
  failed: number;
  errors?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await request.json();
    const syncItems = body as EmergencySyncItem[];
    
    if (!Array.isArray(syncItems)) {
      return NextResponse.json(
        { error: 'Invalid request body - expected array of sync items' },
        { status: 400 }
      );
    }

    // Initialize Convex client
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      console.error('NEXT_PUBLIC_CONVEX_URL not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const client = new ConvexHttpClient(convexUrl);

    // Process each sync item
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`[Emergency Sync] Processing ${syncItems.length} items`);

    for (const item of syncItems) {
      try {
        console.log(`[Emergency Sync] Processing item ${item.id}: ${item.operation}`);
        
        await processEmergencySyncItem(client, item);
        processed++;
        
        console.log(`[Emergency Sync] Successfully processed item ${item.id}`);
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Item ${item.id}: ${errorMessage}`);
        
        console.error(`[Emergency Sync] Failed to process item ${item.id}:`, error);
      }
    }

    const response: EmergencySyncResponse = {
      success: failed === 0,
      processed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[Emergency Sync] Completed: ${processed} processed, ${failed} failed`);

    // Return 202 Accepted for async processing acknowledgment
    return NextResponse.json(response, { status: 202 });

  } catch (error) {
    console.error('[Emergency Sync] Request processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process emergency sync request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function processEmergencySyncItem(
  client: ConvexHttpClient,
  item: EmergencySyncItem
): Promise<void> {
  switch (item.operation) {
    case 'create':
      if (!item.data) {
        throw new Error('Missing data for create operation');
      }
      
      // Validate the data structure for create operations
      if (!item.data.userId || !item.data.type || !item.data.encryptedData || !item.data.currency) {
        throw new Error('Invalid data structure for create operation');
      }
      
      console.log(`[Emergency Sync] Creating compensation record of type: ${item.data.type}`);
      await client.mutation(api.compensationRecords.createCompensationRecord, item.data);
      break;
    
    case 'update':
      if (!item.data) {
        throw new Error('Missing data for update operation');
      }
      
      console.log(`[Emergency Sync] Updating compensation record: ${item.recordId}`);
      await client.mutation(api.compensationRecords.updateCompensationRecord, {
        id: item.recordId as Id<"compensationRecords">,
        ...item.data,
      });
      break;
    
    case 'delete':
      console.log(`[Emergency Sync] Deleting compensation record: ${item.recordId}`);
      await client.mutation(api.compensationRecords.deleteCompensationRecord, {
        id: item.recordId as Id<"compensationRecords">,
      });
      break;
    
    default:
      throw new Error(`Unknown operation: ${item.operation}`);
  }
}

// Handle OPTIONS for CORS if needed
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}