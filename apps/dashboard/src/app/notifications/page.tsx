import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { NotificationWorkspace } from '../../components/notification-workspace';
export default function Page() { return <LoginGate><DashboardShell><NotificationWorkspace /></DashboardShell></LoginGate>; }
