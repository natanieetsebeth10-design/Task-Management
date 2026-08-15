import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { FirebaseService, Task } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { TaskActionDialogComponent, TaskActionDialogData } from '../task-action-dialogue/task-action-dialogue';

@Component({
  selector: 'app-admin-board',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './admin-board.html',
  styleUrls: ['./admin-board.css'],
  providers: [DatePipe]
})
export class AdminBoardComponent implements OnInit, OnDestroy {
  companyId!: string;
  adminId!: string;
  weekDays: Date[] = [];
  rejectedTasksByDay: Record<string, Task[]> = {};
  submittedTasksByDay: Record<string, Task[]> = {};
  completedTasksByDay: Record<string, Task[]> = {};

  overdueTasks: Task[] = [];
  today = new Date().toISOString().slice(0, 10);

  private companySub!: Subscription;
  private userSub!: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    public datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private router: Router,
    @Inject(MatDialog) private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.userSub = this.auth.currentUser$.subscribe(user => {
      if (user) this.adminId = user.uid;
    });

    this.companySub = this.auth.currentCompanyId$.subscribe(cid => {
      if (cid) {
        this.companyId = cid;
        this.generateWeek(new Date());
        this.loadTasks();
      }
    });
  }

  ngOnDestroy() {
    if (this.companySub) this.companySub.unsubscribe();
    if (this.userSub) this.userSub.unsubscribe();
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

  prevWeek() { const first = this.weekDays[0]; first.setDate(first.getDate() - 7); this.generateWeek(first); this.loadTasks(); }
  nextWeek() { const first = this.weekDays[0]; first.setDate(first.getDate() + 7); this.generateWeek(first); this.loadTasks(); }
  currentWeek() { this.generateWeek(new Date()); this.loadTasks(); }

  getDayKey(day: Date): string {
    return this.datePipe.transform(day, 'yyyy-MM-dd')!;
  }

  async loadTasks() {
    if (!this.companyId) return;
    const allTasks = await this.firebase.getTasksByCompany(this.companyId);

    this.rejectedTasksByDay = {};
    this.submittedTasksByDay = {};
    this.completedTasksByDay = {};

    this.weekDays.forEach(day => {
      const key = this.getDayKey(day);

      const normaliseDate = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (typeof val.toDate === 'function') return val.toDate().toISOString();
        return '';
      };

      this.rejectedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'rejected' && normaliseDate(t.startDate).startsWith(key)
      );
      this.submittedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'submitted' && normaliseDate(t.submittedDate).startsWith(key)
      );
      this.completedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'completed' && normaliseDate(t.completedDate).startsWith(key)
      );
    });

    // Overdue panel — tasks assigned by this admin that are past due date
    this.overdueTasks = allTasks.filter(t =>
      t.dueDate &&
      t.dueDate < this.today &&
      t.status !== 'completed' &&
      t.status !== 'rejected' &&
      t.assignerId === this.adminId
    ).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

    this.cdr.detectChanges();
  }

  getDaysOverdue(task: Task): number {
    if (!task.dueDate) return 0;
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }

  async reassignTask(task: Task) {
  // Load users here where DI works reliably
  const allUsers = await this.firebase.getUsersByCompany(this.companyId);
  const availableUsers = allUsers.filter(u =>
    u.id !== task.assigneeId && u.role !== 'admin'
  );

  const dialogRef = this.dialog.open(TaskActionDialogComponent, {
    width: '400px',
    data: {
      taskId: task.id,
      assigneeName: task.assigneeName,
      action: 'reassign',
      companyId: this.companyId,
      currentAssigneeId: task.assigneeId,
      availableUsers  // ← pass users directly
    } as TaskActionDialogData
  });

  const result = await dialogRef.afterClosed().toPromise();
  if (result?.newUserId) {
    await this.firebase.reassignTask(task.id!, result.newUserId);
    await this.firebase.updateTaskDetails(task.id!, { reassigned: true });
    await this.firebase.addNotification({
      userId: result.newUserId,
      title: '📋 Task Reassigned to You',
      message: `You have been assigned a new task: "${task.details}"`,
      read: false,
      createdAt: new Date().toISOString(),
      taskId: task.id
    });
    this.loadTasks();
  }
}

  async approveTask(task: Task) {
    const dialogRef = this.dialog.open(TaskActionDialogComponent, {
      width: '400px',
      data: { taskId: task.id, assigneeName: task.assigneeName, action: 'approve' } as TaskActionDialogData
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      await this.firebase.updateTaskRating(task.id!, result);
      await this.firebase.updateTaskStatus(task.id!, 'completed');
      if (task.assigneeId) {
        await this.firebase.addNotification({
          userId: task.assigneeId,
          title: '✅ Task Approved',
          message: `Your task "${task.details}" was approved! Quality: ${result.quality}/5, Speed: ${result.speed}/5.`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
      }
      this.loadTasks();
    }
  }

  async rejectTask(task: Task) {
    const dialogRef = this.dialog.open(TaskActionDialogComponent, {
      width: '400px',
      data: { taskId: task.id, assigneeName: task.assigneeName, action: 'reject' } as TaskActionDialogData
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      await this.firebase.updateTaskFeedback(task.id!, result.feedback);
      await this.firebase.incrementRejectCount(task.id!);
      await this.firebase.updateTaskStatus(task.id!, 'received');
      if (task.assigneeId) {
        await this.firebase.addNotification({
          userId: task.assigneeId,
          title: '❌ Task Rejected',
          message: `Your task "${task.details}" was rejected. Feedback: ${result.feedback}`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id
        });
      }
      this.loadTasks();
    }
  }

  goBack() { this.router.navigate(['/dashboard']); }
}