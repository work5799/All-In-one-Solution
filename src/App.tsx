import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import Index from "./pages/Index";
import ImageOptimizer from "./pages/ImageOptimizer";
import VideoOptimizer from "./pages/VideoOptimizer";
import WatermarkPage from "./pages/WatermarkPage";
import ImageResizer from "./pages/ImageResizer";
import ColorChanger from "./pages/ColorChanger";
import ImageCropper from "./pages/ImageCropper";
import History from "./pages/History";
import SettingsPage from "./pages/SettingsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import LogoColorChanger from "./pages/LogoColorChanger";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import TextTransformer from "./pages/TextTransformer";
import { HistoryProvider } from "./contexts/HistoryContext";
import { AuthGuard } from "./components/AuthGuard";
import PageLockGuard from "./components/PageLockGuard";

const AUTH_KEY = "imgopt_auth";

const queryClient = new QueryClient();

// Check if user is authenticated
const isAuthenticated = () => typeof window !== 'undefined' && localStorage.getItem(AUTH_KEY) === 'true';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Public route - redirect to dashboard if already logged in
function PublicRoute({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// Page with lock protection wrapper
function PageWithLock({ children, pageId }: { children: React.ReactNode; pageId: string }) {
  return (
    <PageLockGuard pageId={pageId}>
      {children}
    </PageLockGuard>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HistoryProvider>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            {/* Login page - public but redirects if already logged in */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

            {/* Admin Settings page - requires authentication */}
            <Route path="/admin-settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />

            {/* Public routes - accessible without login, with optional page lock */}
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<PageWithLock pageId="dashboard"><Index /></PageWithLock>} />
              <Route path="image-optimizer/*" element={<PageWithLock pageId="image-optimizer"><ImageOptimizer /></PageWithLock>} />
              <Route path="video-optimizer/*" element={<PageWithLock pageId="video-optimizer"><VideoOptimizer /></PageWithLock>} />
              <Route path="watermark/*" element={<PageWithLock pageId="watermark"><WatermarkPage /></PageWithLock>} />
              <Route path="color-changer/*" element={<PageWithLock pageId="color-changer"><ColorChanger /></PageWithLock>} />
              <Route path="image-cropper/*" element={<PageWithLock pageId="image-cropper"><ImageCropper /></PageWithLock>} />
              <Route path="image-resizer/*" element={<PageWithLock pageId="image-resizer"><ImageResizer /></PageWithLock>} />
              <Route path="text-transformer/*" element={<PageWithLock pageId="text-transformer"><TextTransformer /></PageWithLock>} />
              <Route path="history/*" element={<PageWithLock pageId="history"><History /></PageWithLock>} />
              {/* Settings page - requires authentication */}
              <Route path="settings/*" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </HistoryProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
