import { Badge } from './ui/index.js';
import { dueState } from '../utils/format.js';

const BADGES = {
  overdue: ['gray', 'Past due'],
  soon: ['amber', 'Due soon'],
  upcoming: ['green', 'Open'],
};

/** Text badge for an assignment due date (the label, not only the colour, carries the meaning). */
export function DueBadge({ dueAt }) {
  const [tone, label] = BADGES[dueState(dueAt)];
  return <Badge tone={tone}>{label}</Badge>;
}
