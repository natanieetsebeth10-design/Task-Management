import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { FirebaseService, User } from '../../services/firebase';

export interface TaskActionDialogData {
  taskId: string;
  assigneeName: string;
  action: 'approve' | 'reject' | 'reassign';
  companyId?: string;
  currentAssigneeId?: string;
  availableUsers?: User[];
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

  constructor(
    private fb: FormBuilder,
    private firebase: FirebaseService,
    private cdr: ChangeDetectorRef,
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
      this.form = this.fb.group({
        newUserId: ['', Validators.required]
      });

    } else {
      this.form = this.fb.group({
        feedback: ['', Validators.required]
      });
    }
  }

  async ngOnInit() {
    if (this.data.action === 'reassign') {
      this.loadingUsers = true;
      this.cdr.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 600));
      this.users = this.data.availableUsers ?? [];
      this.loadingUsers = false;
      this.cdr.detectChanges();
    }
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