import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

// Internal mutation to create vesting reminder notifications
export const createVestingReminderNotifications = internalMutation({
  handler: async (ctx) => {
    console.log('Creating vesting reminder notifications...');
    
    const startTime = Date.now();
    let notificationsCreated = 0;
    let errors: string[] = [];
    
    try {
      // Get current date and calculate reminder dates
      const now = Date.now();
      const reminderDays = [30, 7, 1];
      
      for (const days of reminderDays) {
        const targetDate = now + (days * 24 * 60 * 60 * 1000);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        // Find vesting events that occur in 'days' days
        const vestingEvents = await ctx.db
          .query('vestingEvents')
          .withIndex('by_vesting_date', (q) => 
            q.gte('vestingDate', startOfDay.getTime())
             .lte('vestingDate', endOfDay.getTime())
          )
          .filter((q) => q.eq(q.field('processed'), false))
          .collect();
        
        console.log(`Found ${vestingEvents.length} vesting events in ${days} days`);
        
        for (const event of vestingEvents) {
          try {
            // Check if notification already exists for this event and reminder period
            const existingNotification = await ctx.db
              .query('notifications')
              .withIndex('by_user', (q) => q.eq('userId', event.userId))
              .filter((q) => 
                q.eq(q.field('relatedEntityId'), event._id) &&
                q.eq(q.field('type'), getReminderNotificationType(days))
              )
              .first();
            
            if (existingNotification) {
              console.log(`Notification already exists for event ${event._id}, reminder ${days} days`);
              continue;
            }
            
            // Get user preferences
            const userPrefs = await ctx.db
              .query('userPreferences')
              .withIndex('by_user', (q) => q.eq('userId', event.userId))
              .first();
            
            // Check if user has vesting reminders enabled
            if (userPrefs && !userPrefs.notificationSettings.vestingReminders.enabled) {
              console.log(`User ${event.userId} has vesting reminders disabled`);
              continue;
            }
            
            // Check if this reminder day is enabled for the user
            const enabledDays = userPrefs?.notificationSettings.vestingReminders.days || [30, 7, 1];
            if (!enabledDays.includes(days)) {
              console.log(`User ${event.userId} has ${days}-day reminders disabled`);
              continue;
            }
            
            // Get delivery methods
            const deliveryMethods = userPrefs?.notificationSettings.vestingReminders.methods || ['email', 'in_app'];
            
            // Create notification template
            const template = createVestingReminderTemplate(event, days);
            
            // Schedule notification for 9 AM on the reminder date
            const scheduledTime = new Date(now + (days * 24 * 60 * 60 * 1000));
            scheduledTime.setHours(9, 0, 0, 0);
            
            // Create notification
            await ctx.db.insert('notifications', {
              userId: event.userId,
              type: getReminderNotificationType(days),
              title: template.title,
              message: template.message,
              relatedEntityId: event._id,
              relatedEntityType: 'vesting_event' as const,
              scheduledFor: scheduledTime.getTime(),
              deliveryMethods,
              status: 'pending' as const,
              attempts: 0,
              emailSent: false,
              inAppSent: false,
              pushSent: false,
              retryCount: 0,
              createdAt: now,
              updatedAt: now,
            });
            
            notificationsCreated++;
            console.log(`Created ${days}-day reminder for vesting event ${event._id}`);
            
          } catch (eventError) {
            const errorMsg = `Error creating notification for event ${event._id}: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Notification trigger processing completed. Created ${notificationsCreated} notifications in ${duration}ms`);
      
      return {
        success: true,
        timestamp: endTime,
        message: `Created ${notificationsCreated} vesting reminder notifications`,
        recordsProcessed: notificationsCreated,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          errorsCount: errors.length,
        },
      };
      
    } catch (error) {
      const errorMsg = `Fatal error in notification trigger processing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        timestamp: Date.now(),
        message: errorMsg,
        recordsProcessed: notificationsCreated,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Internal mutation to create vesting completion notifications
export const createVestingCompletionNotifications = internalMutation({
  handler: async (ctx) => {
    console.log('Creating vesting completion notifications...');
    
    const startTime = Date.now();
    let notificationsCreated = 0;
    let errors: string[] = [];
    
    try {
      // Get vesting events that occurred today and haven't been processed for notifications
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const endOfToday = startOfToday + (24 * 60 * 60 * 1000) - 1;
      
      const todaysVestingEvents = await ctx.db
        .query('vestingEvents')
        .withIndex('by_vesting_date', (q) => 
          q.gte('vestingDate', startOfToday)
           .lte('vestingDate', endOfToday)
        )
        .filter((q) => q.eq(q.field('processed'), true)) // Only processed events
        .collect();
      
      console.log(`Found ${todaysVestingEvents.length} vesting events that completed today`);
      
      for (const event of todaysVestingEvents) {
        try {
          // Check if completion notification already exists
          const existingNotification = await ctx.db
            .query('notifications')
            .withIndex('by_user', (q) => q.eq('userId', event.userId))
            .filter((q) => 
              q.eq(q.field('relatedEntityId'), event._id) &&
              q.eq(q.field('type'), 'vesting_occurred')
            )
            .first();
          
          if (existingNotification) {
            console.log(`Completion notification already exists for event ${event._id}`);
            continue;
          }
          
          // Get user preferences
          const userPrefs = await ctx.db
            .query('userPreferences')
            .withIndex('by_user', (q) => q.eq('userId', event.userId))
            .first();
          
          // Check if user has vesting reminders enabled (using same setting for completion notifications)
          if (userPrefs && !userPrefs.notificationSettings.vestingReminders.enabled) {
            console.log(`User ${event.userId} has vesting notifications disabled`);
            continue;
          }
          
          // Get delivery methods
          const deliveryMethods = userPrefs?.notificationSettings.vestingReminders.methods || ['email', 'in_app'];
          
          // Create notification template
          const template = createVestingCompletionTemplate(event);
          
          // Create notification (send immediately)
          await ctx.db.insert('notifications', {
            userId: event.userId,
            type: 'vesting_occurred' as const,
            title: template.title,
            message: template.message,
            relatedEntityId: event._id,
            relatedEntityType: 'vesting_event' as const,
            scheduledFor: Date.now(), // Send immediately
            deliveryMethods,
            status: 'pending' as const,
            attempts: 0,
            emailSent: false,
            inAppSent: false,
            pushSent: false,
            retryCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          
          notificationsCreated++;
          console.log(`Created completion notification for vesting event ${event._id}`);
          
        } catch (eventError) {
          const errorMsg = `Error creating completion notification for event ${event._id}: ${eventError instanceof Error ? eventError.message : 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Vesting completion notification processing completed. Created ${notificationsCreated} notifications in ${duration}ms`);
      
      return {
        success: true,
        timestamp: endTime,
        message: `Created ${notificationsCreated} vesting completion notifications`,
        recordsProcessed: notificationsCreated,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          errorsCount: errors.length,
        },
      };
      
    } catch (error) {
      const errorMsg = `Fatal error in vesting completion notification processing: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        timestamp: Date.now(),
        message: errorMsg,
        recordsProcessed: notificationsCreated,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Helper function to get notification type for reminder days
function getReminderNotificationType(days: number): 'vesting_reminder_30d' | 'vesting_reminder_7d' | 'vesting_reminder_1d' {
  switch (days) {
    case 30:
      return 'vesting_reminder_30d';
    case 7:
      return 'vesting_reminder_7d';
    case 1:
      return 'vesting_reminder_1d';
    default:
      return 'vesting_reminder_7d'; // Default fallback
  }
}

// Helper function to create vesting reminder template
function createVestingReminderTemplate(event: any, daysUntilVesting: number): {
  title: string;
  message: string;
} {
  const shares = event.sharesVested.toLocaleString();
  const company = event.companyName;
  const vestingDate = new Date(event.vestingDate).toLocaleDateString();

  let title: string;
  let message: string;

  switch (daysUntilVesting) {
    case 30:
      title = '🗓️ Vesting Reminder - 30 Days';
      message = `${shares} shares of ${company} will vest in 30 days on ${vestingDate}`;
      break;
    case 7:
      title = '⏰ Vesting Reminder - 7 Days';
      message = `${shares} shares of ${company} will vest in 1 week on ${vestingDate}`;
      break;
    case 1:
      title = '🚀 Vesting Tomorrow!';
      message = `${shares} shares of ${company} will vest tomorrow on ${vestingDate}`;
      break;
    default:
      title = '📅 Upcoming Vesting';
      message = `${shares} shares of ${company} will vest on ${vestingDate}`;
  }

  return { title, message };
}

// Helper function to create vesting completion template
function createVestingCompletionTemplate(event: any): {
  title: string;
  message: string;
} {
  const shares = event.sharesVested.toLocaleString();
  const company = event.companyName;

  const title = '✅ Shares Vested!';
  const message = `${shares} shares of ${company} have vested today`;

  return { title, message };
}

// Internal query to get upcoming vesting events for notification creation
export const getUpcomingVestingEventsForNotifications = internalQuery({
  args: {
    daysAhead: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const targetDate = now + (args.daysAhead * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await ctx.db
      .query('vestingEvents')
      .withIndex('by_vesting_date', (q) => 
        q.gte('vestingDate', startOfDay.getTime())
         .lte('vestingDate', endOfDay.getTime())
      )
      .filter((q) => q.eq(q.field('processed'), false))
      .collect();
  },
});

// Internal mutation to clean up old notifications
export const cleanupOldNotifications = internalMutation({
  args: {
    olderThanDays: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoffDate = Date.now() - (args.olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldNotifications = await ctx.db
      .query('notifications')
      .filter((q) => 
        q.lt(q.field('createdAt'), cutoffDate) &&
        q.neq(q.field('status'), 'pending') // Don't delete pending notifications
      )
      .collect();
    
    let deletedCount = 0;
    for (const notification of oldNotifications) {
      await ctx.db.delete(notification._id);
      deletedCount++;
    }
    
    console.log(`Cleaned up ${deletedCount} old notifications`);
    
    return {
      success: true,
      deletedCount,
      cutoffDate,
      timestamp: Date.now(),
    };
  },
});