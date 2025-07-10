import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

// Create a new notification
export const createNotification = mutation({
  args: {
    userId: v.string(),
    type: v.union(
      v.literal('vesting_reminder_30d'),
      v.literal('vesting_reminder_7d'),
      v.literal('vesting_reminder_1d'),
      v.literal('vesting_occurred'),
      v.literal('fmv_updated'),
      v.literal('system_alert')
    ),
    title: v.string(),
    message: v.string(),
    scheduledFor: v.number(),
    deliveryMethods: v.array(v.union(v.literal('email'), v.literal('in_app'), v.literal('push'))),
    relatedEntityId: v.optional(v.string()),
    relatedEntityType: v.optional(v.union(v.literal('vesting_event'), v.literal('equity_grant'), v.literal('fmv_update'))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert('notifications', {
      ...args,
      status: 'pending' as const,
      attempts: 0,
      emailSent: false,
      inAppSent: false,
      pushSent: false,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update notification status
export const updateNotificationStatus = mutation({
  args: {
    id: v.id('notifications'),
    status: v.union(v.literal('pending'), v.literal('sent'), v.literal('failed'), v.literal('cancelled')),
    emailSent: v.optional(v.boolean()),
    inAppSent: v.optional(v.boolean()),
    pushSent: v.optional(v.boolean()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();
    
    const updateData: any = {
      ...updates,
      lastAttemptAt: now,
      updatedAt: now,
    };
    
    // If marking as sent, set sentAt timestamp
    if (updates.status === 'sent') {
      updateData.sentAt = now;
    }
    
    // Increment attempts counter
    const existing = await ctx.db.get(id);
    if (existing) {
      updateData.attempts = existing.attempts + 1;
      
      // Increment retry count if failed
      if (updates.status === 'failed') {
        updateData.retryCount = existing.retryCount + 1;
      }
    }
    
    return await ctx.db.patch(id, updateData);
  },
});

// Get notifications for a user
export const getNotificationsByUser = query({
  args: {
    userId: v.string(),
    status: v.optional(v.union(v.literal('pending'), v.literal('sent'), v.literal('failed'), v.literal('cancelled'))),
    type: v.optional(v.union(
      v.literal('vesting_reminder_30d'),
      v.literal('vesting_reminder_7d'),
      v.literal('vesting_reminder_1d'),
      v.literal('vesting_occurred'),
      v.literal('fmv_updated'),
      v.literal('system_alert')
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('notifications')
      .withIndex('by_user', (q) => q.eq('userId', args.userId));
    
    if (args.status) {
      query = query.filter((q) => q.eq(q.field('status'), args.status!));
    }
    
    if (args.type) {
      query = query.filter((q) => q.eq(q.field('type'), args.type!));
    }
    
    const results = await query
      .order('desc')
      .collect();
    
    return args.limit ? results.slice(0, args.limit) : results;
  },
});

// Get pending notifications that are ready to be sent
export const getPendingNotifications = query({
  args: {
    maxScheduledTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxTime = args.maxScheduledTime || Date.now();
    
    const results = await ctx.db
      .query('notifications')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .filter((q) => q.lte(q.field('scheduledFor'), maxTime))
      .order('asc') // Process older notifications first
      .collect();
    
    return args.limit ? results.slice(0, args.limit) : results;
  },
});

// Internal mutation to process pending notifications (called by cron job)
export const processPendingNotifications = internalMutation({
  handler: async (ctx) => {
    console.log('Processing pending notifications...');
    
    const startTime = Date.now();
    let processedCount = 0;
    let errors: string[] = [];
    
    try {
      // Get all pending notifications that are scheduled to be sent
      const pendingNotifications = await ctx.db
        .query('notifications')
        .withIndex('by_status', (q) => q.eq('status', 'pending'))
        .filter((q) => q.lte(q.field('scheduledFor'), Date.now()))
        .collect();
      
      console.log(`Found ${pendingNotifications.length} pending notifications to process`);
      
      for (const notification of pendingNotifications) {
        try {
          // Check if notification has exceeded max retry count
          if (notification.retryCount >= 3) {
            await ctx.db.patch(notification._id, {
              status: 'failed' as const,
              errorMessage: 'Maximum retry count exceeded',
              updatedAt: Date.now(),
            });
            continue;
          }
          
          // Get user preferences to check if notifications are enabled
          const userPrefs = await ctx.db
            .query('userPreferences')
            .withIndex('by_user', (q) => q.eq('userId', notification.userId))
            .first();
          
          let shouldSend = true;
          
          // Check notification preferences
          if (userPrefs) {
            const { notificationSettings } = userPrefs;
            
            switch (notification.type) {
              case 'vesting_reminder_30d':
              case 'vesting_reminder_7d':
              case 'vesting_reminder_1d':
                shouldSend = notificationSettings.vestingReminders.enabled;
                break;
              case 'fmv_updated':
                shouldSend = notificationSettings.fmvUpdates.enabled;
                break;
              case 'system_alert':
                shouldSend = notificationSettings.systemAlerts.enabled;
                break;
              default:
                shouldSend = true; // Default to sending if type not matched
            }
          }
          
          if (!shouldSend) {
            // Mark as cancelled if user has disabled this type of notification
            await ctx.db.patch(notification._id, {
              status: 'cancelled' as const,
              errorMessage: 'User has disabled this notification type',
              updatedAt: Date.now(),
            });
            continue;
          }
          
          // Process each delivery method
          let emailSuccess = false;
          let inAppSuccess = false;
          let pushSuccess = false;
          
          for (const method of notification.deliveryMethods) {
            try {
              switch (method) {
                case 'email':
                  // TODO: Implement email sending logic
                  emailSuccess = await sendEmailNotification(notification);
                  break;
                case 'in_app':
                  // TODO: Implement in-app notification logic
                  inAppSuccess = await sendInAppNotification(notification);
                  break;
                case 'push':
                  // TODO: Implement push notification logic
                  pushSuccess = await sendPushNotification(notification);
                  break;
              }
            } catch (methodError) {
              console.error(`Error sending ${method} notification:`, methodError);
            }
          }
          
          // Update notification status based on delivery results
          const allMethodsSuccessful = 
            (!notification.deliveryMethods.includes('email') || emailSuccess) &&
            (!notification.deliveryMethods.includes('in_app') || inAppSuccess) &&
            (!notification.deliveryMethods.includes('push') || pushSuccess);
          
          await ctx.db.patch(notification._id, {
            status: allMethodsSuccessful ? 'sent' as const : 'failed' as const,
            emailSent: emailSuccess,
            inAppSent: inAppSuccess,
            pushSent: pushSuccess,
            sentAt: allMethodsSuccessful ? Date.now() : undefined,
            lastAttemptAt: Date.now(),
            attempts: notification.attempts + 1,
            retryCount: allMethodsSuccessful ? notification.retryCount : notification.retryCount + 1,
            updatedAt: Date.now(),
            errorMessage: allMethodsSuccessful ? undefined : 'One or more delivery methods failed',
          });
          
          processedCount++;
          
        } catch (notificationError) {
          const errorMsg = `Error processing notification ${notification._id}: ${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
          
          // Mark notification as failed
          await ctx.db.patch(notification._id, {
            status: 'failed' as const,
            errorMessage: errorMsg,
            lastAttemptAt: Date.now(),
            attempts: notification.attempts + 1,
            retryCount: notification.retryCount + 1,
            updatedAt: Date.now(),
          });
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Notification processing completed. Processed ${processedCount} notifications in ${duration}ms`);
      
      return {
        success: true,
        timestamp: endTime,
        message: `Processed ${processedCount} notifications`,
        recordsProcessed: processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          totalPending: pendingNotifications.length,
          errorsCount: errors.length,
        },
      };
      
    } catch (error) {
      const errorMsg = `Fatal error in notification processing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        timestamp: Date.now(),
        message: errorMsg,
        recordsProcessed: processedCount,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Helper functions for different notification delivery methods
async function sendEmailNotification(notification: any): Promise<boolean> {
  // TODO: Implement email sending via Resend/SendGrid
  console.log(`Sending email notification: ${notification.title}`);
  return true; // Mock success for now
}

async function sendInAppNotification(notification: any): Promise<boolean> {
  // TODO: Implement in-app notification via real-time updates
  console.log(`Sending in-app notification: ${notification.title}`);
  return true; // Mock success for now
}

async function sendPushNotification(notification: any): Promise<boolean> {
  // TODO: Implement push notification via web push API
  console.log(`Sending push notification: ${notification.title}`);
  return true; // Mock success for now
}

// Get notification statistics
export const getNotificationStats = query({
  args: {
    userId: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let notifications;
    
    if (args.userId) {
      notifications = await ctx.db
        .query('notifications')
        .withIndex('by_user', (q: any) => q.eq('userId', args.userId))
        .collect();
    } else {
      notifications = await ctx.db.query('notifications').collect();
    }
    
    // Filter by date range if provided
    if (args.startDate && args.endDate) {
      notifications = notifications.filter(n => 
        n.createdAt >= args.startDate! && n.createdAt <= args.endDate!
      );
    }
    
    // Calculate statistics
    const total = notifications.length;
    const sent = notifications.filter(n => n.status === 'sent').length;
    const pending = notifications.filter(n => n.status === 'pending').length;
    const failed = notifications.filter(n => n.status === 'failed').length;
    const cancelled = notifications.filter(n => n.status === 'cancelled').length;
    
    // Group by type
    const byType = notifications.reduce((acc, notification) => {
      if (!acc[notification.type]) {
        acc[notification.type] = { total: 0, sent: 0, failed: 0 };
      }
      acc[notification.type].total += 1;
      if (notification.status === 'sent') acc[notification.type].sent += 1;
      if (notification.status === 'failed') acc[notification.type].failed += 1;
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate delivery method success rates
    const deliveryStats = {
      email: {
        attempted: notifications.filter(n => n.deliveryMethods.includes('email')).length,
        successful: notifications.filter(n => n.emailSent).length,
      },
      inApp: {
        attempted: notifications.filter(n => n.deliveryMethods.includes('in_app')).length,
        successful: notifications.filter(n => n.inAppSent).length,
      },
      push: {
        attempted: notifications.filter(n => n.deliveryMethods.includes('push')).length,
        successful: notifications.filter(n => n.pushSent).length,
      },
    };
    
    return {
      total,
      sent,
      pending,
      failed,
      cancelled,
      successRate: total > 0 ? (sent / total) * 100 : 0,
      byType,
      deliveryStats,
    };
  },
});

// Delete old notifications (cleanup)
export const deleteOldNotifications = mutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoffDate = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldNotifications = await ctx.db
      .query('notifications')
      .filter((q) => q.lt(q.field('createdAt'), cutoffDate))
      .collect();
    
    const deletePromises = oldNotifications.map(notification => 
      ctx.db.delete(notification._id)
    );
    
    await Promise.all(deletePromises);
    
    return {
      deletedCount: oldNotifications.length,
      cutoffDate,
    };
  },
});