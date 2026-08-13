import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { WebhookWorkspace } from '../../components/webhook-workspace';
export default function Page() { return <LoginGate><DashboardShell><WebhookWorkspace /></DashboardShell></LoginGate>; }
