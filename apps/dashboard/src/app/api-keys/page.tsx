import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { ApiKeyWorkspace } from '../../components/api-key-workspace';
export default function Page() { return <LoginGate><DashboardShell><ApiKeyWorkspace /></DashboardShell></LoginGate>; }
