import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { ButtonLink, Spinner } from '../components/ui';

/** Landing page for the confirm and unsubscribe links in newsletter emails. */
export function NewsletterLink({ action }: { action: 'confirm' | 'unsubscribe' }) {
  const [params] = useSearchParams();
  const [state, setState] = useState<{ ok?: boolean; message?: string }>({});
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const body = { email: params.get('email') ?? '', token: params.get('token') ?? '' };
    api<{ message: string }>(`/api/subscribe/${action}`, { method: 'POST', body })
      .then(r => setState({ ok: true, message: r.message }))
      .catch((e: Error) => setState({ ok: false, message: e.message }));
  }, [action, params]);

  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="max-w-md">
        {state.ok === undefined ? (
          <Spinner label={action === 'confirm' ? 'Confirming your subscription' : 'Unsubscribing'} />
        ) : (
          <>
            <h1 className="text-3xl font-medium">
              {state.ok ? (action === 'confirm' ? 'Subscription confirmed' : 'Unsubscribed') : 'That link didn’t work'}
            </h1>
            <p className="mt-3 text-muted">{state.message}</p>
            <ButtonLink to="/" className="mt-8">Go home</ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}
