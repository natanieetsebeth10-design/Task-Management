import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { TaskActionDialogComponent, TaskActionDialogData } from '../task-action-dialogue/task-action-dialogue';
import { TaskDetailDialogComponent, TaskDetailDialogData } from '../task-detail-dialog/task-detail-dialog';
import { TaskChatDialogComponent } from '../task-chat/task-chat-dialog';
import { toDay } from '../../core/date.util';

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
  userName = '';
  weekDays: Date[] = [];
  rejectedTasksByDay: Record<string, Task[]> = {};
  submittedTasksByDay: Record<string, Task[]> = {};
  completedTasksByDay: Record<string, Task[]> = {};

  users: User[] = [];
  overdueTasks: Task[] = [];
  today = toDay(new Date());

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
      if (user) {
        this.adminId = user.uid;
        this.firebase.getUserById(user.uid).then(u => {
          this.userName = u?.name ?? '';
          this.cdr.detectChanges();
        });
      }
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

  // Name(s) to show for a task's assignee. Group tasks list everyone; older tasks
  // have no name saved, so fall back to looking the user up by id.
  nameOf(task: Task): string {
  if (task.isGroup && task.assigneeNames?.length) {
    return task.assigneeNames.join(', ') + ' (group)';
  }
  return task.assigneeName
    || this.users.find(u => u.id === task.assigneeId)?.name
    || 'Unassigned';
}

  // Everyone who should be notified about a task (group members, or the single assignee)
  private recipientsOf(task: Task): string[] {
    if (task.assigneeIds?.length) return task.assigneeIds;
    return task.assigneeId ? [task.assigneeId] : [];
  }

  async loadTasks() {
    if (!this.companyId) return;

    const [allTasks, users] = await Promise.all([
      this.firebase.getTasksByCompany(this.companyId),
      this.users.length ? Promise.resolve(this.users) : this.firebase.getUsersByCompany(this.companyId)
    ]);
    this.users = users;

    this.rejectedTasksByDay = {};
    this.submittedTasksByDay = {};
    this.completedTasksByDay = {};

    this.weekDays.forEach(day => {
      const key = this.getDayKey(day);

      this.rejectedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'rejected' && toDay(t.startDate) === key
      );
      this.submittedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'submitted' && toDay(t.submittedDate) === key
      );
      this.completedTasksByDay[key] = allTasks.filter(t =>
        t.status === 'completed' && toDay(t.completedDate) === key
      );
    });

    // Overdue panel: tasks assigned by this admin that are past their due date.
    // Reassigning with a new future due date moves a task out of this list.
    this.overdueTasks = allTasks.filter(t => {
      const due = toDay(t.dueDate);
      return due &&
        due < this.today &&
        t.status !== 'completed' &&
        t.status !== 'rejected' &&
        t.assignerId === this.adminId;
    }).sort((a, b) => toDay(a.dueDate).localeCompare(toDay(b.dueDate)));

    this.cdr.detectChanges();
  }

  getDaysOverdue(task: Task): number {
    const dueDay = toDay(task.dueDate);
    if (!dueDay) return 0;
    const due = new Date(dueDay);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Click on a card opens the details pop-up (ignored when a button or link inside was clicked)
  openDetails(task: Task, ev?: Event) {
    if ((ev?.target as HTMLElement)?.closest('button, a')) return;
    this.dialog.open(TaskDetailDialogComponent, {
      width: '480px',
      maxHeight: '90vh',
      data: { task, assigneeName: this.nameOf(task), viewer: 'admin' } as TaskDetailDialogData
    });
  }


  // Builds the dialog data for approve / reject, including the links
  private reviewData(task: Task, action: 'approve' | 'reject'): TaskActionDialogData {
    return {
      taskId: task.id!,
      assigneeName: this.nameOf(task),
      action,
      taskLink: task.taskLink,
      submissionLink: task.submissionLink,
      submissionNote: task.submissionNote,
      // for the AI review
      taskNumber: task.taskNumber,
      details: task.details,
      urgency: task.urgency,
      dueDate: toDay(task.dueDate),
      submittedDate: toDay(task.submittedDate),
      rejectCount: task.rejectCount
    };
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
        assigneeName: this.nameOf(task),
        action: 'reassign',
        companyId: this.companyId,
        currentAssigneeId: task.assigneeId,
        currentDueDate: toDay(task.dueDate),
        availableUsers  // pass users directly
      } as TaskActionDialogData
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result?.newUserId) {
      const newUser = availableUsers.find(u => u.id === result.newUserId);

      await this.firebase.reassignTask(task.id!, result.newUserId);
      await this.firebase.updateTaskDetails(task.id!, {
        reassigned: true,
        dueDate: result.newDueDate,                 // new deadline, so it leaves the overdue panel
        assigneeName: newUser?.name ?? '',
        assigneeNames: newUser ? [newUser.name] : []
      });
      await this.firebase.addNotification({
        userId: result.newUserId,
        title: 'Task Reassigned to You',
        message: `You have been assigned a new task: "${task.details}" (due ${result.newDueDate})`,
        read: false,
        createdAt: new Date().toISOString(),
        taskId: task.id
      });
      this.loadTasks();
    }
  }

  async approveTask(task: Task) {
    const dialogRef = this.dialog.open(TaskActionDialogComponent, {
      width: '480px',
      maxHeight: '90vh',
      data: this.reviewData(task, 'approve')
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      await this.firebase.updateTaskRating(task.id!, result);
      await this.firebase.updateTaskStatus(task.id!, 'completed');
      for (const uid of this.recipientsOf(task)) {
        await this.firebase.addNotification({
          userId: uid,
          title: 'Task Approved',
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
      width: '480px',
      maxHeight: '90vh',
      data: this.reviewData(task, 'reject')
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      await this.firebase.updateTaskFeedback(task.id!, result.feedback);
      await this.firebase.incrementRejectCount(task.id!);
      await this.firebase.updateTaskStatus(task.id!, 'received');
      for (const uid of this.recipientsOf(task)) {
        await this.firebase.addNotification({
          userId: uid,
          title: 'Task Rejected',
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
  openChat(task: Task) {
  this.router.navigate(['/chats'], { queryParams: { task: task.id } });
}
}