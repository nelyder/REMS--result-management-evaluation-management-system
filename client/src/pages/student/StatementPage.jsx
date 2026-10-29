import { ResultStatement } from '../../components/ResultStatement.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function StatementPage() {
  const { user } = useAuth();
  const results = useApi(() => studentsService.myResults(), []);
  const summary = useApi(() => studentsService.mySummary(), []);

  return (
    <ResultStatement
      title="Result statement"
      description="A printable statement of your published results."
      person={user}
      results={results.data}
      summary={summary.data}
      loading={results.loading}
      error={results.error}
      onRetry={results.reload}
    />
  );
}
