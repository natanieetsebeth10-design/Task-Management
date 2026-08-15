import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminPerformance } from './admin-performance';

describe('AdminPerformance', () => {
  let component: AdminPerformance;
  let fixture: ComponentFixture<AdminPerformance>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPerformance]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminPerformance);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
