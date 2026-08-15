import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FirebaseService, Task } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-view-tasks',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './view-tasks.html',
  styleUrls: ['./view-tasks.css'],
  providers: [DatePipe],
})
export class ViewTasksComponent implements OnInit, OnDestroy {
  userId: string = '';
  companyId: string = '';

  weekDays: Date[] = [];
  receivedTasksByDay: Record<string, Task[]> = {};
  todoTasksByDay: Record<string, Task[]> = {};
  completedTasksByDay: Record<string, Task[]> = {};

  todayTasks: Task[] = [];
  today = new Date().toISOString().slice(0, 10);

  loading = true;

  private userSub!: Subscription;
  private companySub!: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe,
    private router: Router
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

    this.todayTasks = allTasks.filter(t =>
      t.dueDate === this.today &&
      t.status !== 'completed'
    );

    const now = new Date();

    // Auto-accept: received tasks older than 24 hours
    for (const task of allTasks.filter(t => t.status === 'received')) {
      if (!task.createdAt) continue;
      const createdAt = task.createdAt?.toDate
        ? task.createdAt.toDate()
        : new Date(task.createdAt);
      const hoursSince = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        await this.firebase.updateTaskStatus(task.id!, 'approved');
        await this.firebase.updateTaskDetails(task.id!, { autoAccepted: true });
        await this.firebase.incrementUserAutoAccept(this.userId);
        await this.firebase.addNotification({
          userId: this.userId,
          title: 'Task Auto-Accepted',
          message: `Task "${task.details}" was automatically accepted as you didn't respond within 24 hours.`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id,
          type: 'general',
          sentDate: this.today
        });
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

    // Auto-approve: submitted tasks older than 48 hours
    for (const task of allTasks.filter(t => t.status === 'submitted')) {
      if (!task.submittedDate) continue;
      const submittedAt = new Date(task.submittedDate);
      const hoursSince = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 48) {
        await this.firebase.updateTaskStatus(task.id!, 'completed');
        await this.firebase.updateTaskDetails(task.id!, { autoApproved: true });
        await this.firebase.incrementUserAutoApprove(this.userId);
        await this.firebase.addNotification({
          userId: this.userId,
          title: 'Task Auto-Approved',
          message: `Task "${task.details}" was automatically approved as no admin reviewed it within 48 hours.`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: task.id,
          type: 'general',
          sentDate: this.today
        });
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

  async acceptTask(task: Task) {
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

  async rejectTask(task: Task) {
    await this.firebase.updateTaskStatus(task.id!, 'rejected');
    this.loadTasks();
  }

  async submitForApproval(task: Task) {
    await this.firebase.updateTaskStatus(task.id!, 'submitted');
    await this.firebase.addNotification({
      userId: this.userId,
      title: 'Task Submitted',
      message: `Your task "${task.details}" has been submitted for approval.`,
      read: false,
      createdAt: new Date().toISOString(),
      taskId: task.id
    });
    this.loadTasks();
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.companySub) this.companySub.unsubscribe();
  }
}