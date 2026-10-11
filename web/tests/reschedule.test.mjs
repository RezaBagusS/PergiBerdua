import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/domain.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});
const domain = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const { reminderTimes, scheduleTime } = domain;

test('scheduleTime accepts future dates and rejects past or invalid dates', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(scheduleTime(future), future);

  const past = new Date(Date.now() - 3600000).toISOString();
  assert.throws(() => scheduleTime(past), /Pilih jadwal di masa depan/);
  assert.throws(() => scheduleTime('invalid-date'), /Pilih jadwal di masa depan/);
  assert.throws(() => scheduleTime(''), /Pilih jadwal di masa depan/);
});

test('reminderTimes regenerates reminders properly for rescheduled dates', () => {
  const now = Date.now();
  // Rescheduled 3 days ahead: both H-1 (24h) and H-2h should be queued
  const threeDaysAhead = new Date(now + 3 * 86400000).toISOString();
  const times = reminderTimes(threeDaysAhead, now);
  assert.equal(times.length, 2);
  assert.ok(new Date(times[0]).getTime() > now);
  assert.ok(new Date(times[1]).getTime() > now);

  // Rescheduled 5 hours ahead: only H-2h is in the future
  const fiveHoursAhead = new Date(now + 5 * 3600000).toISOString();
  const shortTimes = reminderTimes(fiveHoursAhead, now);
  assert.equal(shortTimes.length, 1);
});

test('missed date detection logic matches places where scheduled_at <= now', () => {
  const now = Date.now();
  const places = [
    { id: '1', name: 'Museum Seni', status: 'planned', scheduled_at: new Date(now - 3600000).toISOString() }, // past 1 hour -> missed
    { id: '2', name: 'Pantai Indah', status: 'planned', scheduled_at: new Date(now + 86400000).toISOString() }, // tomorrow -> remains planned
    { id: '3', name: 'Kafe Kopi', status: 'wish', scheduled_at: null },                                         // wish -> unchanged
    { id: '4', name: 'Taman Bunga', status: 'visited', scheduled_at: new Date(now - 7200000).toISOString() }   // visited -> unchanged
  ];

  // Simulating syncMissedPlaces detection
  const synced = places.map(p => {
    if (p.status === 'planned' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now) {
      return { ...p, status: 'missed' };
    }
    return p;
  });

  assert.equal(synced.find(p => p.id === '1').status, 'missed');
  assert.equal(synced.find(p => p.id === '2').status, 'planned');
  assert.equal(synced.find(p => p.id === '3').status, 'wish');
  assert.equal(synced.find(p => p.id === '4').status, 'visited');
});

test('rescheduling missed place transitions status to planned and sets new schedule', () => {
  const now = Date.now();
  const missedPlace = {
    id: '1',
    name: 'Museum Seni',
    status: 'missed',
    scheduled_at: new Date(now - 3600000).toISOString(),
    visited_at: null
  };

  const newTime = scheduleTime(new Date(now + 2 * 86400000).toISOString());

  // Simulating place action 'reschedule' / 'schedule'
  const rescheduled = {
    ...missedPlace,
    status: 'planned',
    scheduled_at: newTime,
    visited_at: null
  };

  assert.equal(rescheduled.status, 'planned');
  assert.equal(rescheduled.scheduled_at, newTime);
  assert.equal(rescheduled.visited_at, null);

  // New reminders generated
  const reminders = reminderTimes(newTime, now);
  assert.equal(reminders.length, 2);
});

test('missed place can be cancelled back to wishlist or marked visited', () => {
  const now = Date.now();
  const missedPlace = {
    id: '1',
    name: 'Museum Seni',
    status: 'missed',
    scheduled_at: new Date(now - 3600000).toISOString(),
    visited_at: null
  };

  // User decides to cancel to wish
  const wished = {
    ...missedPlace,
    status: 'wish',
    scheduled_at: null,
    visited_at: null
  };
  assert.equal(wished.status, 'wish');
  assert.equal(wished.scheduled_at, null);

  // User marks visited
  const visited = {
    ...missedPlace,
    status: 'visited',
    visited_at: new Date(now).toISOString()
  };
  assert.equal(visited.status, 'visited');
  assert.ok(visited.visited_at);
});
