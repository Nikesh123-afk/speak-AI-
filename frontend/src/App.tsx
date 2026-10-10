import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { ButtonLink, Spinner } from './components/ui';
import { useMe } from './lib/queries';
import type { User } from './lib/types';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { MockTestPage } from './pages/MockTest';
import { PracticePage } from './pages/Practice';

function RequireUser({ children }: { children: (user: User) => ReactElement }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <div className="container-page py-20"><Spinner label="Loading" /></div>;
  if (!user) return <Navigate to={`/signup?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children(user);
}

function NotFound() {
  return (
    <div className="container-page py-28 text-center">
      <p className="font-display text-7xl text-signal">404</p>
      <h1 className="mt-4 text-3xl font-medium">This page doesn’t exist.</h1>
      <ButtonLink to="/" className="mt-8">Go home</ButtonLink>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="practice" element={<RequireUser>{() => <PracticePage />}</RequireUser>} />
        <Route path="mock-test" element={<RequireUser>{user => <MockTestPage user={user} />}</RequireUser>} />
        <Route path="dashboard" element={<RequireUser>{user => <Dashboard user={user} />}</RequireUser>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
