import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent {

  constructor(private router: Router) {}

  goToHome() {
    this.router.navigate(['/home']);
  }

  goToContact() {
    this.router.navigate(['/contact']);
  }

 goToLogin() {
  this.router.navigate(['/login']); // note the leading slash
}

  goToJoin() {
    this.router.navigate(['/join-us']);
  }
}