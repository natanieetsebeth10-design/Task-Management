import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import {
  Chart, BarController, BarElement, CategoryScale,
  LinearScale, Tooltip, Legend, ArcElement, DoughnutController,
  RadialLinearScale, RadarController
} from 'chart.js';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';

Chart.register(
  BarController, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, ArcElement, DoughnutController,
  RadialLinearScale, RadarController
);

@Component({
  selector: 'app-user-performance',
  standalone: true,
  imports: [CommonModule, DatePipe, BaseChartDirective],
  templateUrl: './user-performance.html',
  styleUrls: ['./user-performance.css'],
  providers: [DatePipe]
})
export class UserPerformanceComponent implements OnInit, OnDestroy {
  userId = '';
  companyId = '';
  user: User | null = null;
  loading = true;

  weekStart = '';
  weekEnd = '';
  today = new Date().toISOString().slice(0, 10);

  totalCompleted = 0;
  avgQuality = 0;
  avgSpeed = 0;
  utilization = 0;
  autoAcceptCount = 0;
  autoApproveCount = 0;
  overdueCount = 0;
  rejectionCount = 0;

  weeklyComments: {
    date: string;
    task: string;
    comment: string;
    quality: number;
    speed: number
  }[] = [];

  radarChartData: ChartData<'radar'> = { labels: [], datasets: [] };
  radarChartOptions: ChartConfiguration<'radar'>['options'] = {
    responsive: true,
    scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } },
    plugins: { legend: { display: false } }
  };

  statsChartData: ChartData<'bar'> = { labels: [], datasets: [] };
  statsChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
  };

  doughnutChartData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'bottom' } }
  };

  private userSub!: Subscription;
  private companySub!: Subscription;

  constructor(
    private firebase: FirebaseService,
    private auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe
  ) {}

  ngOnInit() {
    this.generateWeekRange();

    this.userSub = this.auth.currentUser$.subscribe(async user => {
      if (!user) return;
      this.userId = user.uid;
      const userDoc = await this.firebase.getUserById(user.uid);
      if (userDoc) this.user = userDoc;
    });

    this.companySub = this.auth.currentCompanyId$.subscribe(async cid => {
      if (cid) {
        this.companyId = cid;
        await this.loadData();
      }
    });
  }

  generateWeekRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    this.weekStart = start.toISOString().slice(0, 10);
    this.weekEnd = end.toISOString().slice(0, 10);
  }

  async loadData() {
    if (!this.userId || !this.companyId) return;
    this.loading = true;

    const allTasks = await this.firebase.getTasksByAssignee(this.userId, this.companyId);
    const userDoc = await this.firebase.getUserById(this.userId);

    const weeklyTasks = allTasks.filter(t => {
      const date = t.completedDate ?? t.startDate ?? '';
      return date >= this.weekStart && date <= this.weekEnd;
    });

    const completedTasks = weeklyTasks.filter(t => t.status === 'completed');
    const ratedTasks = completedTasks.filter(t => t.rating && !t.autoApproved);

    this.totalCompleted = completedTasks.length;
    this.avgQuality = ratedTasks.length
      ? +(ratedTasks.reduce((s, t) => s + (t.rating?.quality ?? 0), 0) / ratedTasks.length).toFixed(1)
      : 0;
    this.avgSpeed = ratedTasks.length
      ? +(ratedTasks.reduce((s, t) => s + (t.rating?.speed ?? 0), 0) / ratedTasks.length).toFixed(1)
      : 0;

    const benchmark = userDoc?.benchmark ?? 40;
    const totalHours = completedTasks.reduce((s, t) => s + (t.duration ?? 0), 0);
    this.utilization = benchmark > 0
      ? Math.min(Math.round((totalHours / benchmark) * 100), 100)
      : 0;

    this.autoAcceptCount = userDoc?.autoAcceptCount ?? 0;
    this.autoApproveCount = userDoc?.autoApproveCount ?? 0;

    this.rejectionCount = allTasks
      .filter(t => t.rejectCount && t.rejectCount > 0 && (t.startDate ?? '') >= this.weekStart)
      .reduce((s, t) => s + (t.rejectCount ?? 0), 0);

    this.overdueCount = allTasks.filter(t =>
      t.dueDate &&
      t.dueDate < this.today &&
      t.status !== 'completed' &&
      t.dueDate >= this.weekStart
    ).length;

    this.weeklyComments = completedTasks
      .filter(t => t.rating?.comment)
      .map(t => ({
        date: t.completedDate?.slice(0, 10) ?? t.startDate ?? '',
        task: t.details,
        comment: t.rating!.comment!,
        quality: t.rating?.quality ?? 0,
        speed: t.rating?.speed ?? 0
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    this.buildCharts();
    this.loading = false;
    this.cdr.detectChanges();
  }

  buildCharts() {
    this.radarChartData = {
      labels: ['Quality', 'Speed'],
      datasets: [{
        data: [this.avgQuality, this.avgSpeed],
        backgroundColor: 'rgba(143,163,230,0.3)',
        borderColor: '#8fa3e6',
        pointBackgroundColor: '#4b5bbf'
      }]
    };

    this.statsChartData = {
      labels: ['Completed', 'Rejections', 'Overdue', 'Auto-Accepted', 'Auto-Approved'],
      datasets: [{
        data: [
          this.totalCompleted,
          this.rejectionCount,
          this.overdueCount,
          this.autoAcceptCount,
          this.autoApproveCount
        ],
        backgroundColor: [
          '#a5b5f0',
          '#f87171',
          '#fb923c',
          '#fbbf24',
          '#c8d0f8'
        ],
        borderRadius: 8
      }]
    };

    this.doughnutChartData = {
      labels: ['Used', 'Remaining'],
      datasets: [{
        data: [this.utilization, 100 - this.utilization],
        backgroundColor: ['#8fa3e6', '#e6ebfa'],
        borderWidth: 0
      }]
    };
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.companySub) this.companySub.unsubscribe();
  }
}