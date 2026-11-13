import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';
import { FirebaseService, User as FirebaseUser, Task } from '../../services/firebase';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { cleanLink } from '../../core/link.util';

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
  assignerName = '';
  companyId: string | null = null;
  currentUserId = '';
  generatedTaskNumber = '';
  isAdmin = false;               // admins can assign to others; everyone else only to themselves

  error = '';
  success = '';
  loading = true;

  // ---- assignee picker ----
  selectedUsers: FirebaseUser[] = [];   // in order: the first one is the group lead
  selectedIds: string[] = [];
  search = '';
  dropdownOpen = false;
  highlight = 0;
  matches: FirebaseUser[] = [];         // what the dropdown shows (max MAX_SHOWN)
  moreCount = 0;                        // how many more matched but aren't shown
  private readonly MAX_SHOWN = 8;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

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
      assigneeIds: [[] as string[], Validators.required],
      assigner: [{ value: '', disabled: true }],
      urgency: ['medium', Validators.required],
      details: ['', Validators.required],
      startDate: ['', Validators.required],
      dueDate: ['', Validators.required],
      duration: [1, Validators.required],
      taskLink: ['']
    });

    this.sub = this.auth.currentUser$.subscribe(async (firebaseUser) => {
      if (!firebaseUser) return;
      try {
        this.currentUserId = firebaseUser.uid;
        const currentUserDoc = await this.firebaseService.getUserById(firebaseUser.uid);
        if (currentUserDoc) {
          this.assignerName = currentUserDoc.name;
          this.isAdmin = currentUserDoc.role === 'admin';
          this.taskForm.patchValue({ assigner: this.assignerName });
          this.companyId = currentUserDoc.companyId;
          if (this.companyId) {
            this.loading = true;
            if (this.isAdmin) {
              // Admins can assign to anyone in the company: other admins, users and themselves.
              // The admin is listed first so they are easy to pick.
              const allUsers = await this.firebaseService.getUsersByCompany(this.companyId);
              const rank = (u: FirebaseUser) => (u.id === this.currentUserId ? 0 : 1);
              this.assignees = allUsers.sort((a, b) =>
                rank(a) - rank(b) || a.name.localeCompare(b.name));
              this.updateMatches();
            } else {
              // Everyone else can only assign to themselves: pre-select them, no picker
              this.assignees = [currentUserDoc];
              this.selectedUsers = [currentUserDoc];
              this.syncSelection();
            }
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

  // ================= ASSIGNEE PICKER =================

  // Rebuilds the dropdown list. Stored in a property (not a getter) so the template
  // doesn't get a brand-new array on every change-detection pass.
  private updateMatches() {
    const q = this.search.trim().toLowerCase();
    const pool = this.assignees.filter(u =>
      !this.selectedIds.includes(u.id!) &&
      (!q ||
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q))
    );
    this.matches = pool.slice(0, this.MAX_SHOWN);
    this.moreCount = Math.max(0, pool.length - this.MAX_SHOWN);
    if (this.highlight >= this.matches.length) this.highlight = 0;
  }

  private syncSelection() {
    this.selectedIds = this.selectedUsers.map(u => u.id!);
    this.taskForm.patchValue({ assigneeIds: this.selectedIds });
    this.taskForm.get('assigneeIds')!.markAsTouched();
    this.updateMatches();
  }

  focusSearch() {
    this.searchInput?.nativeElement.focus();
  }

  openDropdown() {
    this.dropdownOpen = true;
    this.updateMatches();
  }

  closeDropdown() {
    this.dropdownOpen = false;
  }

  onSearchInput(value: string) {
    this.search = value;
    this.dropdownOpen = true;
    this.highlight = 0;
    this.updateMatches();
  }

  addUser(user: FirebaseUser) {
    if (this.selectedIds.includes(user.id!)) return;
    this.selectedUsers = [...this.selectedUsers, user];
    this.search = '';
    this.highlight = 0;
    this.syncSelection();
  }

  removeUser(id: string) {
    this.selectedUsers = this.selectedUsers.filter(u => u.id !== id);
    this.syncSelection();
  }

  // Moves a person to the front: the first person is the group lead
  makeLead(id: string) {
    const person = this.selectedUsers.find(u => u.id === id);
    if (!person) return;
    this.selectedUsers = [person, ...this.selectedUsers.filter(u => u.id !== id)];
    this.syncSelection();
  }

  onKeydown(ev: KeyboardEvent) {
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        this.dropdownOpen = true;
        if (this.matches.length) this.highlight = (this.highlight + 1) % this.matches.length;
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (this.matches.length) {
          this.highlight = (this.highlight - 1 + this.matches.length) % this.matches.length;
        }
        break;
      case 'Enter':
        ev.preventDefault();   // never submit the whole form from inside the picker
        if (this.dropdownOpen && this.matches[this.highlight]) {
          this.addUser(this.matches[this.highlight]);
        }
        break;
      case 'Backspace':
        if (!this.search && this.selectedUsers.length) {
          this.removeUser(this.selectedUsers[this.selectedUsers.length - 1].id!);
        }
        break;
      case 'Escape':
        this.dropdownOpen = false;
        break;
    }
  }

  // ================= SUBMIT =================

  async onSubmit() {
    if (!this.taskForm.valid || !this.companyId) return;
    this.error = '';

    const formData = this.taskForm.getRawValue();

    if (new Date(formData.dueDate) < new Date(formData.startDate)) {
      this.error = 'Due date cannot be before start date.';
      this.cdr.detectChanges();
      return;
    }

    const link = cleanLink(formData.taskLink);
    if (!link.ok) {
      this.error = link.error!;
      this.cdr.detectChanges();
      return;
    }

    try {
      const taskNumber = await this.firebaseService.getNextTaskNumber(this.companyId);
      this.generatedTaskNumber = taskNumber;

      // A non-admin can only ever assign to themselves (the Firestore rules enforce this too)
      const members = this.isAdmin
        ? this.selectedUsers
        : this.selectedUsers.filter(u => u.id === this.currentUserId);
      const ids = members.map(u => u.id!);
      const lead = members[0];

      if (ids.length === 0) {
        this.error = 'Choose who this task is for.';
        this.cdr.detectChanges();
        return;
      }
      const { assigneeIds, ...rest } = formData;

      const taskData: Task = {
        ...rest,
        taskLink: link.url,
        taskNumber,
        assigner: this.assignerName,
        assignerId: this.currentUserId,
        assigneeId: ids[0],                                  // group lead
        assigneeIds: ids,
        assigneeName: lead?.name ?? '',
        assigneeNames: members.map(m => m.name),
        isGroup: ids.length > 1,
        companyId: this.companyId,
        status: 'received',
        createdAt: new Date()
      };

      await this.firebaseService.addTask(taskData);

      for (const id of ids) {
        if (id === this.currentUserId) continue;   // no bell for tasks you gave yourself
        await this.firebaseService.addNotification({
          userId: id,
          title: ids.length > 1 ? 'New Group Task' : 'New Task Assigned',
          message: ids.length > 1
            ? `You were added to group task ${taskNumber} (lead: ${lead?.name}): "${formData.details}"`
            : `You have been assigned task ${taskNumber}: "${formData.details}"`,
          read: false,
          createdAt: new Date().toISOString(),
          taskId: taskNumber
        });
      }

      this.success = `Task ${taskNumber} created successfully!`;
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