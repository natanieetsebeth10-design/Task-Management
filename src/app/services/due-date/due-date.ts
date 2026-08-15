import { Injectable } from '@angular/core';
import { FirebaseService } from '../firebase';

@Injectable({ providedIn: 'root' })
export class DueDateService {

  constructor(private firebase: FirebaseService) {}

  async checkDueDates(companyId: string, currentUserId: string, isAdmin: boolean) {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const tasks = await this.firebase.getActiveTasksByCompany(companyId);

    for (const task of tasks) {
      if (!task.id) continue;

      // ── AUTO-ACCEPT: 48hrs after createdAt if still received ──
      if (task.status === 'received' && task.assigneeId && task.createdAt) {
        const createdAt = task.createdAt?.toDate
          ? task.createdAt.toDate()
          : new Date(task.createdAt);
        const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceCreated >= 48) {
          await this.firebase.updateTaskStatus(task.id, 'approved');
          await this.firebase.updateTaskDetails(task.id, { autoAccepted: true });
          await this.firebase.incrementUserAutoAccept(task.assigneeId);

          // Notify assignee
          await this.firebase.addNotification({
            userId: task.assigneeId,
            title: ' Task Auto-Accepted',
            message: `Task "${task.details}" (${task.taskNumber ?? ''}) was automatically accepted as you didn't respond within 48 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: today
          });

          // Notify admin
          if (task.assignerId) {
            await this.firebase.addNotification({
              userId: task.assignerId,
              title: ' Task Auto-Accepted',
              message: `Task "${task.details}" (${task.taskNumber ?? ''}) assigned to ${task.assigneeName ?? 'an employee'} was automatically accepted after 48 hours.`,
              read: false,
              createdAt: new Date().toISOString(),
              taskId: task.id,
              type: 'general',
              sentDate: today
            });
          }
          continue;
        }
      }

      // ── AUTO-APPROVE: 48hrs after submittedDate if still submitted ──
      if (task.status === 'submitted' && task.assigneeId && task.submittedDate) {
        const submittedAt = new Date(task.submittedDate);
        const hoursSinceSubmitted = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);

        if (hoursSinceSubmitted >= 48) {
          await this.firebase.updateTaskStatus(task.id, 'completed');
          await this.firebase.updateTaskDetails(task.id, { autoApproved: true });
          await this.firebase.incrementUserAutoApprove(task.assigneeId);

          // Notify assignee
          await this.firebase.addNotification({
            userId: task.assigneeId,
            title: ' Task Auto-Approved',
            message: `Task "${task.details}" (${task.taskNumber ?? ''}) was automatically approved as no admin reviewed it within 48 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: today
          });

          // Notify admin
          if (task.assignerId) {
            await this.firebase.addNotification({
              userId: task.assignerId,
              title: ' Task Auto-Approved',
              message: `Task "${task.details}" (${task.taskNumber ?? ''}) submitted by ${task.assigneeName ?? 'an employee'} was automatically approved after 48 hours.`,
              read: false,
              createdAt: new Date().toISOString(),
              taskId: task.id,
              type: 'general',
              sentDate: today
            });
          }
          continue;
        }
      }

      // ── DUE TODAY: notify assignee ──
      if (task.dueDate && task.assigneeId === currentUserId) {
        const dueDate = task.dueDate.slice(0, 10);
        if (dueDate === today) {
          const exists = await this.firebase.dueDateNotificationExists(task.id, 'due_today');
          if (!exists) {
            await this.firebase.addNotification({
              userId: task.assigneeId,
              title: ' Task Due Today',
              message: `Your task "${task.details}" is due today. Make sure to submit it for approval.`,
              read: false,
              createdAt: new Date().toISOString(),
              taskId: task.id,
              type: 'due_today',
              sentDate: today
            });
          }
        }
      }

      // ── OVERDUE: notify admin ──
      if (task.dueDate && isAdmin) {
        const dueDate = task.dueDate.slice(0, 10);
        if (dueDate < today) {
          const exists = await this.firebase.dueDateNotificationExists(task.id, 'overdue');
          if (!exists) {
            let assigneeName = task.assigneeName ?? null;
            if (!assigneeName && task.assigneeId) {
              const assigneeDoc = await this.firebase.getUserById(task.assigneeId);
              assigneeName = assigneeDoc?.name ?? 'Unknown Employee';
            }
            await this.firebase.addNotification({
              userId: currentUserId,
              title: ' Overdue Task',
              message: `${assigneeName} missed the deadline for "${task.details}" which was due on ${dueDate}.`,
              read: false,
              createdAt: new Date().toISOString(),
              taskId: task.id,
              type: 'overdue',
              sentDate: today
            });
          }
        }
      }
    }
  }
}