// src/app/pages/join-us/join-us.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.services';
import { passwordProblems } from '../../core/password.util';

@Component({
  selector: 'app-join-us',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule],
  templateUrl: './join.html',
  styleUrls: ['./join.css']
})
export class JoinComponent {
  companyName = '';
  adminName = '';
  adminEmail = '';
  adminPassword = '';
  error = '';
  success = '';

  constructor(private auth: AuthService, private router: Router) {}

  async registerCompany() {
    this.error = '';
    this.success = '';

    const missing = passwordProblems(this.adminPassword);
    if (missing.length) {
      this.error = 'Password needs ' + missing.join(', ') + '.';
      return;
    }

    try {
      await this.auth.registerCompany(
        this.companyName,
        this.adminEmail,
        this.adminPassword,
        this.adminName
      );

      this.success = 'Company registered successfully!';
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
  console.error('Register failed:', err);
  this.error = this.friendlyError(err?.code) + (err?.code ? ` (${err.code})` : ` [${err?.message}]`);
}
  }

  private friendlyError(code?: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'That email is already registered. Try logging in instead.';
      case 'auth/invalid-email':
        return 'That email address doesn’t look right.';
      case 'auth/weak-password':
        return 'That password is too weak. Please choose a stronger one.';
      case 'auth/network-request-failed':
        return 'Network problem. Check your internet connection.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}