import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskActionDialogue } from './task-action-dialogue';

describe('TaskActionDialogue', () => {
  let component: TaskActionDialogue;
  let fixture: ComponentFixture<TaskActionDialogue>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskActionDialogue]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TaskActionDialogue);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
