type PlanningDetails = { guests: string; budget: string };

function validBudget(value: string): boolean {
  if (!value) return true;
  const amount = Number(value);
  if (value.length > 32 || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return false;
  // Check the entered decimal, including exponent notation, without rounding it
  // through floating point. The backend accepts at most two nonzero decimal places.
  const parts = /^\+?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!parts || !(parts[1] + (parts[2] ?? '')).length) return false;
  const digits = parts[1] + (parts[2] ?? '');
  const excess = (parts[2]?.length ?? 0) - Number(parts[3] ?? 0) - 2;
  return excess <= 0 || (excess <= digits.length && digits.endsWith('0'.repeat(excess)));
}

export function planningDetailsErrors(details: PlanningDetails): PlanningDetails {
  return {
    guests: details.guests && (details.guests.length > 10 || !/^\d+$/.test(details.guests) || Number(details.guests) < 1 || Number(details.guests) > 10_000)
      ? 'Enter a guest count between 1 and 10,000, or leave it blank for now.' : '',
    budget: validBudget(details.budget) ? '' : 'Enter a positive total budget up to S$1,000,000,000 with at most two decimal places, or leave it blank for now.',
  };
}
