import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ResultStatement } from '../../components/ResultStatement.jsx';
import { studentsService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';

/** Registry view of one student's published results, with the same PDF the student gets. */
export default function StudentStatementPage() {
  const { id } = useParams();
  const statement = useApi(() => studentsService.statement(id), [id]);
  const st = statement.data?.student;
  const person = st && {
    fullName: st.fullName,
    student: { registrationNumber: st.registrationNumber, programme: st.programme, yearOfStudy: st.yearOfStudy },
  };

  return (
    <ResultStatement
      breadcrumb={
        <Link to="/admin/students" className="inline-flex items-center gap-1 hover:text-brand-700">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Students
        </Link>
      }
      title={st ? `Statement — ${st.fullName}` : 'Result statement'}
      description={st ? `${st.registrationNumber} · Published results only` : 'Published results only'}
      person={person}
      results={statement.data?.results}
      summary={statement.data?.summary}
      loading={statement.loading}
      error={statement.error}
      onRetry={statement.reload}
    />
  );
}
