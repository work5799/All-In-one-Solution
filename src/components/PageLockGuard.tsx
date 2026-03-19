import { useState, useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import PasswordProtectionScreen from "@/components/PasswordProtectionScreen";
import { isPageLocked, isPageUnlockedInSession, LOCKABLE_PAGES, getPageLockConfig } from "@/lib/pageLock";

interface PageLockGuardProps {
  children: React.ReactNode;
  pageId: string;
}

export default function PageLockGuard({ children, pageId }: PageLockGuardProps) {
  const location = useLocation();
  const [showPasswordScreen, setShowPasswordScreen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [lockConfig, setLockConfig] = useState<{ enabled: boolean; lockedPages: string[] } | null>(null);

  useEffect(() => {
    // Check if page is locked
    const checkLock = async () => {
      try {
        // Get fresh config from storage (may have been updated in another tab/browser)
        const config = await getPageLockConfig();
        setLockConfig(config);
        
        const locked = config.enabled && config.lockedPages.includes(pageId);
        const alreadyUnlocked = isPageUnlockedInSession(pageId);

        if (locked && !alreadyUnlocked) {
          setShowPasswordScreen(true);
        } else {
          setShowPasswordScreen(false);
        }
      } catch (error) {
        console.error("Error checking page lock:", error);
        setShowPasswordScreen(false);
      } finally {
        setIsChecking(false);
      }
    };
    
    checkLock();
    
    // Re-check when storage changes (for cross-tab updates)
    const handleStorageChange = () => {
      checkLock();
    };
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleStorageChange);
    
    // Poll for updates every 5 seconds (for cross-browser sync with Supabase)
    const pollInterval = setInterval(checkLock, 5000);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleStorageChange);
      clearInterval(pollInterval);
    };
  }, [pageId, location.pathname]);

  // While checking, show nothing (prevent flash)
  if (isChecking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show password screen if page is locked and not unlocked
  if (showPasswordScreen) {
    return <PasswordProtectionScreen pageId={pageId} onUnlock={() => setShowPasswordScreen(false)} />;
  }

  // Page is unlocked or not locked, render children
  return <>{children}</>;
}

// Helper to get page ID from path
export const getPageIdFromPath = (pathname: string): string | null => {
  const page = LOCKABLE_PAGES.find((p) => {
    if (p.path === "/") {
      return pathname === "/" || pathname === "";
    }
    return pathname.includes(p.path);
  });
  return page?.id || null;
};

// HOC version for easier usage
export function withPageLock<P extends object>(
  Component: React.ComponentType<P>,
  pageId: string
) {
  return function PageLockedComponent(props: P) {
    return (
      <PageLockGuard pageId={pageId}>
        <Component {...props} />
      </PageLockGuard>
    );
  };
}
