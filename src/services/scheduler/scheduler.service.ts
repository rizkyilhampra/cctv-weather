import * as cron from "node-cron";
import { CCTVSource } from "../../types/source.types";

export interface SchedulerConfig {
  times: string[]; // Array of times in HH:MM format (e.g., ["05:00", "17:00"])
  timezone: string; // IANA timezone (e.g., "Asia/Makassar")
}

export interface SourceTask {
  source: CCTVSource;
  task: () => Promise<void>;
}

export class Scheduler {
  private tasks: ReturnType<typeof cron.schedule>[] = [];
  private isRunning = false;

  /**
   * Parse time string (HH:MM) into hour and minute
   * @param timeStr - Time in HH:MM format (24-hour)
   * @returns Object with hour and minute
   */
  private parseTime(timeStr: string): { hour: number; minute: number } {
    const parts = timeStr.split(":");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid time format: ${timeStr}. Expected HH:MM (e.g., "05:00", "17:00")`
      );
    }

    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error(
        `Invalid time: ${timeStr}. Hour must be 0-23, minute must be 0-59.`
      );
    }

    return { hour, minute };
  }

  /**
   * Convert a time from target timezone to UTC
   * @param hour - Hour in target timezone
   * @param minute - Minute in target timezone
   * @param timezone - IANA timezone identifier
   * @returns Object with UTC hour and minute
   */
  private convertTimeToUTC(
    hour: number,
    minute: number,
    timezone: string
  ): { hour: number; minute: number } {
    // Create a date in the target timezone at the specified time
    // Using today's date as reference
    const now = new Date();
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

    // Parse the local time string as if it were in the target timezone
    const localDate = new Date(
      new Date(localDateStr).toLocaleString("en-US", { timeZone: timezone })
    );

    // Get the UTC equivalent
    const utcDate = new Date(localDateStr);
    const offset = (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);

    let utcHour = hour - offset;
    let utcMinute = minute;

    // Handle day boundary crossing
    if (utcHour < 0) {
      utcHour += 24;
    } else if (utcHour >= 24) {
      utcHour -= 24;
    }

    return { hour: Math.floor(utcHour), minute: utcMinute };
  }

  /**
   * Schedule a task to run at specified times daily
   * @param config - Scheduler configuration
   * @param task - Function to execute on schedule
   */
  schedule(config: SchedulerConfig, task: () => Promise<void>): void {
    const { times, timezone } = config;

    if (!times || times.length === 0) {
      throw new Error("At least one time must be specified");
    }

    console.log(`Configuring scheduler for timezone: ${timezone}`);
    console.log(`Scheduled times (${timezone}): ${times.join(", ")}`);

    // Create a scheduled task for each time
    times.forEach((timeStr) => {
      const { hour, minute } = this.parseTime(timeStr);
      const utc = this.convertTimeToUTC(hour, minute, timezone);

      // Create cron expression: "minute hour * * *" (daily)
      const cronExpr = `${utc.minute} ${utc.hour} * * *`;

      console.log(
        `  - ${timeStr} (${timezone}) -> ${String(utc.hour).padStart(2, "0")}:${String(utc.minute).padStart(2, "0")} (UTC) [cron: ${cronExpr}]`
      );

      // Validate cron expression
      if (!cron.validate(cronExpr)) {
        throw new Error(`Invalid cron expression: ${cronExpr}`);
      }

      // Create scheduled task
      const scheduledTask = cron.schedule(cronExpr, async () => {
        const localTime = new Date().toLocaleString("en-US", {
          timeZone: timezone,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        console.log(
          `[${new Date().toISOString()}] Executing scheduled task (${timezone}: ${localTime})`
        );

        try {
          await task();
          console.log(
            `[${new Date().toISOString()}] Scheduled task completed successfully`
          );
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] Scheduled task failed:`,
            error
          );
          // Continue running - don't throw, so the scheduler keeps going
        }
      });

      this.tasks.push(scheduledTask);
    });
  }

  /**
   * Schedule tasks with source mapping (dual-source mode)
   * @param config - Scheduler configuration
   * @param sourceTasks - Array of tasks matching the times array (task[0] runs at times[0], etc.)
   */
  scheduleWithSources(config: SchedulerConfig, sourceTasks: SourceTask[]): void {
    const { times, timezone } = config;

    if (times.length !== sourceTasks.length) {
      throw new Error(
        `SCHEDULE_TIMES count (${times.length}) must match number of sources (${sourceTasks.length}). ` +
          `Expected exactly ${sourceTasks.length} times for sources: ${sourceTasks.map((t) => t.source).join(", ")}`
      );
    }

    console.log(`Configuring scheduler for timezone: ${timezone}`);
    console.log(`Scheduled executions:`);

    // Create a scheduled task for each time-source pair
    times.forEach((timeStr, index) => {
      const { source, task } = sourceTasks[index];
      const { hour, minute } = this.parseTime(timeStr);
      const utc = this.convertTimeToUTC(hour, minute, timezone);

      const cronExpr = `${utc.minute} ${utc.hour} * * *`;

      console.log(
        `  [${index + 1}] ${timeStr} (${timezone}) -> ${source} scraper [cron: ${cronExpr}]`
      );

      if (!cron.validate(cronExpr)) {
        throw new Error(`Invalid cron expression: ${cronExpr}`);
      }

      const scheduledTask = cron.schedule(cronExpr, async () => {
        const localTime = new Date().toLocaleString("en-US", {
          timeZone: timezone,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        console.log(
          `[${new Date().toISOString()}] Executing ${source} scraper (${timezone}: ${localTime})`
        );

        try {
          await task();
          console.log(
            `[${new Date().toISOString()}] ${source} scraper completed successfully`
          );
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] ${source} scraper failed:`,
            error
          );
        }
      });

      this.tasks.push(scheduledTask);
    });
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    if (this.isRunning) {
      console.warn("Scheduler is already running");
      return;
    }

    console.log(
      `[${new Date().toISOString()}] Starting scheduler with ${this.tasks.length} task(s)`
    );
    // Tasks are already started by cron.schedule()
    // Just mark as running
    this.isRunning = true;
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn("Scheduler is not running");
      return;
    }

    console.log(
      `[${new Date().toISOString()}] Stopping scheduler and all scheduled tasks`
    );
    this.tasks.forEach((task) => task.stop());
    this.isRunning = false;
  }

  /**
   * Get the next scheduled execution time
   */
  getNextExecution(): Date | null {
    // node-cron doesn't expose next execution time directly
    // This is a limitation we'll document
    return null;
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
