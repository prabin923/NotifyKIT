import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { UserWorkspace } from '../../components/user-workspace';

export default function Page() {
  return (
    <LoginGate>
      <DashboardShell>
        <UserWorkspace />
      </DashboardShell>
    </LoginGate>
  );
}
