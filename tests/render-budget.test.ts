import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderBudget } from '../src/render-budget';

test('sustained slow renders reduce detail in bounded steps; healthy frames restore it slowly', () => {
  const budget = new RenderBudget();
  assert.equal(budget.quality, 'full');
  budget.observe(40);
  budget.observe(40);
  assert.equal(budget.quality, 'full');
  budget.observe(40);
  assert.equal(budget.quality, 'balanced');
  assert.equal(budget.particleCount(4500), 2700);
  for (let index = 0; index < 6; index++) budget.observe(40);
  assert.equal(budget.quality, 'light');
  assert.equal(budget.particleCount(4500), 1350);
  for (let index = 0; index < 89; index++) budget.observe(5);
  assert.equal(budget.quality, 'light');
  budget.observe(5);
  assert.equal(budget.quality, 'balanced');
  for (let index = 0; index < 180; index++) budget.observe(5);
  assert.equal(budget.quality, 'full');
});

test('isolated spikes, invalid samples and moderate render times do not cause detail flicker', () => {
  const budget = new RenderBudget();
  for (let index = 0; index < 20; index++) {
    budget.observe(40);
    budget.observe(5);
    budget.observe(15);
    budget.observe(NaN);
    budget.observe(-1);
    budget.observe(Infinity);
  }
  assert.equal(budget.quality, 'full');
  assert.equal(budget.particleCount(0), 0);
  assert.equal(budget.particleCount(NaN), 0);
  assert.equal(budget.particleCount(4500), 4500);
});
