import { Link, useParams } from 'react-router';
import { usePractice } from '../lib/queries';
import { ButtonLink, Spinner } from '../components/ui';
import { ResultView } from '../components/session';

export function PracticeDetail() {
  const { id = '' } = useParams();
  const { data: practice, isLoading, error } = usePractice(id);

  return (
    <div className="container-page py-12 sm:py-16">
      <Link to="/dashboard" className="text-sm text-muted hover:text-ink">← Back to dashboard</Link>
      <div className="mt-6">
        {isLoading && <Spinner label="Loading session" />}
        {error && (
          <div className="py-10 text-center">
            <h1 className="text-3xl font-medium">Session not found</h1>
            <p className="mt-3 text-muted">{error.message}</p>
            <ButtonLink to="/dashboard" className="mt-8">Back to dashboard</ButtonLink>
          </div>
        )}
        {practice && (
          <>
            <p className="mb-4 text-sm text-muted">
              {new Date(practice.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
            </p>
            <ResultView practice={practice} />
          </>
        )}
      </div>
    </div>
  );
}
