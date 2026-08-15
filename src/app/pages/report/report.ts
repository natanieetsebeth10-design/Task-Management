import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  Chart, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface UserReport {
  user: User;
  tasks: Task[];
  totalHours: number;
  utilization: number;
  avgQuality: number;
  avgSpeed: number;
  comments: { date: string; comment: string; taskDetails: string }[];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './report.html',
  styleUrls: ['./report.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  companyId!: string;
  private companySub!: Subscription;

  users: User[] = [];
  allTasks: Task[] = [];
  reports: UserReport[] = [];
  Math = Math;

  // Filters
  filterUserId = 'all';
  filterDateFrom = '';
  filterDateTo = '';

  // Pagination
  pageSize = 10;
  pageSizeOptions = [5, 10, 25];
  currentPage = 1;

  weeklyBenchmark = 40;
  selectedUserId: string | null = null;

  ratingChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  ratingChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } }
  };
  gaugeValue = 0;

  get nonAdminUsers(): User[] {
    return this.users.filter(u => u.role !== 'admin');
  }

  get filteredReports(): UserReport[] {
    return this.reports.filter(r => {
      if (this.filterUserId !== 'all' && r.user.id !== this.filterUserId) return false;
      return true;
    });
  }

  get totalPages(): number {
    return Math.ceil(this.filteredReports.length / this.pageSize);
  }

  get pagedReports(): UserReport[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredReports.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get selectedReport(): UserReport | null {
    return this.reports.find(r => r.user.id === this.selectedUserId) ?? null;
  }

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.companySub = this.auth.currentCompanyId$.subscribe(cid => {
      if (cid) {
        this.companyId = cid;
        this.loadData();
      }
    });
  }

  ngOnDestroy() {
    if (this.companySub) this.companySub.unsubscribe();
  }

  async loadData() {
    [this.users, this.allTasks] = await Promise.all([
      this.firebase.getUsersByCompany(this.companyId),
      this.firebase.getTasksByCompany(this.companyId)
    ]);
    this.buildReports();
  }

  buildReports() {
    const dateFrom = this.filterDateFrom ? new Date(this.filterDateFrom) : null;
    const dateTo = this.filterDateTo ? new Date(this.filterDateTo) : null;
    if (dateTo) dateTo.setHours(23, 59, 59);

    this.reports = this.users
      .filter(u => u.role !== 'admin')
      .map(user => {
        let tasks = this.allTasks.filter(
          t => t.assigneeId === user.id && t.status === 'completed'
        );

        // Apply date filter
        if (dateFrom || dateTo) {
          tasks = tasks.filter(t => {
            const raw = t.completedDate ?? t.startDate ?? '';
            if (!raw) return false;
            const d = new Date(raw);
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
          });
        }

        const totalHours = tasks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
        const benchmark = user.benchmark ?? this.weeklyBenchmark;
        const utilization = benchmark > 0
          ? Math.min(Math.round((totalHours / benchmark) * 100), 100)
          : 0;

       const ratedTasks = tasks.filter(t => t.rating && !t.autoApproved);
        const avgQuality = ratedTasks.length
          ? +(ratedTasks.reduce((s, t) => s + (t.rating?.quality ?? 0), 0) / ratedTasks.length).toFixed(1)
          : 0;
        const avgSpeed = ratedTasks.length
          ? +(ratedTasks.reduce((s, t) => s + (t.rating?.speed ?? 0), 0) / ratedTasks.length).toFixed(1)
          : 0;

        const comments = tasks
          .filter(t => t.rating?.comment)
          .map(t => ({
            date: t.completedDate ?? t.startDate ?? '',
            comment: t.rating!.comment!,
            taskDetails: t.details
          }))
          .sort((a, b) => b.date.localeCompare(a.date));

        return { user, tasks, totalHours, utilization, avgQuality, avgSpeed, comments };
      })
      .sort((a, b) => b.utilization - a.utilization);

    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  applyFilters() {
    this.selectedUserId = null;
    this.buildReports();
  }

  clearFilters() {
    this.filterUserId = 'all';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.buildReports();
  }

  selectUser(userId: string) {
    this.selectedUserId = this.selectedUserId === userId ? null : userId;
    if (this.selectedReport) this.buildUserChart(this.selectedReport);
  }

  buildUserChart(report: UserReport) {
    const labels = report.tasks.map(t =>
      t.completedDate ? t.completedDate.slice(0, 10) : t.details.slice(0, 10)
    );
    this.ratingChartData = {
      labels,
      datasets: [
        { label: 'Quality', data: report.tasks.map(t => t.rating?.quality ?? 0), backgroundColor: '#a5b5f0' },
        { label: 'Speed', data: report.tasks.map(t => t.rating?.speed ?? 0), backgroundColor: '#c8d0f8' }
      ]
    };
    this.gaugeValue = report.utilization;
    this.cdr.detectChanges();
  }

  async updateBenchmark(user: User, value: number) {
    user.benchmark = value;
    await this.firebase.updateUserBenchmark(user.id!, value);
    this.buildReports();
  }

  onGlobalBenchmarkChange() {
    this.buildReports();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.selectedUserId = null;
    }
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.selectedUserId = null;
  }
  goBack() {
  this.router.navigate(['/dashboard']);
}
}