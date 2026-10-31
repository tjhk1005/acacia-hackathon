import assert from 'node:assert/strict';
import test from 'node:test';
import { planningDetailsErrors } from '../lib/planning-details.ts';

test('optional planning details accept backend-compatible counts and exact SGD amounts', () => {
  for (const guests of ['', '1', '80', '10000', '0080']) {
    for (const budget of ['', '0.01', '20000', '20000.50', '1.2300', '.50', '1e3', '1.234e1', '1000000000']) {
      assert.deepEqual(planningDetailsErrors({guests,budget}), {guests:'',budget:''}, `${guests} / ${budget}`);
    }
  }
});

test('invalid or rounded planning details cannot pass validation before saving or syncing', () => {
  for (const guests of ['-1', '0', '2.5', '1e2', '10001', 'eighty', '８０', '00000000080']) {
    const errors=planningDetailsErrors({guests,budget:'20000'});
    assert.ok(errors.guests, guests);
    assert.equal(errors.budget,'');
  }
  for (const budget of ['-1', '0', 'NaN', 'Infinity', '0x10', '1000000000.01', '1e10', '5.999', '1.234e0', '1e-3', '1.000000000000000001', '5e-324']) {
    const errors=planningDetailsErrors({guests:'80',budget});
    assert.ok(errors.budget, budget);
    assert.equal(errors.guests,'');
  }
});
