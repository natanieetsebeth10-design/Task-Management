import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthGaurd } from './auth-gaurd';

describe('AuthGaurd', () => {
  let component: AuthGaurd;
  let fixture: ComponentFixture<AuthGaurd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthGaurd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthGaurd);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
