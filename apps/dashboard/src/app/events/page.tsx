import { DashboardShell } from '../../components/dashboard-shell';
import { EventWorkspace } from '../../components/event-workspace';
import { LoginGate } from '../../components/login-gate';

export default function Page() {
  return <LoginGate><DashboardShell><EventWorkspace /></DashboardShell></LoginGate>;
}
