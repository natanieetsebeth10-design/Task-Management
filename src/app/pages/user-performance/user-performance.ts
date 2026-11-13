import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import {
  Chart, BarController, BarElement, CategoryScale,
  LinearScale, Tooltip, Legend, ArcElement, DoughnutController,
  RadialLinearScale, RadarController,
  PointElement, LineElement, Filler
} from 'chart.js';
import { FirebaseService, Task, User } from '../../services/firebase';
import { AuthService } from '../../services/auth.services';
import { PdfExportService } from '../../services/pdf-export';
import { toDay } from '../../core/date.util';

Chart.register(
  BarController, BarElement, CategoryScale, LinearScale,
  Tooltip, Legend, ArcElement, DoughnutController,
  RadialLinearScale, RadarController,
  PointElement, LineElement, Filler
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
  chartsReady = false;
  private loadingData = false;

  weekStart = '';
  weekEnd = '';
  today = toDay(new Date());

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
    public datePipe: DatePipe,
    private host: ElementRef<HTMLElement>,
    private pdf: PdfExportService
  ) {}

  ngOnInit() {
    this.generateWeekRange();

    this.userSub = this.auth.currentUser$.subscribe(async user => {
      if (!user) return;

      this.userId = user.uid;

      try {
        const userDoc = await this.firebase.getUserById(user.uid);
        if (userDoc) this.user = userDoc;
      } catch (error) {
        console.error('Failed to load user:', error);
      }

      await this.tryLoadData();
    });

    this.companySub = this.auth.currentCompanyId$.subscribe(async cid => {
      if (!cid) return;

      this.companyId = cid;
      await this.tryLoadData();
    });
  }

  generateWeekRange() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    this.weekStart = toDay(start);
    this.weekEnd = toDay(end);
  }

  private async tryLoadData() {
    if (!this.userId || !this.companyId) return;
    if (this.loadingData) return;

    await this.loadData();
  }

  async loadData() {
    if (!this.userId || !this.companyId || this.loadingData) return;

    this.loadingData = true;
    this.loading = true;

    try {
      // Fetch tasks and user information simultaneously.
      const [allTasks, userDoc] = await Promise.all([
        this.firebase.getTasksByAssignee(this.userId, this.companyId),
        this.firebase.getUserById(this.userId)
      ]);

      const weeklyTasks = allTasks.filter(t => {
        // completedDate is a full timestamp, so compare just the day (otherwise Saturday is dropped)
        const date = toDay(t.completedDate ?? t.startDate);
        return date >= this.weekStart && date <= this.weekEnd;
      });

      const completedTasks = weeklyTasks.filter(
        t => t.status === 'completed'
      );

      const ratedTasks = completedTasks.filter(
        t => t.rating && !t.autoApproved
      );

      this.totalCompleted = completedTasks.length;

      this.avgQuality = ratedTasks.length
        ? +(ratedTasks.reduce(
            (s, t) => s + (t.rating?.quality ?? 0), 0
          ) / ratedTasks.length).toFixed(1)
        : 0;

      this.avgSpeed = ratedTasks.length
        ? +(ratedTasks.reduce(
            (s, t) => s + (t.rating?.speed ?? 0), 0
          ) / ratedTasks.length).toFixed(1)
        : 0;

      const benchmark = userDoc?.benchmark ?? 40;

      const totalHours = completedTasks.reduce(
        (s, t) => s + (t.duration ?? 0), 0
      );

      this.utilization = benchmark > 0
        ? Math.min(Math.round((totalHours / benchmark) * 100), 100)
        : 0;

      this.autoAcceptCount = userDoc?.autoAcceptCount ?? 0;
      this.autoApproveCount = userDoc?.autoApproveCount ?? 0;

      this.rejectionCount = allTasks
        .filter(t =>
          t.rejectCount &&
          t.rejectCount > 0 &&
          toDay(t.startDate) >= this.weekStart
        )
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
          date: toDay(t.completedDate ?? t.startDate),
          task: t.details,
          comment: t.rating!.comment!,
          quality: t.rating?.quality ?? 0,
          speed: t.rating?.speed ?? 0
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Prepare chart datasets.
      this.buildCharts();

      this.chartsReady = true;
      this.loading = false;

    } catch (error) {
      console.error('Performance page failed:', error);
    } finally {
      this.loading = false;
      this.loadingData = false;
      this.cdr.markForCheck();
    }
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

  // Downloads this page (stats, charts and feedback) as a PDF
  exportPdf() {
    if (!this.chartsReady) return;

    this.pdf.exportDashboard({
      filename: 'my-performance',
      title: 'My Performance',
      subtitle: `${this.user?.name ?? ''}   |   Week of ${this.weekStart} to ${this.weekEnd}`,
      stats: [
        { label: 'Completed', value: this.totalCompleted },
        { label: 'Avg quality', value: `${this.avgQuality}/5` },
        { label: 'Avg speed', value: `${this.avgSpeed}/5` },
        { label: 'Utilization', value: `${this.utilization}%` },
        { label: 'Overdue', value: this.overdueCount },
        { label: 'Rejections', value: this.rejectionCount },
        { label: 'Auto-accepted', value: this.autoAcceptCount },
        { label: 'Auto-approved', value: this.autoApproveCount }
      ],
      // The canvases appear on the page in this order
      charts: this.pdf.chartsFrom(this.host.nativeElement, ['Utilization', 'Quality vs Speed', 'Weekly Overview']),
      table: this.weeklyComments.length
        ? {
            title: 'Feedback this week',
            head: ['Date', 'Task', 'Comment', 'Quality', 'Speed'],
            rows: this.weeklyComments.map(c => [c.date, c.task, c.comment, `${c.quality}/5`, `${c.speed}/5`])
          }
        : undefined
    });
  }

  goBack() { this.router.navigate(['/dashboard']); }

  ngOnDestroy() {
    if (this.userSub) this.userSub.unsubscribe();
    if (this.companySub) this.companySub.unsubscribe();
  }
}