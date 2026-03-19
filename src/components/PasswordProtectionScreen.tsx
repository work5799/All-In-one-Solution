import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import {
  verifyPagePassword,
  unlockPageInSession,
  LOCKABLE_PAGES,
  type LockablePageId,
} from "@/lib/pageLock";

interface PasswordProtectionScreenProps {
  pageId: string;
  onUnlock?: () => void;
}

export default function PasswordProtectionScreen({ pageId, onUnlock }: PasswordProtectionScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const pageInfo = LOCKABLE_PAGES.find((page) => page.id === pageId);
  const pageTitle = pageInfo?.label || "Protected Page";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Simulate a small delay for better UX
    await new Promise((resolve) => setTimeout(resolve, 300));

    const isValid = await verifyPagePassword(pageId, password);

    if (isValid) {
      setSuccess(true);
      unlockPageInSession(pageId);
      
      // Delay navigation to show success state
      setTimeout(() => {
        if (onUnlock) {
          onUnlock();
        } else {
          // Navigate to the requested page
          const pageInfo = LOCKABLE_PAGES.find((p) => p.id === pageId);
          if (pageInfo) {
            navigate(pageInfo.path, { replace: true });
          } else {
            // Go back to where the user came from, or home
            const from = location.state?.from?.pathname || "/";
            navigate(from, { replace: true });
          }
        }
      }, 800);
    } else {
      setError("Incorrect password. Please try again.");
      setPassword("");
    }

    setIsLoading(false);
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/50 shadow-xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Page Protected</CardTitle>
            <CardDescription className="text-base">
              {pageTitle} requires authentication
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 text-green-600 dark:text-green-500"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Access granted! Redirecting...</span>
                </motion.div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Enter Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter the access password"
                        className="pl-10"
                        autoFocus
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-red-500">
                          {error}
                        </AlertDescription>
                      </Alert>
                    </motion.div>
                  )}

                  <div className="text-xs text-muted-foreground text-center">
                    Contact the administrator if you don't have the password.
                  </div>
                </>
              )}
            </CardContent>

            {!success && (
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!password.trim() || isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Unlock Page"
                  )}
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleGoBack}
                  className="w-full"
                  disabled={isLoading}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          This page is protected by administrator settings.
        </p>
      </motion.div>
    </div>
  );
}
