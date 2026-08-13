import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { TemplateWorkspace } from '../../components/template-workspace';
export default function Page() { return <LoginGate><DashboardShell><TemplateWorkspace /></DashboardShell></LoginGate>; }
