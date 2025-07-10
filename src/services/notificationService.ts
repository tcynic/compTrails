import type { 
  NotificationRecord, 
  NotificationType, 
  DeliveryMethod, 
  VestingEvent,
  NotificationSettings
} from '@/lib/db/types';
import { format } from 'date-fns';

export interface NotificationTemplate {
  title: string;
  message: string;
  emailSubject?: string;
  emailBody?: string;
}

export class NotificationService {
  /**
   * Create notification templates for different types
   */
  static createVestingReminderNotification(
    vestingEvent: VestingEvent,
    daysUntilVesting: number
  ): NotificationTemplate {
    const vestingDate = format(new Date(vestingEvent.vestingDate), 'MMM dd, yyyy');
    const shares = vestingEvent.sharesVested.toLocaleString();
    const company = vestingEvent.companyName;

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

    const emailSubject = title;
    const emailBody = `
Hello!

This is a friendly reminder that you have equity vesting soon:

Company: ${company}
Shares: ${shares}
Vesting Date: ${vestingDate}
Grant Type: ${vestingEvent.grantType}

${daysUntilVesting === 1 
  ? 'Your shares will vest tomorrow! You may want to review your equity portfolio and consider any tax implications.'
  : `Your shares will vest in ${daysUntilVesting} days. This is a good time to review your equity portfolio and plan accordingly.`
}

Best regards,
Your Compensation Tracker
    `.trim();

    return {
      title,
      message,
      emailSubject,
      emailBody,
    };
  }

  /**
   * Create notification for completed vesting
   */
  static createVestingCompletedNotification(vestingEvent: VestingEvent): NotificationTemplate {
    const vestingDate = format(new Date(vestingEvent.vestingDate), 'MMM dd, yyyy');
    const shares = vestingEvent.sharesVested.toLocaleString();
    const company = vestingEvent.companyName;

    const title = '✅ Shares Vested!';
    const message = `${shares} shares of ${company} have vested today`;

    const emailSubject = `Shares Vested - ${company}`;
    const emailBody = `
Congratulations!

Your equity has vested:

Company: ${company}
Shares: ${shares}
Vesting Date: ${vestingDate}
Grant Type: ${vestingEvent.grantType}

${vestingEvent.fmvAtVesting 
  ? `Fair Market Value: $${vestingEvent.fmvAtVesting.toFixed(2)} per share`
  : 'Consider updating the Fair Market Value for accurate portfolio tracking.'
}

You may want to:
- Review your equity portfolio
- Consider tax implications
- Update your financial planning

Best regards,
Your Compensation Tracker
    `.trim();

    return {
      title,
      message,
      emailSubject,
      emailBody,
    };
  }

  /**
   * Create notification for FMV updates
   */
  static createFMVUpdateNotification(
    companyName: string,
    oldFMV: number,
    newFMV: number,
    currency: string = 'USD'
  ): NotificationTemplate {
    const change = newFMV - oldFMV;
    const changePercent = ((change / oldFMV) * 100).toFixed(1);
    const direction = change > 0 ? 'increased' : 'decreased';
    const emoji = change > 0 ? '📈' : '📉';

    const title = `${emoji} FMV Updated - ${companyName}`;
    const message = `${companyName} FMV ${direction} to $${newFMV.toFixed(2)} (${changePercent > '0' ? '+' : ''}${changePercent}%)`;

    const emailSubject = `Fair Market Value Update - ${companyName}`;
    const emailBody = `
Hello!

The Fair Market Value for ${companyName} has been updated:

Previous FMV: $${oldFMV.toFixed(2)} ${currency}
New FMV: $${newFMV.toFixed(2)} ${currency}
Change: ${change > 0 ? '+' : ''}$${Math.abs(change).toFixed(2)} (${changePercent > '0' ? '+' : ''}${changePercent}%)

This update affects the valuation of your equity portfolio. You may want to review your holdings and consider any portfolio adjustments.

Best regards,
Your Compensation Tracker
    `.trim();

    return {
      title,
      message,
      emailSubject,
      emailBody,
    };
  }

  /**
   * Schedule vesting reminder notifications
   */
  static async scheduleVestingReminders(
    vestingEvents: VestingEvent[],
    userPreferences: NotificationSettings,
    userId: string
  ): Promise<Partial<NotificationRecord>[]> {
    const notifications: Partial<NotificationRecord>[] = [];

    if (!userPreferences.vestingReminders.enabled) {
      return notifications;
    }

    const reminderDays = userPreferences.vestingReminders.days;
    const deliveryMethods = userPreferences.vestingReminders.methods;

    for (const event of vestingEvents) {
      for (const days of reminderDays) {
        const reminderDate = new Date(event.vestingDate - (days * 24 * 60 * 60 * 1000));
        
        // Only schedule future reminders
        if (reminderDate.getTime() > Date.now()) {
          const template = this.createVestingReminderNotification(event, days);
          
          notifications.push({
            userId,
            type: this.getReminderType(days),
            title: template.title,
            message: template.message,
            scheduledFor: reminderDate.getTime(),
            deliveryMethods,
            relatedEntityId: event.id?.toString(),
            relatedEntityType: 'vesting_event',
          });
        }
      }
    }

    return notifications;
  }

  /**
   * Get notification type for reminder days
   */
  private static getReminderType(days: number): NotificationType {
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

  /**
   * Check if user wants specific notification type
   */
  static shouldSendNotification(
    type: NotificationType,
    userPreferences: NotificationSettings
  ): boolean {
    switch (type) {
      case 'vesting_reminder_30d':
      case 'vesting_reminder_7d':
      case 'vesting_reminder_1d':
        return userPreferences.vestingReminders.enabled;
      case 'fmv_updated':
        return userPreferences.fmvUpdates.enabled;
      case 'system_alert':
        return userPreferences.systemAlerts.enabled;
      case 'vesting_occurred':
        return userPreferences.vestingReminders.enabled; // Use same setting as reminders
      default:
        return true; // Default to sending unknown types
    }
  }

  /**
   * Get delivery methods for notification type
   */
  static getDeliveryMethods(
    type: NotificationType,
    userPreferences: NotificationSettings
  ): DeliveryMethod[] {
    switch (type) {
      case 'vesting_reminder_30d':
      case 'vesting_reminder_7d':
      case 'vesting_reminder_1d':
      case 'vesting_occurred':
        return userPreferences.vestingReminders.methods;
      case 'fmv_updated':
        return userPreferences.fmvUpdates.methods;
      case 'system_alert':
        return userPreferences.systemAlerts.methods;
      default:
        return ['in_app']; // Default to in-app only
    }
  }

  /**
   * Create system alert notification
   */
  static createSystemAlertNotification(
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'error' = 'info'
  ): NotificationTemplate {
    const emoji = severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    
    return {
      title: `${emoji} ${title}`,
      message,
      emailSubject: `System Alert: ${title}`,
      emailBody: `
Hello!

We have an important system update:

${message}

If you have any questions or concerns, please contact support.

Best regards,
Your Compensation Tracker Team
      `.trim(),
    };
  }

  /**
   * Format notification for display
   */
  static formatNotificationForDisplay(notification: NotificationRecord): {
    displayTitle: string;
    displayMessage: string;
    timestamp: string;
    isRead: boolean;
    priority: 'high' | 'medium' | 'low';
  } {
    const priority = this.getNotificationPriority(notification.type);
    const timestamp = format(new Date(notification.createdAt), 'MMM dd, yyyy \'at\' h:mm a');

    return {
      displayTitle: notification.title,
      displayMessage: notification.message,
      timestamp,
      isRead: notification.status === 'sent',
      priority,
    };
  }

  /**
   * Get notification priority
   */
  private static getNotificationPriority(type: NotificationType): 'high' | 'medium' | 'low' {
    switch (type) {
      case 'vesting_reminder_1d':
      case 'vesting_occurred':
      case 'system_alert':
        return 'high';
      case 'vesting_reminder_7d':
      case 'fmv_updated':
        return 'medium';
      case 'vesting_reminder_30d':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Create default notification preferences
   */
  static createDefaultNotificationSettings(): NotificationSettings {
    return {
      vestingReminders: {
        enabled: true,
        days: [30, 7, 1],
        methods: ['email', 'in_app'],
      },
      fmvUpdates: {
        enabled: true,
        methods: ['in_app'],
      },
      systemAlerts: {
        enabled: true,
        methods: ['email', 'in_app'],
      },
    };
  }

  /**
   * Validate email address format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Calculate optimal notification timing
   */
  static calculateOptimalReminderDays(vestingFrequency: 'monthly' | 'quarterly' | 'annual'): number[] {
    switch (vestingFrequency) {
      case 'monthly':
        return [7, 1]; // Less frequent reminders for monthly vesting
      case 'quarterly':
        return [30, 7, 1];
      case 'annual':
        return [60, 30, 7, 1]; // More reminders for annual vesting
      default:
        return [30, 7, 1];
    }
  }

  /**
   * Group notifications by type for summary
   */
  static groupNotificationsByType(notifications: NotificationRecord[]): Record<NotificationType, NotificationRecord[]> {
    return notifications.reduce((groups, notification) => {
      if (!groups[notification.type]) {
        groups[notification.type] = [];
      }
      groups[notification.type].push(notification);
      return groups;
    }, {} as Record<NotificationType, NotificationRecord[]>);
  }

  /**
   * Calculate notification delivery success rate
   */
  static calculateDeliveryStats(notifications: NotificationRecord[]): {
    totalSent: number;
    totalFailed: number;
    successRate: number;
    emailSuccessRate: number;
    inAppSuccessRate: number;
    pushSuccessRate: number;
  } {
    const totalSent = notifications.filter(n => n.status === 'sent').length;
    const totalFailed = notifications.filter(n => n.status === 'failed').length;
    const total = totalSent + totalFailed;
    const successRate = total > 0 ? (totalSent / total) * 100 : 0;

    const emailAttempts = notifications.filter(n => n.deliveryMethods.includes('email')).length;
    const emailSuccess = notifications.filter(n => n.emailSent).length;
    const emailSuccessRate = emailAttempts > 0 ? (emailSuccess / emailAttempts) * 100 : 0;

    const inAppAttempts = notifications.filter(n => n.deliveryMethods.includes('in_app')).length;
    const inAppSuccess = notifications.filter(n => n.inAppSent).length;
    const inAppSuccessRate = inAppAttempts > 0 ? (inAppSuccess / inAppAttempts) * 100 : 0;

    const pushAttempts = notifications.filter(n => n.deliveryMethods.includes('push')).length;
    const pushSuccess = notifications.filter(n => n.pushSent).length;
    const pushSuccessRate = pushAttempts > 0 ? (pushSuccess / pushAttempts) * 100 : 0;

    return {
      totalSent,
      totalFailed,
      successRate,
      emailSuccessRate,
      inAppSuccessRate,
      pushSuccessRate,
    };
  }
}