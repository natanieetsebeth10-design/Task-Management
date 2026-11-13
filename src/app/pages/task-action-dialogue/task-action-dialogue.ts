import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { FirebaseService, User } from '../../services/firebase';
import { toDay } from '../../core/date.util';
import { AiReviewService, AiReview, Timing } from '../../services/ai-review';

export interface TaskActionDialogData {
  taskId: string;
  assigneeName: string;
  action: 'approve' | 'reject' | 'reassign';
  companyId?: string;
  currentAssigneeId?: string;
  availableUsers?: User[];
  currentDueDate?: string;
  // used by the AI review
  taskNumber?: string;
  details?: string;
  urgency?: string;
  dueDate?: string;
  submittedDate?: string;
  rejectCount?: number;
  taskLink?: string;
  submissionLink?: string;
  submissionNote?: string;
}

@Component({
  selector: 'app-task-action-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSliderModule
  ],
  templateUrl: './task-action-dialogue.html',
  styleUrls: ['./task-action-dialogue.css']
})
export class TaskActionDialogComponent implements OnInit {
  form: FormGroup;
  requiredValidator = Validators.required;
  users: User[] = [];
  loadingUsers = false;
  minDate = toDay(new Date());   // earliest allowed new due date (today)

  // ---- AI review ----
  timing: Timing | null = null;
  review: AiReview | null = null;
  aiLoading = false;
  aiError = '';
  needKey = false;
  keyInput = '';

  constructor(
    private fb: FormBuilder,
    private firebase: FirebaseService,
    private cdr: ChangeDetectorRef,
    private ai: AiReviewService,
    @Inject(MatDialogRef) public dialogRef: MatDialogRef<TaskActionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TaskActionDialogData
  ) {
    if (data.action === 'approve') {
      this.form = this.fb.group({
        quality: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
        speed: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
        comment: ['']
      });

      this.form.valueChanges.subscribe(val => {
        const commentControl = this.form.get('comment')!;
        if (val.quality < 3 || val.speed < 3) {
          commentControl.setValidators([Validators.required]);
        } else {
          commentControl.clearValidators();
        }
        commentControl.updateValueAndValidity();
      });

    } else if (data.action === 'reassign') {
      const today = this.minDate;
      // Keep the current due date only if it's still in the future
      const prefill = data.currentDueDate && data.currentDueDate >= today ? data.currentDueDate : '';
      const notInPast = (c: AbstractControl) =>
        c.value && c.value < today ? { past: true } : null;

      this.form = this.fb.group({
        newUserId: ['', Validators.required],
        newDueDate: [prefill, [Validators.required, notInPast]]
      });

    } else {
      this.form = this.fb.group({
        feedback: ['', Validators.required]
      });
    }
  }

  async ngOnInit() {
    if (this.data.action !== 'reassign') {
      this.timing = this.ai.timeliness(this.data.dueDate, this.data.submittedDate);
      this.needKey = !this.ai.hasKey();
    }
    if (this.data.action === 'reassign') {
      this.loadingUsers = true;
      this.cdr.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 600));
      this.users = this.data.availableUsers ?? [];
      this.loadingUsers = false;
      this.cdr.detectChanges();
    }
  }

  // ================= AI REVIEW =================

  async runReview() {
    if (this.aiLoading) return;
    this.aiError = '';
    this.review = null;

    if (!this.ai.hasKey()) {
      this.needKey = true;
      return;
    }

    this.aiLoading = true;
    this.cdr.detectChanges();
    try {
      this.review = await this.ai.reviewSubmission({
        taskNumber: this.data.taskNumber,
        details: this.data.details ?? '',
        urgency: this.data.urgency,
        assigneeName: this.data.assigneeName,
        dueDate: this.data.dueDate,
        submittedDate: this.data.submittedDate,
        submissionNote: this.data.submissionNote,
        hasSubmissionLink: !!this.data.submissionLink,
        rejectCount: this.data.rejectCount
      });
    } catch (e: any) {
      this.aiError = e?.message ?? 'AI review failed. Please try again.';
      if (!this.ai.hasKey()) this.needKey = true;     // the key was rejected and cleared
    } finally {
      this.aiLoading = false;
      this.cdr.detectChanges();
    }
  }

  saveKeyAndRun() {
    const key = this.keyInput.trim();
    if (!key) return;
    this.ai.setKey(key);
    this.keyInput = '';
    this.needKey = false;
    this.runReview();
  }

  // Fills in the form from the AI suggestion. The admin can still change everything.
  applySuggestion() {
    const r = this.review;
    if (!r) return;

    if (this.data.action === 'approve') {
      const quality = r.qualityScore;
      const speed = this.timing?.speedScore ?? this.form.value.speed;
      this.form.patchValue({ quality, speed });
      // The comment box only appears (and is only required) for ratings below 3
      if (quality < 3 || speed < 3) {
        this.form.patchValue({ comment: r.suggestedComment });
      }
    } else if (this.data.action === 'reject') {
      this.form.patchValue({ feedback: r.suggestedRejectFeedback });
    }
    this.cdr.detectChanges();
  }

  submit() {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}