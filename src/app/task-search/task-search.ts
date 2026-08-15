import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseService, Task, User } from '../services/firebase';
import { AuthService } from '../services/auth.services';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-task-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-search.html',
  styleUrls: ['./task-search.css']
})
export class TaskSearchComponent implements OnInit, OnDestroy {
  companyId = '';
  allTasks: Task[] = [];
  filteredTasks: Task[] = [];
  users: User[] = [];

  // Filters
  searchTaskId = '';
  searchAssignee = '';
  searchStatus = 'all';
  searchDateFrom = '';
  searchDateTo = '';
  // Pagination properties
  pageSize = 10;
  pageSizeOptions = [5, 10, 25];
  currentPage = 1;
  Math = Math;

  loading = true;
  private sub!: Subscription;

  statusOptions = ['all', 'received', 'approved', 'submitted', 'completed', 'rejected'];

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.sub = this.auth.currentCompanyId$.subscribe(async cid => {
      if (cid) {
        this.companyId = cid;
        await this.loadData();
      }
    });
  }

  async loadData() {
    [this.allTasks, this.users] = await Promise.all([
      this.firebase.getTasksByCompany(this.companyId),
      this.firebase.getUsersByCompany(this.companyId)
    ]);
    this.filteredTasks = [...this.allTasks];
    this.loading = false;
    this.cdr.detectChanges();
  }

  getAssigneeName(assigneeId: string): string {
    return this.users.find(u => u.id === assigneeId)?.name ?? assigneeId;
  }

  applyFilters() {
  // ... existing filter logic ...
  this.currentPage = 1;
  this.cdr.detectChanges();
}

clearFilters() {
  this.searchTaskId = '';
  this.searchAssignee = '';
  this.searchStatus = 'all';
  this.searchDateFrom = '';
  this.searchDateTo = '';
  this.filteredTasks = [...this.allTasks];
  this.currentPage = 1;
  this.cdr.detectChanges();
}

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      received: 'status-received',
      approved: 'status-approved',
      submitted: 'status-submitted',
      completed: 'status-completed',
      rejected: 'status-rejected'
    };
    return map[status] ?? '';
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.sub) this.sub.unsubscribe();
  }
  isOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  if (task.status === 'completed') return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.dueDate < today;
}


get totalPages(): number {
  return Math.ceil(this.filteredTasks.length / this.pageSize);
}

get pagedTasks(): Task[] {
  const start = (this.currentPage - 1) * this.pageSize;
  return this.filteredTasks.slice(start, start + this.pageSize);
}

get pageNumbers(): number[] {
  return Array.from({ length: this.totalPages }, (_, i) => i + 1);
}

goToPage(page: number) {
  if (page >= 1 && page <= this.totalPages) {
    this.currentPage = page;
  }
}

onPageSizeChange() {
  this.currentPage = 1;
}
}