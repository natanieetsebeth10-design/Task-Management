import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';
import { FirebaseService, User as FirebaseUser, Task } from '../../services/firebase';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-create-task',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-task.html',
  styleUrls: ['./create-task.css']
})
export class CreateTaskComponent implements OnInit, OnDestroy {

  taskForm!: FormGroup;
  assignees: FirebaseUser[] = [];
  assignerName: string = '';
  companyId: string | null = null;
  currentUserId: string = '';
  generatedTaskNumber: string = '';

  error = '';
  success = '';
  loading = true;

  private sub!: Subscription;

  constructor(
    private fb: FormBuilder,
    private firebaseService: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.taskForm = this.fb.group({
      assigneeId: ['', Validators.required],
      assigner: [{ value: '', disabled: true }],
      urgency: ['medium', Validators.required],
      details: ['', Validators.required],
      startDate: ['', Validators.required],
      dueDate: ['', Validators.required],
      duration: [1, Validators.required]
    });

    this.sub = this.auth.currentUser$.subscribe(async (firebaseUser) => {
      if (!firebaseUser) return;
      try {
        this.currentUserId = firebaseUser.uid;
        const currentUserDoc = await this.firebaseService.getUserById(firebaseUser.uid);
        if (currentUserDoc) {
          this.assignerName = currentUserDoc.name;
          this.taskForm.patchValue({ assigner: this.assignerName });
          this.companyId = currentUserDoc.companyId;
          if (this.companyId) {
            this.loading = true;
            const allUsers = await this.firebaseService.getUsersByCompany(this.companyId);
            // Filter out the current user so they can't assign to themselves
            this.assignees = allUsers.filter(u => u.id !== this.currentUserId);
            this.loading = false;
            this.cdr.detectChanges();
          }
        }
      } catch (err: any) {
        this.error = 'Failed to load users: ' + err.message;
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  async onSubmit() {
    if (!this.taskForm.valid || !this.companyId) return;

    const formData = this.taskForm.getRawValue();

    if (new Date(formData.dueDate) < new Date(formData.startDate)) {
      this.error = 'Due date cannot be before start date.';
      return;
    }

    try {
      const taskNumber = await this.firebaseService.getNextTaskNumber(this.companyId);
      this.generatedTaskNumber = taskNumber;

      const assignee = this.assignees.find(u => u.id === formData.assigneeId);

      const taskData: Task = {
        ...formData,
        taskNumber,
        assigner: this.assignerName,
        assignerId: this.currentUserId,
        assigneeName: assignee?.name ?? '',
        companyId: this.companyId,
        status: 'received',
        createdAt: new Date()
      };

      await this.firebaseService.addTask(taskData);

      await this.firebaseService.addNotification({
        userId: formData.assigneeId,
        title: 'New Task Assigned',
        message: `You have been assigned task ${taskNumber}: "${formData.details}"`,
        read: false,
        createdAt: new Date().toISOString(),
        taskId: taskNumber
      });

      this.success = `Task ${taskNumber} created successfully!`;
      this.error = '';
      this.cdr.detectChanges();
      await this.router.navigate(['/dashboard']);

    } catch (err: any) {
      this.error = err.message;
      this.cdr.detectChanges();
    }
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }
}