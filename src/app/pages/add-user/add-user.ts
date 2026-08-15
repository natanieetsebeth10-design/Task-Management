// src/app/pages/add-user/add-user.ts
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.services';

@Component({
  selector: 'app-add-user',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-user.html',
  styleUrls: ['./add-user.css']
})
export class AddUserComponent implements OnInit {
  addUserForm!: FormGroup;
  success = '';
  error = '';
  currentCompanyId: string | null = null;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.addUserForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      role: ['member', Validators.required]
    });

    // Subscribe to companyId immediately
    this.auth.currentCompanyId$.subscribe(companyId => {
      this.currentCompanyId = companyId;
    });
  }

  async onSubmit() {
    if (!this.currentCompanyId) {
      this.error = 'Cannot determine your company. Are you logged in as admin?';
      return;
    }

    if (this.addUserForm.valid) {
      const { name, email, password, role } = this.addUserForm.value;

      try {
        // Create Firebase Auth user
        const userCred = await this.auth.createUser(email, password);
        const uid = userCred.user.uid;

        // Assign user under admin's company
        await this.auth.addUserToCompany(uid, name, email, this.currentCompanyId, role);

        this.success = 'User added successfully!';
        this.addUserForm.reset({ role: 'member' });

      } catch (err: any) {
        this.error = err.message;
      }
    }
  }
  goBack() {
  this.router.navigate(['/dashboard']);
}
}