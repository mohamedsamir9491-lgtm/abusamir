import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Login, ChangePassword } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Clients, ClientDetail } from './pages/Clients';
import { Engagements, EngagementDetail } from './pages/Engagements';
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

export default function App() {
  return <AuthProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/change-password" element={<ChangePassword />} />
    <Route element={<Layout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/clients" element={<Clients />} /><Route path="/clients/:id" element={<ClientDetail />} />
      <Route path="/engagements" element={<Engagements />} /><Route path="/engagements/:id" element={<EngagementDetail />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/imports" element={<ImportsList />} /><Route path="/imports/:id" element={<ImportJob />} />
      <Route path="/trial-balance" element={<TrialBalance />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/ai" element={<AIPage />} />
      <Route path="/findings" element={<Findings />} />
      <Route path="/reports" element={<Reports />} /><Route path="/reports/:id" element={<ReportEditor />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/office" element={<Office />} />
      <Route path="/users" element={<Users />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/system" element={<System />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></ToastProvider></AuthProvider>;
}
