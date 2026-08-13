import { DashboardShell } from '../../components/dashboard-shell';
import { LoginGate } from '../../components/login-gate';
import { WorkflowWorkspace } from '../../components/workflow-workspace';
export default function Page() { return <LoginGate><DashboardShell><WorkflowWorkspace /></DashboardShell></LoginGate>; }
