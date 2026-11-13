// src/app/pages/task-detail-dialog/task-detail-dialog.ts
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Task } from '../../services/firebase';
import { toDay } from '../../core/date.util';

export interface TaskDetailDialogData {
  task: Task;
  assigneeName?: string;
  viewer: 'admin' | 'member';
}

@Component({
  selector: 'app-task-detail-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './task-detail-dialog.html',
  styleUrls: ['./task-detail-dialog.css']
})
export class TaskDetailDialogComponent {
  task: Task;
  assignee: string;
  feedback: string;
  startDay: string;
  dueDay: string;
  submittedDay: string;
  completedDay: string;
  overdue: boolean;
  dueNote = '';
  members: string[] = [];
  isGroup = false;

  constructor(
    @Inject(MatDialogRef) public dialogRef: MatDialogRef<TaskDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TaskDetailDialogData
  ) {
    this.task = data.task;
    this.assignee = data.assigneeName || this.task.assigneeName || 'Unassigned';

    // Group tasks: first name is the lead
    this.members = (this.task.assigneeNames && this.task.assigneeNames.length > 1) ? this.task.assigneeNames : [];
    this.isGroup = this.members.length > 1;

    // The rejection feedback field name isn't known here, so check the likely ones.
    const raw: any = this.task;
    this.feedback = raw.adminFeedback ?? raw.feedback ?? '';

    this.startDay = toDay(this.task.startDate);
    this.dueDay = toDay(this.task.dueDate);
    this.submittedDay = toDay(this.task.submittedDate);
    this.completedDay = toDay(this.task.completedDate);

    const today = toDay(new Date());
    this.overdue = !!this.dueDay && this.dueDay < today && this.task.status !== 'completed';

    // Plain-English hint under the due date
    if (this.dueDay && this.task.status !== 'completed') {
      const diff = Math.round(
        (new Date(this.dueDay + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000
      );
      if (diff < 0) this.dueNote = `${-diff} day${diff === -1 ? '' : 's'} overdue`;
      else if (diff === 0) this.dueNote = 'Due today';
      else this.dueNote = `Due in ${diff} day${diff === 1 ? '' : 's'}`;
    }
  }

  close() {
    this.dialogRef.close();
  }
}