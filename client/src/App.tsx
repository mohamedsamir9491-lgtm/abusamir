import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Login, ChangePassword } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ClientsHub, ClientProfile } from './pages/ClientsHub';
import { FinanceClaims, FinancePayments, FinanceReceivables, FinanceRevenue, Letters } from './pages/Finance';
import { Tasks } from './pages/Tasks';
import { Engagements, EngagementDetail } from './pages/Engagements';
import { EngagementLetter } from './pages/EngagementLetter';
import { Consolidation } from './pages/Consolidation';
import { UploadPage } from './pages/Upload';
import { ImportsList, ImportJob } from './pages/Imports';
import { TrialBalance } from './pages/TrialBalance';
import { Analysis } from './pages/Analysis';
import { AIPage } from './pages/AI';
import { Findings } from './pages/Findings';
import { Reports, ReportEditor } from './pages/Reports';
import { Templates } from './pages/Templates';
import { Office } from './pages/Office';
import { Users } from './pages/Users';
import { Audit } from './pages/Audit';
import { System } from './pages/System';
import { Official } from './pages/Official';
import { Requests } from './pages/Requests';
import { Valuation } from './pages/Valuation';
import { Cleanup } from './pages/Cleanup';

export default function App() {
  return <AuthProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/change-password" element={<ChangePassword />} />
    <Route element={<Layout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/clients" element={<ClientsHub />} /><Route path="/clients/:id" element={<ClientProfile />} />
      <Route path="/tasks" element={<Tasks />} /><Route path="/letters" element={<Letters />} />
      <Route path="/finance/claims" element={<FinanceClaims />} /><Route path="/finance/payments" element={<FinancePayments />} /><Route path="/finance/receivables" element={<FinanceReceivables />} /><Route path="/finance/revenue" element={<FinanceRevenue />} />
      <Route path="/engagements" element={<Engagements />} /><Route path="/engagements/:id" element={<EngagementDetail />} /><Route path="/engagements/:id/letter" element={<EngagementLetter />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/official" element={<Official />} />
      <Route path="/requests" element={<Requests />} />
      <Route path="/valuation" element={<Valuation />} />
      <Route path="/imports" element={<ImportsList />} /><Route path="/imports/:id" element={<ImportJob />} />
      <Route path="/trial-balance" element={<TrialBalance />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/consolidation" element={<Consolidation />} />
      <Route path="/ai" element={<AIPage />} />
      <Route path="/findings" element={<Findings />} />
      <Route path="/reports" element={<Reports />} /><Route path="/reports/:id" element={<ReportEditor />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/office" element={<Office />} />
      <Route path="/users" element={<Users />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/system" element={<System />} />
      <Route path="/cleanup" element={<Cleanup />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></ToastProvider></AuthProvider>;
}
