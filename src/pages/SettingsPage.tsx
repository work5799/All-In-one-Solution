import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Save, Key, Eye, EyeOff, Plus, Trash2, ExternalLink, Lock, Mail, PlugZap, ShieldAlert, Minus, RotateCcw, Database, Settings, Users, BarChart3 } from "lucide-react";
import {
  SERVICE_KEYS,
  SERVICE_LABELS,
  type ServiceKey,
  type MemberLimits,
  type MemberUsage,
  getMemberLimits,
  saveMemberLimits,
  getCurrentUserId,
  getMemberUsage,
  resetMemberUsage,
} from "@/lib/memberLimits";
import {
  type SupabaseTempConfig,
  getSupabaseTempConfig,
  saveSupabaseTempConfig,
  isSupabaseTempReady,
} from "@/lib/supabaseTempStorage";
import {
  DEFAULT_PROVIDER_APIS,
  PROVIDER_DEFINITIONS,
  PROVIDER_MODELS,
  PROVIDER_STORAGE_KEY as API_STORAGE_KEY,
  type ProviderId,
} from "@/lib/aiProviders";
import {
  type ProviderSession,
  canLoginProviderSession,
  getProviderSessions,
  saveProviderSessions,
} from "@/lib/aiProviderSessions";

// API Configuration types
interface ApiConfig {
  id: string;
  name: string;
  key: string;
  endpoint: string;
  enabled: boolean;
  isEditing?: boolean;
}

const CREDENTIALS_KEY = "imgopt_credentials";
const RESET_EMAIL_KEY = "imgopt_reset_email";

// Default credentials
const DEFAULT_CREDENTIALS = {
  username: "admin",
  password: "admin123"
};

const normalizeApiConfigs = (incoming: ApiConfig[]) => {
  const normalized = Array.isArray(incoming)
    ? incoming
      .filter((api) => api && typeof api.id === "string")
      .map((api) => ({
        id: api.id,
        name: api.name || "Custom API",
        key: api.key || "",
        endpoint: api.endpoint || "",
        enabled: Boolean(api.enabled),
        isEditing: false,
      }))
    : [];

  const byId = new Map(normalized.map((api) => [api.id, api]));
  const mergedDefaults = DEFAULT_PROVIDER_APIS.map((base) => ({ ...base, ...(byId.get(base.id) || {}) }));
  const custom = normalized.filter((api) => !DEFAULT_PROVIDER_APIS.some((base) => base.id === api.id));
  return [...mergedDefaults, ...custom];
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [defaultQuality, setDefaultQuality] = useState(80);
  const [defaultFormat, setDefaultFormat] = useState("webp");
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(DEFAULT_PROVIDER_APIS);
  const [savedApiSignature, setSavedApiSignature] = useState(JSON.stringify(DEFAULT_PROVIDER_APIS));
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [memberLimits, setMemberLimits] = useState<MemberLimits>(() => getMemberLimits());
  const [savedLimitsSignature, setSavedLimitsSignature] = useState(() => JSON.stringify(getMemberLimits()));
  const [activeMember, setActiveMember] = useState(() => getCurrentUserId());
  const [memberUsage, setMemberUsage] = useState<MemberUsage>(() => getMemberUsage(getCurrentUserId()));
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseTempConfig>(() => getSupabaseTempConfig());
  const [savedSupabaseSignature, setSavedSupabaseSignature] = useState(() => JSON.stringify(getSupabaseTempConfig()));
  const [providerSessions, setProviderSessions] = useState<ProviderSession[]>(() => getProviderSessions());
  const [savedProviderSessionsSignature, setSavedProviderSessionsSignature] = useState(() => JSON.stringify(getProviderSessions()));

  // Load API configurations from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(API_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = normalizeApiConfigs(JSON.parse(saved));
        setApiConfigs(parsed);
        setSavedApiSignature(JSON.stringify(parsed));
      } catch (e) {
        console.error("Failed to parse saved API configs", e);
      }
    } else {
      const normalizedDefaults = normalizeApiConfigs(DEFAULT_PROVIDER_APIS);
      localStorage.setItem(API_STORAGE_KEY, JSON.stringify(normalizedDefaults));
      setApiConfigs(normalizedDefaults);
      setSavedApiSignature(JSON.stringify(normalizedDefaults));
    }
  }, []);

  useEffect(() => {
    const limits = getMemberLimits();
    const userId = getCurrentUserId();
    setMemberLimits(limits);
    setSavedLimitsSignature(JSON.stringify(limits));
    setActiveMember(userId);
    setMemberUsage(getMemberUsage(userId));
  }, []);

  useEffect(() => {
    const sessions = getProviderSessions();
    setProviderSessions(sessions);
    setSavedProviderSessionsSignature(JSON.stringify(sessions));
  }, []);

  const saveApiConfigs = () => {
    const normalized = normalizeApiConfigs(apiConfigs);
    localStorage.setItem(API_STORAGE_KEY, JSON.stringify(normalized));
    setApiConfigs(normalized);
    setSavedApiSignature(JSON.stringify(normalized));
    toast.success("API configurations saved");
  };

  const saveUsageLimits = () => {
    saveMemberLimits(memberLimits);
    setSavedLimitsSignature(JSON.stringify(memberLimits));
    toast.success("Usage limits saved");
  };

  const saveSupabaseConfigSettings = () => {
    saveSupabaseTempConfig(supabaseConfig);
    setSavedSupabaseSignature(JSON.stringify(supabaseConfig));
    toast.success("Supabase connection settings saved");
  };

  const saveProviderSessionSettings = () => {
    saveProviderSessions(providerSessions);
    setSavedProviderSessionsSignature(JSON.stringify(providerSessions));
    toast.success("Provider login sessions saved");
  };

  const reloadMemberUsage = () => {
    const userId = getCurrentUserId();
    setActiveMember(userId);
    setMemberUsage(getMemberUsage(userId));
  };

  const handleResetMemberUsage = () => {
    const userId = getCurrentUserId();
    const resetData = resetMemberUsage(userId);
    setActiveMember(userId);
    setMemberUsage(resetData);
    toast.success("Member usage counters reset");
  };

  // Toggle API key visibility
  const toggleKeyVisibility = (id: string) => {
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Update API configuration
  const updateApiConfig = (id: string, field: keyof ApiConfig, value: string | boolean) => {
    setApiConfigs((prev) =>
      prev.map((api) => (api.id === id ? { ...api, [field]: value } : api))
    );
  };

  // Add new API configuration
  const addApiConfig = () => {
    const newId = `custom_${Date.now()}`;
    const newApi: ApiConfig = {
      id: newId,
      name: "New API",
      key: "",
      endpoint: "",
      enabled: false
    };
    setApiConfigs((prev) => [...prev, newApi]);
  };

  // Remove API configuration
  const removeApiConfig = (id: string) => {
    setApiConfigs((prev) => prev.filter((api) => api.id !== id));
  };

  const updateServiceLimit = (service: ServiceKey, nextValue: number) => {
    setMemberLimits((prev) => ({
      ...prev,
      serviceLimits: {
        ...prev.serviceLimits,
        [service]: Math.max(0, Math.floor(nextValue)),
      },
    }));
  };

  const updateDownloadLimit = (nextValue: number) => {
    setMemberLimits((prev) => ({
      ...prev,
      downloadLimit: Math.max(0, Math.floor(nextValue)),
    }));
  };

  const updateSupabaseConfig = (patch: Partial<SupabaseTempConfig>) => {
    setSupabaseConfig((prev) => ({ ...prev, ...patch }));
  };

  const updateProviderSession = (
    providerId: ProviderId,
    field: keyof ProviderSession,
    value: string | boolean | null
  ) => {
    setProviderSessions((prev) =>
      prev.map((session) => (session.providerId === providerId ? { ...session, [field]: value } : session))
    );
  };

  const signInProviderSession = (providerId: ProviderId) => {
    if (!canLoginProviderSession(providerId)) {
      toast.error("Set up and lock the provider API configuration first, then sign in this provider session.");
      return;
    }
    const provider = PROVIDER_DEFINITIONS.find((entry) => entry.id === providerId);
    if (!provider) return;
    setProviderSessions((prev) =>
      prev.map((session) =>
        session.providerId === providerId
          ? {
            ...session,
            connected: true,
            accountLabel: session.accountLabel.trim() || provider.label,
            lastLoginAt: new Date().toISOString(),
          }
          : session
      )
    );
    toast.success(`${provider.label} login session connected`);
  };

  const signOutProviderSession = (providerId: ProviderId) => {
    const provider = PROVIDER_DEFINITIONS.find((entry) => entry.id === providerId);
    if (!provider) return;
    setProviderSessions((prev) =>
      prev.map((session) =>
        session.providerId === providerId
          ? { ...session, connected: false, lastLoginAt: null }
          : session
      )
    );
    toast.success(`${provider.label} login session disconnected`);
  };

  // Save all settings
  const handleSave = () => {
    localStorage.setItem("imgopt_quality", String(defaultQuality));
    localStorage.setItem("imgopt_format", defaultFormat);
    toast.success("Settings saved successfully!");
  };

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const enabledApiCount = apiConfigs.filter((api) => api.enabled).length;
  const hasPendingApiChanges = JSON.stringify(apiConfigs) !== savedApiSignature;
  const hasPendingLimitChanges = JSON.stringify(memberLimits) !== savedLimitsSignature;
  const hasPendingSupabaseChanges = JSON.stringify(supabaseConfig) !== savedSupabaseSignature;
  const hasPendingProviderSessionChanges = JSON.stringify(providerSessions) !== savedProviderSessionsSignature;

  const getEndpointHost = (endpoint: string) => {
    try {
      return new URL(endpoint).host;
    } catch {
      return "Not configured";
    }
  };

  // Load saved reset email
  useEffect(() => {
    const saved = localStorage.getItem(RESET_EMAIL_KEY);
    if (saved) setResetEmail(saved);
  }, []);

  // Handle password change
  const handlePasswordChange = async () => {
    // Get saved credentials
    const savedCreds = localStorage.getItem(CREDENTIALS_KEY);
    const creds = savedCreds ? JSON.parse(savedCreds) : DEFAULT_CREDENTIALS;

    // Verify current password
    if (currentPassword !== creds.password) {
      toast.error("Current password is incorrect");
      return;
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    // Check password length
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }

    // Save new credentials
    const newCreds = { ...creds, password: newPassword };
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(newCreds));

    // Clear form
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    toast.success("Password changed successfully!");
  };

  // Handle reset email save
  const handleResetEmailSave = () => {
    localStorage.setItem(RESET_EMAIL_KEY, resetEmail);
    toast.success("Reset email saved!");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your application preferences and account</p>
      </div>

      {/* Admin Settings Panel Link */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-gradient-to-r from-primary/10 via-card to-muted/50 shadow-sm overflow-hidden"
      >
        <Card className="border-0 shadow-none">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="rounded-md bg-primary/10 p-1.5">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  Admin Settings Panel
                </CardTitle>
                <CardDescription className="text-base">
                  Control page access, password protection, and daily usage limits for all members
                </CardDescription>
              </div>
              <Button onClick={() => navigate("/admin-settings")} size="lg" className="gap-2">
                <Settings className="w-4 h-4" />
                Open Admin Panel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Lock className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Page Access Control</p>
                  <p className="text-xs text-muted-foreground">Lock pages with passwords</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Password Management</p>
                  <p className="text-xs text-muted-foreground">Master & page-specific passwords</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Member Management</p>
                  <p className="text-xs text-muted-foreground">Usage limits & analytics</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Default Settings */}
      {/* Default Settings */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="bg-muted/30 px-6 py-3 border-b">
          <h2 className="font-semibold text-foreground">Default Preferences</h2>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-card-foreground block mb-2">Output Format</label>
            <Select value={defaultFormat} onValueChange={setDefaultFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webp">WebP</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-card-foreground block mb-2">
              Compression Quality: {defaultQuality}%
            </label>
            <Slider
              value={[defaultQuality]}
              onValueChange={([v]) => setDefaultQuality(v)}
              min={10}
              max={100}
              step={1}
            />
          </div>

          <Button
            onClick={handleSave}
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            Save Preferences
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.21 }}
        className="rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="relative border-b bg-gradient-to-r from-primary/10 via-card to-muted/60 px-6 py-5">
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <Lock className="h-4 w-4" />
                </div>
                <h2 className="font-semibold text-foreground">Provider Login Sessions</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Keep your API setup and add a login-style connected session for each provider you want to use in the AI Generator.
              </p>
            </div>
            <Button size="sm" onClick={saveProviderSessionSettings} disabled={!hasPendingProviderSessionChanges}>
              <Save className="w-4 h-4 mr-1" />
              Save Login Sessions
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          {providerSessions.map((session) => {
            const provider = PROVIDER_DEFINITIONS.find((entry) => entry.id === session.providerId);
            if (!provider) return null;
            const readyToLogin = canLoginProviderSession(session.providerId);
            const availableModels = PROVIDER_MODELS[session.providerId] ?? [];

            return (
              <div key={session.providerId} className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-card-foreground">{provider.label}</h3>
                      <Badge
                        variant="outline"
                        className={session.connected ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}
                      >
                        {session.connected ? "Logged In" : "Logged Out"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {readyToLogin ? "API config ready. You can activate this login session." : "Set up and lock the matching API config first."}
                    </p>
                    {provider.note && (
                      <p className="text-xs text-muted-foreground">{provider.note}</p>
                    )}
                  </div>
                  <Button
                    variant={session.connected ? "outline" : "default"}
                    size="sm"
                    onClick={() => (session.connected ? signOutProviderSession(session.providerId) : signInProviderSession(session.providerId))}
                    disabled={!readyToLogin && !session.connected}
                  >
                    {session.connected ? "Sign Out" : "Sign In"}
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <Input
                      value={session.accountLabel}
                      onChange={(e) => updateProviderSession(session.providerId, "accountLabel", e.target.value)}
                      placeholder={`${provider.label} Workspace`}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Login Email / Username</Label>
                    <Input
                      value={session.accountEmail}
                      onChange={(e) => updateProviderSession(session.providerId, "accountEmail", e.target.value)}
                      placeholder="you@example.com"
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(provider.loginUrl, "_blank", "noopener,noreferrer")}
                    className="justify-start"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Login Portal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(provider.consoleUrl, "_blank", "noopener,noreferrer")}
                    className="justify-start"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Open API / Console
                  </Button>
                </div>

                <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-3 text-xs text-muted-foreground space-y-2">
                  <p className="font-medium text-foreground">What you need for this provider</p>
                  <ul className="list-disc ml-4 space-y-1">
                    {provider.setupRequirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Preferred Model</Label>
                  <Select
                    value={session.preferredModel}
                    onValueChange={(value) => updateProviderSession(session.providerId, "preferredModel", value)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {session.connected && session.lastLoginAt
                    ? `Session active. Last connected: ${new Date(session.lastLoginAt).toLocaleString()}`
                    : "Session inactive. Sign in to make this provider appear as logged in on the generator page."}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* API Configuration Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="relative border-b bg-gradient-to-r from-muted/80 via-card to-muted/60 px-6 py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_55%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <PlugZap className="h-4 w-4" />
                </div>
                <h2 className="font-semibold text-foreground">API Configuration</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect the image providers you want this browser session to use.
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {enabledApiCount} Connected
                </Badge>
                <Badge variant="outline" className="text-muted-foreground">
                  {apiConfigs.length} Total
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={addApiConfig}>
                <Plus className="w-4 h-4 mr-1" />
                Add API
              </Button>
              <Button size="sm" onClick={saveApiConfigs} disabled={!hasPendingApiChanges}>
                <Save className="w-4 h-4 mr-1" />
                Save Configurations
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          {apiConfigs.map((api) => (
            <div
              key={api.id}
              className={`h-full rounded-xl border transition-colors ${api.enabled
                ? "border-primary/35 bg-primary/[0.04]"
                : "border-border bg-card"
                }`}
            >
              <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`enable-${api.id}`} className="text-sm font-semibold text-card-foreground cursor-pointer">
                      {api.name}
                    </Label>
                    <Badge
                      variant="outline"
                      className={api.enabled ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}
                    >
                      {api.enabled ? "Locked" : "Editable"}
                    </Badge>
                    {PROVIDER_DEFINITIONS.find((provider) => provider.storageId === api.id)?.imageGeneration === false && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">
                        No Image Output
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Endpoint host: <span className="font-mono text-foreground/80">{getEndpointHost(api.endpoint)}</span>
                  </p>
                  {PROVIDER_DEFINITIONS.find((provider) => provider.storageId === api.id)?.note && (
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_DEFINITIONS.find((provider) => provider.storageId === api.id)?.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-2.5 py-1.5">
                    <Label htmlFor={`enable-${api.id}`} className="text-xs font-medium text-muted-foreground cursor-pointer">
                      {api.enabled ? "Lock On" : "Lock Off"}
                    </Label>
                    <Switch
                      id={`enable-${api.id}`}
                      checked={api.enabled}
                      onCheckedChange={(checked) => updateApiConfig(api.id, "enabled", checked)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleKeyVisibility(api.id)}
                    title={showKeys[api.id] ? "Hide API key" : "Show API key"}
                  >
                    {showKeys[api.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  {api.id.startsWith("custom_") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeApiConfig(api.id)}
                      title="Remove API"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 px-4 py-4 sm:px-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {api.id.startsWith("custom_") && (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-muted-foreground">API Name</Label>
                      <Input
                        value={api.name}
                        onChange={(e) => updateApiConfig(api.id, "name", e.target.value)}
                        placeholder="Custom Provider API"
                        disabled={api.enabled}
                        className="text-sm"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">API Key</Label>
                    <div className="relative">
                      <Key className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type={showKeys[api.id] ? "text" : "password"}
                        value={api.key}
                        onChange={(e) => updateApiConfig(api.id, "key", e.target.value)}
                        placeholder={api.enabled ? "Locked. Turn off lock to edit key." : "Enter API key..."}
                        disabled={api.enabled}
                        className="pl-8 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Endpoint URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={api.endpoint}
                        onChange={(e) => updateApiConfig(api.id, "endpoint", e.target.value)}
                        placeholder="https://api.example.com"
                        disabled={api.enabled}
                        className="font-mono text-sm"
                      />
                      {api.endpoint && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => window.open(api.endpoint, "_blank")}
                          title="Open endpoint URL"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {api.enabled ? (
                  <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    This provider is connected. Turn off lock to change the key or endpoint.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Editable mode is on. Save after adding or updating credentials.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/70 bg-muted/40 px-6 py-3">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-primary" />
            These provider credentials are stored locally in this browser right now. For a real multi-user website, move them to a secure backend or server-side secret store.
          </p>
        </div>
      </motion.div>

      {/* Supabase Temporary Upload Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.23 }}
        className="rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Supabase Temporary Upload
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Image Optimizer uploads source files to Supabase temporarily, then auto-removes them.
              </p>
            </div>
            <Badge
              variant="outline"
              className={isSupabaseTempReady(supabaseConfig) ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}
            >
              {isSupabaseTempReady(supabaseConfig) ? "Connected" : "Not Ready"}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <div>
              <Label className="text-sm font-medium text-card-foreground">Enable Temporary Supabase Upload</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When enabled, source images use Supabase signed URL before optimization.
              </p>
            </div>
            <Switch
              checked={supabaseConfig.enabled}
              onCheckedChange={(checked) => updateSupabaseConfig({ enabled: checked })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Project URL</Label>
              <Input
                value={supabaseConfig.url}
                onChange={(e) => updateSupabaseConfig({ url: e.target.value.trim() })}
                placeholder="https://your-project-ref.supabase.co"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs text-muted-foreground">Anon Key</Label>
              <Input
                value={supabaseConfig.anonKey}
                onChange={(e) => updateSupabaseConfig({ anonKey: e.target.value.trim() })}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Bucket Name</Label>
              <Input
                value={supabaseConfig.bucket}
                onChange={(e) => updateSupabaseConfig({ bucket: e.target.value.trim() })}
                placeholder="temp-uploads"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Retention (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={supabaseConfig.retentionMinutes}
                onChange={(e) => updateSupabaseConfig({ retentionMinutes: Math.max(1, Number(e.target.value) || 1) })}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Bucket policy should allow upload, signed-url read, and delete for temporary files.
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Localhost testing mode automatically uses local files and skips Supabase upload. Live server deployment uses Supabase.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/30 px-6 py-3">
          <Button onClick={saveSupabaseConfigSettings} disabled={!hasPendingSupabaseChanges}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save Supabase Settings
          </Button>
        </div>
      </motion.div>

      {/* Member Limits Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-xl border bg-card shadow-sm overflow-hidden"
      >
        <div className="border-b bg-muted/30 px-6 py-4">
          <h2 className="font-semibold text-foreground">Member Usage & Download Limits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Member: <span className="font-medium text-foreground">{activeMember}</span>
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Download used <span className="font-semibold text-foreground">{memberUsage.downloads}</span> / {memberLimits.downloadLimit}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-card-foreground">Download Limit</h3>
                <p className="text-xs text-muted-foreground">Used {memberUsage.downloads} / {memberLimits.downloadLimit}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => updateDownloadLimit(memberLimits.downloadLimit - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  value={memberLimits.downloadLimit}
                  onChange={(e) => updateDownloadLimit(Number(e.target.value) || 0)}
                  className="h-10 rounded-xl bg-background text-center font-mono text-base"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => updateDownloadLimit(memberLimits.downloadLimit + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Remaining {Math.max(0, memberLimits.downloadLimit - memberUsage.downloads)}
              </p>
            </div>

            {SERVICE_KEYS.map((service) => (
              <div key={service} className="rounded-2xl border border-border/70 bg-muted/25 p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-card-foreground">{SERVICE_LABELS[service]}</h3>
                  <p className="text-xs text-muted-foreground">
                    Used {memberUsage.serviceUsage[service]} / {memberLimits.serviceLimits[service]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    onClick={() => updateServiceLimit(service, memberLimits.serviceLimits[service] - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    value={memberLimits.serviceLimits[service]}
                    onChange={(e) => updateServiceLimit(service, Number(e.target.value) || 0)}
                    className="h-10 rounded-xl bg-background text-center font-mono text-base"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    onClick={() => updateServiceLimit(service, memberLimits.serviceLimits[service] + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Remaining {Math.max(0, memberLimits.serviceLimits[service] - memberUsage.serviceUsage[service])}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-6 py-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reloadMemberUsage}>
              Reload Usage
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleResetMemberUsage}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset Usage Counters
            </Button>
          </div>
          <Button type="button" size="sm" onClick={saveUsageLimits} disabled={!hasPendingLimitChanges}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save Limits
          </Button>
        </div>
      </motion.div>

      {/* Top Row - Password and Email */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Password Change Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Change Password
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Update your admin account password
            </p>
          </div>

          <div className="grid gap-3 max-w-md">
            <div className="space-y-1">
              <Label className="text-xs">Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">New Password</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>

            <Button onClick={handlePasswordChange} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Update Password
            </Button>
          </div>
        </motion.div>

        {/* Reset Email Section */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-border bg-card p-6 shadow-card space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-card-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Password Reset Email
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Set the email address where password reset links will be sent
            </p>
          </div>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Recovery Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="pl-10"
                />
              </div>
            </div>

            <Button onClick={handleResetEmailSave} variant="outline" className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save Email
            </Button>
          </div>
        </motion.div>
      </div>
    </div >
  );
}
