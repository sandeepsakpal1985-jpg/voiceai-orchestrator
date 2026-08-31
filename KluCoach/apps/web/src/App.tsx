import { Route, Routes } from "react-router-dom";
import { LoginPage } from "./auth/LoginPage";
import { AcceptInvitePage } from "./auth/AcceptInvitePage";
import { AppShell } from "./layout/AppShell";
import { ParentDashboard } from "./dashboard/ParentDashboard";
import { StudentDashboard } from "./dashboard/StudentDashboard";
import { AdminDashboard } from "./dashboard/AdminDashboard";
import { StudentsPage } from "./students/StudentsPage";
import { AttendancePage } from "./attendance/AttendancePage";
import { AssessmentsPage } from "./assessments/AssessmentsPage";
import { NoticesPage } from "./notices/NoticesPage";
import { ImportPage } from "./reports/ImportPage";
import { TimetablePage } from "./timetable/TimetablePage";
import { BatchesPage } from "./batches/BatchesPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<div />} />
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/assessments" element={<AssessmentsPage />} />
        <Route path="/notices" element={<NoticesPage />} />
        <Route path="/timetable" element={<TimetablePage />} />
        <Route path="/import" element={<ImportPage />} />
      </Route>
    </Routes>
  );
}

