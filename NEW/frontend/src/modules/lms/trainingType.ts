// Training "Type" drives the renewal cadence → a sensible default due date when assigning.
export const TYPE_DUE_DAYS: Record<string, number> = {
  orientation: 30, mandatory_annual: 365, competency: 90, continuing_ed: 180,
};
export const TYPE_LABEL: Record<string, string> = {
  orientation: 'Orientation · new-hire (30 days)',
  mandatory_annual: 'Mandatory annual · renews yearly',
  competency: 'Competency · every 90 days',
  continuing_ed: 'Continuing ed · 6-month cycle',
};
export const TYPE_SHORT: Record<string, string> = {
  orientation: '30-day', mandatory_annual: 'annual', competency: '90-day', continuing_ed: '6-month',
};
export const isoIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
