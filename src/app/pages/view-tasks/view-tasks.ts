import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService, Task } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { cleanLink } from '../../core/link.util';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TaskDetailDialogComponent, TaskDetailDialogData } from '../task-detail-dialog/task-detail-dialog';
import { TaskChatDialogComponent } from '../task-chat/task-chat-dialog';

@Component({
  selector: 'app-view-tasks',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, MatDialogModule],
  templateUrl: './view-tasks.html',
  styleUrls: ['./view-tasks.css'],
  providers: [DatePipe],
})
export class ViewTasksComponent implements OnInit, OnDestroy {
  userId = '';
  companyId = '';

  weekDays: Date[] = [];
  receivedTasksByDay: Record<string, Task[]> = {};
  todoTasksByDay: Record<string, Task[]> = {};
  completedTasksByDay: Record<string, Task[]> = {};

  todayTasks: Task[] = [];
  today = new Date().toISOString().slice(0, 10);

  loading = true;

  // Submit pop-up state
  submitTarget: Task | null = null;
  submissionLink = '';
  submissionNote = '';
  submitError = '';
  submitting = false;

  // Decline pop-up state
  rejectTarget: Task | null = null;
  rejectReason = '';
  rejectError = '';
  rejecting = false;

  private myName = '';
  private userSub!: Subscription;
  private companySub!: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe,
    private router: Router,
    @Inject(MatDialog) private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.generateWeek(new Date());

    this.userSub = this.auth.currentUser$.subscribe(user => {
      if (user) { this.userId = user.uid; this.loadTasks(); }
    });

    this.companySub = this.auth.currentCompanyId$.subscribe(cid => {
      if (cid) { this.companyId = cid; this.loadTasks(); }
    });
  }

  async loadTasks() {
    if (!this.userId || !this.companyId) return;
    const allTasks = await this.firebase.getTasksByAssignee(this.userId, this.companyId);

    this.receivedTasksByDay = {};
    this.todoTasksByDay = {};
    this.completedTasksByDay = {};

    this.weekDays.forEach(day => {
      const key = this.datePipe.transform(day, 'yyyy-MM-dd')!;
      this.receivedTasksByDay[key] = allTasks.filter(t => t.status === 'received' && t.startDate === key);
      this.todoTasksByDay[key] = allTasks.filter(t => t.status === 'approved' && t.startDate === key);
      this.completedTasksByDay[key] = allTasks.filter(t => t.status === 'completed' && t.startDate === key);
    });

    this.todayTasks = allTasks.filter(t => t.dueDate === this.today && t.status !== 'completed');

    const now = new Date();

    // Auto-accept: received tasks older than 24 hours (lead only, so a group task is handled once)
    for (const task of allTasks.filter(t => t.status === 'received')) {
      if (!this.isLead(task)) continue;
      if (!task.createdAt) continue;
      const createdAt = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
      const hoursSince = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        await this.firebase.updateTaskStatus(task.id!, 'approved');
        await this.firebase.updateTaskDetails(task.id!, { autoAccepted: true });
        await this.firebase.incrementUserAutoAccept(this.userId);
        for (const uid of this.recipients(task)) {
          await this.firebase.addNotification({
            userId: uid,
            title: 'Task Auto-Accepted',
            message: `Task "${task.details}" was automatically accepted as there was no response within 24 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: this.today
          });
        }
        if (task.assignerId) {
          await this.firebase.addNotification({
            userId: task.assignerId,
            title: 'Task Auto-Accepted',
            message: `Task "${task.details}" assigned to ${task.assigneeName ?? 'an employee'} was automatically accepted after 24 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: this.today
          });
        }
      }
    }

    // Auto-approve: submitted tasks older than 48 hours (lead only)
    for (const task of allTasks.filter(t => t.status === 'submitted')) {
      if (!this.isLead(task)) continue;
      if (!task.submittedDate) continue;
      const submittedAt = new Date(task.submittedDate);
      const hoursSince = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 48) {
        await this.firebase.updateTaskStatus(task.id!, 'completed');
        await this.firebase.updateTaskDetails(task.id!, { autoApproved: true });
        await this.firebase.incrementUserAutoApprove(this.userId);
        for (const uid of this.recipients(task)) {
          await this.firebase.addNotification({
            userId: uid,
            title: 'Task Auto-Approved',
            message: `Task "${task.details}" was automatically approved as no admin reviewed it within 48 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: this.today
          });
        }
        if (task.assignerId) {
          await this.firebase.addNotification({
            userId: task.assignerId,
            title: 'Task Auto-Approved',
            message: `Task "${task.details}" submitted by ${task.assigneeName ?? 'an employee'} was automatically approved after 48 hours.`,
            read: false,
            createdAt: new Date().toISOString(),
            taskId: task.id,
            type: 'general',
            sentDate: this.today
          });
        }
      }
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  generateWeek(current: Date) {
    this.weekDays = [];
    const start = new Date(current);
    start.setDate(start.getDate() - start.getDay());
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      this.weekDays.push(day);
    }
  }

  prevWeek() { const f = this.weekDays[0]; f.setDate(f.getDate() - 7); this.generateWeek(f); this.loadTasks(); }
  nextWeek() { const f = this.weekDays[0]; f.setDate(f.getDate() + 7); this.generateWeek(f); this.loadTasks(); }
  currentWeek() { this.generateWeek(new Date()); this.loadTasks(); }

  getTaskClass(task: Task): string {
    if (task.rejectCount && task.rejectCount > 0) return 'stage-rejected';
    if (task.reassigned) return 'stage-reassigned';
    const days = this.getDaysUntilDue(task);
    if (days <= 2 && days >= 0) return 'stage-warning';
    if (task.status === 'approved') return 'stage-todo';
    if (task.status === 'completed') return 'stage-completed';
    return 'stage-received';
  }

  getDaysUntilDue(task: Task): number {
    if (!task.dueDate) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ---- group helpers ----
  // Only the lead (or the sole assignee) can accept, decline or submit a task.
  isLead(task: Task): boolean {
    return !task.assigneeIds || task.assigneeIds.length <= 1 || task.assigneeId === this.userId;
  }

  leadName(task: Task): string {
    return task.assigneeNames?.[0] || task.assigneeName || 'the lead';
  }

  // Everyone on the task (group members, or just this user)
  private recipients(task: Task): string[] {
    return task.assigneeIds?.length ? task.assigneeIds : [this.userId];
  }

  private async ensureMyName() {
    if (this.myName || !this.userId) return;
    try {
      this.myName = (await this.firebase.getUserById(this.userId))?.name ?? '';
    } catch { /* leave blank */ }
  }

  // ---- accept ----
  async acceptTask(task: Task) {
    if (!this.isLead(task)) return;
    await this.firebase.updateTaskStatus(task.id!, 'approved');
    await this.firebase.addNotification({
      userId: this.userId,
      title: 'Task Accepted',
      message: `You accepted task "${task.details}"`,
      read: false,
      createdAt: new Date().toISOString(),
      taskId: task.id
    });
    this.loadTasks();
  }

  // ---- decline (member rejects the task) ----
  rejectTask(task: Task) {
    if (!this.isLead(task)) return;
    this.rejectTarget = task;
    this.rejectReason = '';
    this.rejectError = '';
    this.cdr.detectChanges();
  }

  cancelReject() { this.rejectTarget = null; this.cdr.detectChanges(); }

  async confirmReject() {
    const task = this.rejectTarget;
    if (!task || this.rejecting) return;

    const reason = this.rejectReason.trim();
    if (reason.length < 5) {
      this.rejectError = 'Please give a short reason (at least 5 characters).';
      this.cdr.detectChanges();
      return;
    }

    this.rejecting = true;
    this.cdr.detectChanges();
    try {
      await this.ensureMyName();
      await this.firebase.updateTaskDetails(task.id!, { declineReason: reason });
      await this.firebase.updateTaskStatus(task.id!, 'rejected');
      if (task.assignerId) {
        await this.firebase.addNotification({
          userId: task.assignerId,
          title: 'Task Declined',
          message: `${this.myName || task.assigneeName || 'A member'} declined "${task.details}". Reason: ${reason}`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
      }
      this.rejectTarget = null;
      this.loadTasks();
    } catch {
      this.rejectError = 'Could not decline the task. Please try again.';
    } finally {
      this.rejecting = false;
      this.cdr.detectChanges();
    }
  }

  // ---- submit (link + note) ----
  submitForApproval(task: Task) {
    if (!this.isLead(task)) return;
    this.submitTarget = task;
    this.submissionLink = task.submissionLink ?? '';   // prefilled on resubmission
    this.submissionNote = '';
    this.submitError = '';
    this.cdr.detectChanges();
  }

  cancelSubmit() {
    this.submitTarget = null;
    this.cdr.detectChanges();
  }

  async confirmSubmit() {
    const task = this.submitTarget;
    if (!task || this.submitting) return;

    const link = cleanLink(this.submissionLink);
    if (!link.ok) {
      this.submitError = link.error!;
      this.cdr.detectChanges();
      return;
    }

    this.submitting = true;
    this.cdr.detectChanges();
    try {
      await this.firebase.updateTaskDetails(task.id!, {
        submissionLink: link.url,
        submissionNote: this.submissionNote.trim(),
        submittedDate: new Date().toISOString().slice(0, 10)
      });
      await this.firebase.updateTaskStatus(task.id!, 'submitted');

      for (const uid of this.recipients(task)) {
        await this.firebase.addNotification({
          userId: uid,
          title: 'Task Submitted',
          message: `Your task "${task.details}" has been submitted for approval.`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
      }
      if (task.assignerId) {
        await this.firebase.addNotification({
          userId: task.assignerId,
          title: 'Task Ready for Review',
          message: `${task.assigneeName ?? 'A member'} submitted "${task.details}" for review.`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
      }
      this.submitTarget = null;
      this.loadTasks();
    } catch {
      this.submitError = 'Could not submit. Please try again.';
    } finally {
      this.submitting = false;
      this.cdr.detectChanges();
    }
  }

  // ---- dialogs ----
  // Click on a card opens the details pop-up (ignored when a button or link inside was clicked)
  async openDetails(task: Task, ev?: Event) {
    if ((ev?.target as HTMLElement)?.closest('button, a')) return;

    // Older tasks have no assigneeName saved, so fall back to the logged-in member's own name
    if (!task.assigneeName) await this.ensureMyName();

    this.dialog.open(TaskDetailDialogComponent, {
      width: '480px',
      maxHeight: '90vh',
      data: {
        task,
        assigneeName: task.assigneeName || this.myName,
        viewer: 'member'
      } as TaskDetailDialogData
    });
  }

  async openChat(task: Task) {
    await this.ensureMyName();
    this.dialog.open(TaskChatDialogComponent, {
      width: '480px',
      maxHeight: '90vh',
      data: { taskId: task.id!, title: task.details, userName: this.myName }
    });
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.companySub) this.companySub.unsubscribe();
  }
}