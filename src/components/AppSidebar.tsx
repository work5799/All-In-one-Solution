import {
  LayoutDashboard,
  ImageIcon,
  Sparkles,
  Video,
  Clock,
  Settings,
  Zap,
  Stamp,
  Eraser,
  Maximize2,
  LogIn,
  LogOut,
  Palette,
  Crop,
  FileText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { getCurrentUserId, getMemberLimits, getMemberUsage, SERVICE_KEYS, SERVICE_LABELS } from "@/lib/memberLimits";
import { getMemberLimitsConfig } from "@/lib/memberLimitsEnhanced";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Image Optimizer", url: "/image-optimizer", icon: ImageIcon },
  { title: "AI Generator", url: "/ai-generator", icon: Sparkles },
  { title: "Video Optimizer", url: "/video-optimizer", icon: Video },
  { title: "Image Resizer", url: "/image-resizer", icon: Maximize2 },
  { title: "Watermark", url: "/watermark", icon: Stamp },
  { title: "Watermark Remover", url: "/watermark-remover", icon: Eraser },
  { title: "Color Changer", url: "/color-changer", icon: Palette },
  { title: "Image Cropper", url: "/image-cropper", icon: Crop },
  { title: "Text Transformer", url: "/text-transformer", icon: FileText },
];

const otherItems = [
  { title: "History", url: "/history", icon: Clock },
  { title: "Settings", url: "/settings", icon: Settings },
];

const AUTH_KEY = "imgopt_auth";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const isAuthenticated = typeof window !== 'undefined' && localStorage.getItem(AUTH_KEY) === "true";
  const currentUser = typeof window !== 'undefined' ? localStorage.getItem("imgopt_user") : null;
  const config = typeof window !== "undefined" ? getMemberLimitsConfig() : null;
  const limits = typeof window !== "undefined" ? getMemberLimits() : null;
  const usage = typeof window !== "undefined" ? getMemberUsage(getCurrentUserId()) : null;
  const totalServiceLimit = config && !config.enabled ? Infinity : limits ? SERVICE_KEYS.reduce((sum, key) => sum + limits.serviceLimits[key], 0) : 0;
  const totalServiceUsage = usage ? SERVICE_KEYS.reduce((sum, key) => sum + usage.serviceUsage[key], 0) : 0;
  const usagePercent = totalServiceLimit > 0 && totalServiceLimit !== Infinity ? Math.min(100, Math.round((totalServiceUsage / totalServiceLimit) * 100)) : 0;

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem("imgopt_user");
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">
              All In One Solution
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="transition-colors"
                      activeClassName="text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
            Other
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      className="transition-colors"
                      activeClassName="text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {/* Login/Logout Button */}
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={isAuthenticated ? handleLogout : () => navigate("/login")}
            className="w-full"
          >
            {isAuthenticated ? (
              <>
                <LogOut className="mr-2 h-4 w-4" />
                {!collapsed && (
                  <span>Logout ({currentUser})</span>
                )}
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                {!collapsed && <span>Login</span>}
              </>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>

        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent p-3 mt-2">
            <p className="text-xs text-sidebar-muted">Member Usage</p>
            <p className="text-sm font-medium text-sidebar-accent-foreground">
              {totalServiceUsage} / {totalServiceLimit === Infinity ? "Unlimited" : totalServiceLimit} service uses
            </p>
            <p className="text-xs text-sidebar-muted mt-0.5">
              Downloads: {usage?.downloads || 0} / {(config && !config.enabled) || (limits && limits.downloadLimit >= 999999) ? "Unlimited" : limits?.downloadLimit || 0}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-sidebar-border">
              <div className="h-full rounded-full gradient-primary" style={{ width: `${usagePercent}%` }} />
            </div>
            <div className="mt-3 space-y-1.5">
              {SERVICE_KEYS.map((service) => (
                <div key={service} className="flex items-center justify-between text-[11px]">
                  <span className="text-sidebar-muted">{SERVICE_LABELS[service]}</span>
                  <span className="font-medium text-sidebar-accent-foreground">
                    {usage?.serviceUsage[service] || 0} / {(config && !config.enabled) || (limits && limits.serviceLimits[service] >= 999999) ? "Unlimited" : limits?.serviceLimits[service] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
