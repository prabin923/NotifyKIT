import { DashboardShell } from '../components/dashboard-shell';
import { LoginGate } from '../components/login-gate';
import { OverviewPanel } from '../components/overview';
export default function Page() { return <LoginGate><DashboardShell><OverviewPanel /></DashboardShell></LoginGate>; }
