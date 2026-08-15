// src/app/pages/join-us/join-us.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.services';

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
      this.error = err.message;
    }
  }
}