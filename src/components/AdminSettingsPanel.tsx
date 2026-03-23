import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Lock,
  Unlock,
  Key,
  Save,
  RotateCcw,
  Users,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Search,
  Trash2,
  UserX,
  Settings,
  Shield,
  Activity,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  LockOpen,
  Fingerprint,
  UserCog,
  Database,
  RefreshCw,
  User,
  ExternalLink,
} from "lucide-react";
import {
  LOCKABLE_PAGES,
  getPageLockConfig,
  getPageLockSyncStatus,
  setPageLockEnabled,
  isPageLocked,
  togglePageLock,
  getMasterPassword,
  setMasterPassword,
  getPagePassword,
  setPagePassword,
  DEFAULT_PAGE_LOCK_CONFIG,
  type PageLockConfig,
  removePagePassword,
  generateConfigUrl,
} from "@/lib/pageLock";
import {
  getMemberLimits,
  saveMemberLimits,
  getMemberLimitsConfig,
  saveMemberLimitsConfig,
  getAllUsersUsage,
  adminResetUserUsage,
  adminResetAllUsage,
  getUsageAnalytics,
  SERVICE_KEYS,
  SERVICE_LABELS,
  type ServiceKey,
  type MemberLimits,
  type UserUsageStats,
} from "@/lib/memberLimitsEnhanced";

export default function AdminSettingsPanel() {
  const [activeTab, setActiveTab] = useState("page-access");

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-8">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-foreground">Admin Settings</h1>
        <p className="text-muted-foreground mt-1">Control page access, passwords, and usage limits</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="login" className="gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Login</span>
          </TabsTrigger>
          <TabsTrigger value="page-access" className="gap-2">
            <Lock className="w-4 h-4" />
            <span className="hidden sm:inline">Access</span>
          </TabsTrigger>
          <TabsTrigger value="passwords" className="gap-2">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="usage-limits" className="gap-2">
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Limits</span>
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Members</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login" className="space-y-4 mt-6">
          <LoginCredentialsManagement />
        </TabsContent>

        <TabsContent value="page-access" className="space-y-4 mt-6">
          <PageAccessControl />
        </TabsContent>

        <TabsContent value="passwords" className="space-y-4 mt-6">
          <PasswordManagement />
        </TabsContent>

        <TabsContent value="usage-limits" className="space-y-4 mt-6">
          <UsageLimitSettings />
        </TabsContent>

        <TabsContent value="members" className="space-y-4 mt-6">
          <MemberManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Login Credentials Management
function LoginCredentialsManagement() {
  const [credentials, setCredentials] = useState(() => {
    const saved = localStorage.getItem("imgopt_credentials");
    return saved ? JSON.parse(saved) : { username: "admin", password: "admin123" };
  });
  const [demoCredentials, setDemoCredentials] = useState(() => {
    const saved = localStorage.getItem("imgopt_demo_credentials");
    return saved ? JSON.parse(saved) : { username: "demo", password: "demo123" };
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showDemoPassword, setShowDemoPassword] = useState(false);
  const [newUsername, setNewUsername] = useState(credentials.username);
  const [newPassword, setNewPassword] = useState(credentials.password);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newDemoUsername, setNewDemoUsername] = useState(demoCredentials.username);
  const [newDemoPassword, setNewDemoPassword] = useState(demoCredentials.password);
  const [confirmDemoPassword, setConfirmDemoPassword] = useState("");
  const [error, setError] = useState("");
  const [demoError, setDemoError] = useState("");

  const handleSaveReal = () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      setError("Username and password are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    const newCredentials = { username: newUsername.trim(), password: newPassword };
    localStorage.setItem("imgopt_credentials", JSON.stringify(newCredentials));
    setCredentials(newCredentials);
    setError("");
    toast.success("Real login credentials updated successfully");
  };

  const handleSaveDemo = () => {
    if (!newDemoUsername.trim() || !newDemoPassword.trim()) {
      setDemoError("Username and password are required");
      return;
    }
    if (newDemoPassword !== confirmDemoPassword) {
      setDemoError("Passwords do not match");
      return;
    }
    if (newDemoPassword.length < 4) {
      setDemoError("Password must be at least 4 characters");
      return;
    }

    const newDemo = { username: newDemoUsername.trim(), password: newDemoPassword };
    localStorage.setItem("imgopt_demo_credentials", JSON.stringify(newDemo));
    setDemoCredentials(newDemo);
    setDemoError("");
    toast.success("Demo login credentials updated successfully");
  };

  const handleResetReal = () => {
    const defaultCredentials = { username: "admin", password: "admin123" };
    localStorage.setItem("imgopt_credentials", JSON.stringify(defaultCredentials));
    setCredentials(defaultCredentials);
    setNewUsername(defaultCredentials.username);
    setNewPassword(defaultCredentials.password);
    setConfirmPassword("");
    toast.success("Real credentials reset to defaults");
  };

  const handleResetDemo = () => {
    const defaultDemo = { username: "demo", password: "demo123" };
    localStorage.setItem("imgopt_demo_credentials", JSON.stringify(defaultDemo));
    setDemoCredentials(defaultDemo);
    setNewDemoUsername(defaultDemo.username);
    setNewDemoPassword(defaultDemo.password);
    setConfirmDemoPassword("");
    toast.success("Demo credentials reset to defaults");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Real Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Real Login Credentials
          </CardTitle>
          <CardDescription>
            These are the actual admin credentials used for logging in. Keep these secure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Credentials Display */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">Current Real Credentials:</p>
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline" className="font-mono">
                Username: {credentials.username}
              </Badge>
              <Badge variant="outline" className="font-mono">
                Password: {showPassword ? credentials.password : "••••••••"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="h-8 w-8"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Change Credentials Form */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newUsername">New Username</Label>
              <Input
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter new username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleResetReal} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
          <Button onClick={handleSaveReal} className="gap-2">
            <Save className="w-4 h-4" />
            Save Real Credentials
          </Button>
        </CardFooter>
      </Card>

      {/* Demo Credentials */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Demo Login Credentials
          </CardTitle>
          <CardDescription>
            These credentials will be shown on the login page for demo purposes. Other users will see these instead of the real admin credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Demo Credentials Display */}
          <div className="rounded-lg bg-primary/10 p-4 space-y-2">
            <p className="text-sm font-medium">Current Demo Credentials (shown on login page):</p>
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="default" className="font-mono bg-primary">
                Username: {demoCredentials.username}
              </Badge>
              <Badge variant="default" className="font-mono bg-primary">
                Password: {showDemoPassword ? demoCredentials.password : "••••••••"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDemoPassword(!showDemoPassword)}
                className="h-8 w-8"
              >
                {showDemoPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Change Demo Credentials Form */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newDemoUsername">Demo Username</Label>
              <Input
                id="newDemoUsername"
                value={newDemoUsername}
                onChange={(e) => setNewDemoUsername(e.target.value)}
                placeholder="Enter demo username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newDemoPassword">Demo Password</Label>
              <Input
                id="newDemoPassword"
                type="password"
                value={newDemoPassword}
                onChange={(e) => setNewDemoPassword(e.target.value)}
                placeholder="Enter demo password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmDemoPassword">Confirm Demo Password</Label>
            <Input
              id="confirmDemoPassword"
              type="password"
              value={confirmDemoPassword}
              onChange={(e) => setConfirmDemoPassword(e.target.value)}
              placeholder="Confirm demo password"
            />
          </div>

          {demoError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{demoError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleResetDemo} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Default (demo/demo123)
          </Button>
          <Button onClick={handleSaveDemo} className="gap-2">
            <Save className="w-4 h-4" />
            Save Demo Credentials
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}

// Page Access Control
function PageAccessControl() {
  const [config, setConfig] = useState<PageLockConfig>(DEFAULT_PAGE_LOCK_CONFIG);
  const [pageLockStates, setPageLockStates] = useState<Record<string, boolean>>({});
  const [syncStatus, setSyncStatus] = useState(() => getPageLockSyncStatus());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      const loadedConfig = await getPageLockConfig();
      setConfig(loadedConfig);
      setSyncStatus(getPageLockSyncStatus());
      
      const states: Record<string, boolean> = {};
      for (const page of LOCKABLE_PAGES) {
        states[page.id] = loadedConfig.lockedPages.includes(page.id);
      }
      setPageLockStates(states);
      setLoading(false);
    };
    loadConfig();
  }, []);

  const handleToggleMasterLock = async (enabled: boolean) => {
    await setPageLockEnabled(enabled);
    const newConfig = await getPageLockConfig();
    setConfig(newConfig);
    setSyncStatus(getPageLockSyncStatus());
    toast.success(enabled ? "Page lock enabled" : "Page lock disabled");
  };

  const handleTogglePageLock = async (pageId: string, locked: boolean) => {
    await togglePageLock(pageId, locked);
    const newConfig = await getPageLockConfig();
    setConfig(newConfig);
    setSyncStatus(getPageLockSyncStatus());
    
    setPageLockStates((prev) => ({
      ...prev,
      [pageId]: locked,
    }));
    
    const page = LOCKABLE_PAGES.find((p) => p.id === pageId);
    toast.success(locked ? `${page?.label} locked` : `${page?.label} unlocked`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {syncStatus === "local" ? (
        <Alert className="border-warning/30 bg-warning/5">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm">
            Shared page lock sync is not configured. Right now locks only apply in this browser. To lock pages for everyone, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the app, or connect the same Supabase project on every browser.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Global page lock sync is active via {syncStatus === "supabase-env" ? "shared app Supabase config" : "browser Supabase config"}.
          </AlertDescription>
        </Alert>
      )}

      {/* Status Banner */}
      <div className={`rounded-xl border p-4 ${config.enabled ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/30"}`}>
        <div className="flex items-center gap-3">
          {config.enabled ? <LockOpen className="h-5 w-5 text-green-600" /> : <Lock className="h-5 w-5 text-muted-foreground" />}
          <div className="flex-1">
            <p className={`font-medium ${config.enabled ? "text-green-700" : ""}`}>
              {config.enabled ? "System Active" : "System Inactive"}
            </p>
            <p className="text-sm text-muted-foreground">
              {config.enabled
                ? `${config.lockedPages.length} pages protected${syncStatus === "local" ? " in this browser" : " for all visitors"}`
                : "Enable to protect pages"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{syncStatus === "local" ? "Local Only" : "Global Sync"}</Badge>
            <Badge variant={config.enabled ? "default" : "secondary"}>{config.enabled ? "Active" : "Off"}</Badge>
          </div>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Master Lock</CardTitle>
                  <CardDescription>Global password protection</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${config.enabled ? "text-green-600" : "text-muted-foreground"}`}>
                  {config.enabled ? "ON" : "OFF"}
                </span>
                <Switch checked={config.enabled} onCheckedChange={handleToggleMasterLock} />
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Pages Grid */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Protected Pages</CardTitle>
            <CardDescription>Select pages to protect</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LOCKABLE_PAGES.map((page) => {
                const isLocked = pageLockStates[page.id];
                return (
                  <div
                    key={page.id}
                    className={`rounded-lg border-2 p-3 cursor-pointer transition-all ${isLocked ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20"}`}
                    onClick={() => handleTogglePageLock(page.id, !isLocked)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isLocked ? <Lock className="w-4 h-4 text-primary" /> : <Unlock className="w-4 h-4 text-muted-foreground" />}
                        <span className="font-medium text-sm">{page.label}</span>
                      </div>
                      <Switch
                        checked={isLocked}
                        onCheckedChange={(checked) => {
                          event?.stopPropagation();
                          handleTogglePageLock(page.id, checked);
                        }}
                        disabled={!config.enabled}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{page.path}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Share Config URL - For applying settings to all users without backend */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Share Settings URL
          </CardTitle>
          <CardDescription>
            Generate a URL with current settings. Share this URL so others get the same protected pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={() => {
              const url = generateConfigUrl(config);
              navigator.clipboard.writeText(url);
              toast.success("Config URL copied! Share this URL with users.");
            }} 
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Generate & Copy Share URL
          </Button>
          <p className="text-xs text-muted-foreground">
            Users who open this URL will see the same protected pages as configured here.
          </p>
        </CardContent>
      </Card>

      {/* Info Alert */}
      {config.enabled && config.lockedPages.length > 0 && (
        <Alert className="border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            {config.lockedPages.length} pages protected. Set passwords in Security tab.
          </AlertDescription>
        </Alert>
      )}
    </motion.div>
  );
}

// Password Management
function PasswordManagement() {
  const [masterPassword, setMasterPasswordState] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [pagePasswords, setPagePasswords] = useState<Record<string, string>>({});
  const [editingPage, setEditingPage] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [syncStatus, setSyncStatus] = useState(() => getPageLockSyncStatus());

  useEffect(() => {
    const loadPasswords = async () => {
      const currentMaster = await getMasterPassword();
      setMasterPasswordState(currentMaster);
      setSyncStatus(getPageLockSyncStatus());

      const passwords: Record<string, string> = {};
      for (const page of LOCKABLE_PAGES) {
        const pwd = await getPagePassword(page.id);
        if (pwd !== currentMaster) {
          passwords[page.id] = pwd;
        }
      }

      setPagePasswords(passwords);
    };

    void loadPasswords();
  }, []);

  const handleSaveMasterPassword = async () => {
    if (masterPassword.length < 4) {
      toast.error("Minimum 4 characters");
      return;
    }
    if (masterPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    await setMasterPassword(masterPassword);
    setSyncStatus(getPageLockSyncStatus());
    toast.success("Password updated");
    setConfirmPassword("");
  };

  const handleSetPagePassword = async (pageId: string) => {
    if (tempPassword.length < 4) {
      toast.error("Minimum 4 characters");
      return;
    }
    await setPagePassword(pageId, tempPassword);
    setSyncStatus(getPageLockSyncStatus());
    setPagePasswords((prev) => ({ ...prev, [pageId]: tempPassword }));
    setEditingPage(null);
    setTempPassword("");
    const page = LOCKABLE_PAGES.find((p) => p.id === pageId);
    toast.success(`Password set for ${page?.label}`);
  };

  const handleRemovePagePassword = async (pageId: string) => {
    await removePagePassword(pageId);
    setSyncStatus(getPageLockSyncStatus());
    setPagePasswords((prev) => {
      const updated = { ...prev };
      delete updated[pageId];
      return updated;
    });
    const page = LOCKABLE_PAGES.find((p) => p.id === pageId);
    toast.success(`${page?.label} uses master password`);
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 12 }} className="space-y-4">
      {/* Security Notice */}
      <Alert className="border-warning/30 bg-warning/5">
        <AlertCircle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-sm">
          {syncStatus === "local"
            ? "Passwords are stored only in this browser until shared page-lock Supabase sync is configured."
            : "Passwords are synced through Supabase, so locked pages work the same across browsers."}
        </AlertDescription>
      </Alert>

      {/* Master Password */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Fingerprint className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Master Password</CardTitle>
                <CardDescription>Default for all locked pages</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm">New Password</Label>
                <div className="relative">
                  <Input
                    type={showPasswords["master"] ? "text" : "password"}
                    value={masterPassword}
                    onChange={(e) => setMasterPasswordState(e.target.value)}
                    placeholder="Enter password"
                    className="pr-10 font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility("master")}
                  >
                    {showPasswords["master"] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Confirm</Label>
                <div className="relative">
                  <Input
                    type={showPasswords["confirm"] ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="pr-10 font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full w-10 hover:bg-transparent"
                    onClick={() => togglePasswordVisibility("confirm")}
                  >
                    {showPasswords["confirm"] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={handleSaveMasterPassword} className="gap-2">
              <Save className="w-4 h-4" />
              Update
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Page Passwords */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Page Passwords</CardTitle>
                <CardDescription>Custom passwords per page</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {LOCKABLE_PAGES.map((page) => {
              const hasCustomPassword = page.id in pagePasswords;
              const isEditing = editingPage === page.id;

              return (
                <div
                  key={page.id}
                  className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${hasCustomPassword ? "border-primary/30 bg-primary/5" : "border-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{page.label}</span>
                    {hasCustomPassword ? (
                      <Badge className="bg-primary text-primary-foreground text-xs">Custom</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Master</Badge>
                    )}
                  </div>
                  
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                        placeholder="Password"
                        className="w-32 h-8 font-mono text-sm"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleSetPagePassword(page.id)} className="h-8">
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPage(null)} className="h-8">
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={hasCustomPassword ? "outline" : "default"}
                        onClick={() => {
                          setEditingPage(page.id);
                          setTempPassword(pagePasswords[page.id] || "");
                        }}
                        className="h-8"
                      >
                        {hasCustomPassword ? "Edit" : "Set"}
                      </Button>
                      {hasCustomPassword && (
                        <Button size="sm" variant="ghost" onClick={() => handleRemovePagePassword(page.id)} className="h-8 hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}

// Usage Limit Settings
function UsageLimitSettings() {
  const [limits, setLimits] = useState<MemberLimits>(() => getMemberLimits());
  const [config, setConfig] = useState(() => getMemberLimitsConfig());
  const [hasChanges, setHasChanges] = useState(false);

  const handleUpdateServiceLimit = (service: ServiceKey, value: number) => {
    setLimits((prev) => ({
      ...prev,
      serviceLimits: { ...prev.serviceLimits, [service]: Math.max(0, Math.floor(value)) },
    }));
    setHasChanges(true);
  };

  const handleUpdateDownloadLimit = (value: number) => {
    setLimits((prev) => ({ ...prev, downloadLimit: Math.max(0, Math.floor(value)) }));
    setHasChanges(true);
  };

  const handleToggleConfig = (key: keyof typeof config, value: boolean | number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMemberLimits(limits);
    saveMemberLimitsConfig(config);
    toast.success("Limits saved");
    setHasChanges(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 12 }} className="space-y-4">
      {/* Config Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${config.enabled ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Usage Limits</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${config.enabled ? "text-primary" : "text-muted-foreground"}`}>
                  {config.enabled ? "On" : "Off"}
                </span>
                <Switch checked={config.enabled} onCheckedChange={(v) => handleToggleConfig("enabled", v)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <Clock className={`h-4 w-4 ${config.dailyResetEnabled ? "text-info" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Daily Reset</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${config.dailyResetEnabled ? "text-info" : "text-muted-foreground"}`}>
                  {config.dailyResetEnabled ? "On" : "Off"}
                </span>
                <Switch checked={config.dailyResetEnabled} onCheckedChange={(v) => handleToggleConfig("dailyResetEnabled", v)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardHeader className="py-3">
              <div className="flex items-center gap-2">
                <Database className={`h-4 w-4 ${config.perServiceLimits ? "text-secondary-foreground" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">Per-Service</span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${config.perServiceLimits ? "text-secondary-foreground" : "text-muted-foreground"}`}>
                  {config.perServiceLimits ? "On" : "Off"}
                </span>
                <Switch checked={config.perServiceLimits} onCheckedChange={(v) => handleToggleConfig("perServiceLimits", v)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Service Limits */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">Daily Limits</CardTitle>
              </div>
              <Button onClick={handleSave} disabled={!hasChanges} className={`gap-2 ${hasChanges ? "" : "opacity-50"}`}>
                <Save className="w-4 h-4" />
                Save
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            {SERVICE_KEYS.map((service) => {
              const serviceLimit = limits.serviceLimits[service];
              const serviceLabel = !config.enabled || serviceLimit >= 999999 ? "Unlimited" : `${serviceLimit}/day`;

              return (
                <div key={service} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{SERVICE_LABELS[service]}</Label>
                    <Badge variant="outline" className="font-mono text-xs">{serviceLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[limits.serviceLimits[service]]}
                      onValueChange={([v]) => handleUpdateServiceLimit(service, v)}
                      min={0}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={limits.serviceLimits[service]}
                      onChange={(e) => handleUpdateServiceLimit(service, Number(e.target.value))}
                      className="w-20 font-mono text-center"
                    />
                  </div>
                </div>
              );
            })}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Downloads</Label>
                <Badge variant="outline" className="font-mono text-xs">
                    {!config.enabled || limits.downloadLimit >= 999999 ? "Unlimited" : `${limits.downloadLimit}/day`}
                  </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[limits.downloadLimit]}
                  onValueChange={([v]) => handleUpdateDownloadLimit(v)}
                  min={0}
                  max={500}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  max={5000}
                  value={limits.downloadLimit}
                  onChange={(e) => handleUpdateDownloadLimit(Number(e.target.value))}
                  className="w-20 font-mono text-center"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="border-t py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Resets at midnight
            </p>
          </CardFooter>
        </Card>
      </div>
    </motion.div>
  );
}

// Member Management
function MemberManagement() {
  const [users, setUsers] = useState<UserUsageStats[]>([]);
  const [analytics, setAnalytics] = useState<ReturnType<typeof getUsageAnalytics> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const loadData = () => {
    setUsers(getAllUsersUsage());
    setAnalytics(getUsageAnalytics());
  };

  useEffect(() => { loadData(); }, []);

  const handleResetUser = (userId: string) => {
    adminResetUserUsage(userId);
    toast.success(`Reset for ${userId}`);
    setResetDialogOpen(false);
    setSelectedUser(null);
    loadData();
  };

  const handleResetAll = () => {
    const count = adminResetAllUsage();
    toast.success(`Reset ${count} users`);
    loadData();
  };

  const filteredUsers = users.filter((u) => u.userId.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 12 }} className="space-y-4">
      {/* Stats */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Card className="border-0 shadow-none">
              <CardHeader className="py-3">
                <span className="text-xs text-muted-foreground">Total</span>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold">{analytics.totalUsers}</p>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Card className="border-0 shadow-none">
              <CardHeader className="py-3">
                <span className="text-xs text-muted-foreground">Active</span>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold text-green-600">{analytics.activeUsers}</p>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Card className="border-0 shadow-none">
              <CardHeader className="py-3">
                <span className="text-xs text-muted-foreground">Inactive</span>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold text-muted-foreground">{analytics.inactiveUsers}</p>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Card className="border-0 shadow-none">
              <CardHeader className="py-3">
                <span className="text-xs text-muted-foreground">Avg</span>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-2xl font-bold text-primary">{analytics.averageUsage["ai-generator"] || 0}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Card className="border-0 shadow-none">
          <CardHeader className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-1.5">
                  <UserCog className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">Members</CardTitle>
                <Badge className="bg-primary text-primary-foreground text-xs">{filteredUsers.length}</Badge>
              </div>
              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Reset All
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset All Usage?</DialogTitle>
                    <DialogDescription>Cannot be undone.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleResetAll}>Reset</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">User</TableHead>
                    <TableHead className="font-semibold">AI Gen</TableHead>
                    <TableHead className="font-semibold">Watermark</TableHead>
                    <TableHead className="font-semibold">Downloads</TableHead>
                    <TableHead className="font-semibold">Last Reset</TableHead>
                    <TableHead className="font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No users</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.userId} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="font-mono text-sm">{user.userId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{user.serviceUsage["ai-generator"]}/{user.serviceLimits["ai-generator"]}</span>
                              <Badge variant={user.remaining["ai-generator"] === 0 ? "destructive" : "secondary"} className="text-xs">
                                {user.remaining["ai-generator"]} left
                              </Badge>
                            </div>
                            <Progress value={user.percentageUsed["ai-generator"]} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{user.serviceUsage["watermark-remover"]}/{user.serviceLimits["watermark-remover"]}</span>
                              <Badge variant={user.remaining["watermark-remover"] === 0 ? "destructive" : "secondary"} className="text-xs">
                                {user.remaining["watermark-remover"]} left
                              </Badge>
                            </div>
                            <Progress value={user.percentageUsed["watermark-remover"]} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{user.downloads}/{user.downloadLimit}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{new Date(user.lastResetDate).toLocaleDateString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedUser(user.userId); setResetDialogOpen(true); }} className="gap-1.5 h-8">
                            <RefreshCw className="w-3 h-3" />
                            Reset
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset User Dialog */}
      <Dialog open={resetDialogOpen && selectedUser !== null} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) setSelectedUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User?</DialogTitle>
            <DialogDescription>User: <span className="font-mono bg-muted px-2 py-0.5 rounded">{selectedUser}</span></DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetDialogOpen(false); setSelectedUser(null); }}>Cancel</Button>
            <Button onClick={() => selectedUser && handleResetUser(selectedUser)}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
