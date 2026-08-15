import { Component, Input } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css'],
  exportAs: 'sidebarComp'
})
export class SidebarComponent {

  @Input() isAdmin = false;
  isOpen = false;

  constructor(private router: Router) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.isOpen = false);
  }

  toggle() {
    this.isOpen = !this.isOpen;
  }

  navigate(path: string) {
    this.router.navigate([path]);
  }
}