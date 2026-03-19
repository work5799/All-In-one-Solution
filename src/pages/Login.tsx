import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Default admin credentials (in production, this should be from a server)
const DEFAULT_CREDENTIALS = {
    username: "admin",
    password: "admin123"
};

// Demo credentials shown on login page
const DEFAULT_DEMO_CREDENTIALS = {
    username: "demo",
    password: "demo123"
};

// Simple localStorage-based auth
const AUTH_KEY = "imgopt_auth";
const USER_KEY = "imgopt_user";
const CREDENTIALS_KEY = "imgopt_credentials";
const DEMO_CREDENTIALS_KEY = "imgopt_demo_credentials";
const RESET_EMAIL_KEY = "imgopt_reset_email";

// Get demo credentials (shown on login page)
const getDemoCredentials = () => {
    const saved = localStorage.getItem(DEMO_CREDENTIALS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_DEMO_CREDENTIALS;
};

// Get current credentials (from storage or defaults)
const getCredentials = () => {
    const saved = localStorage.getItem(CREDENTIALS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_CREDENTIALS;
};

interface LoginProps {
    onLoginSuccess?: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [resetEmail, setResetEmail] = useState("");
    const [isResetting, setIsResetting] = useState(false);

    // Check if already logged in
    const isLoggedIn = localStorage.getItem(AUTH_KEY) === "true";
    const savedUser = localStorage.getItem(USER_KEY);

    const from = (location.state as any)?.from?.pathname || "/";

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username || !password) {
            toast.error("Please enter username and password");
            return;
        }

        setIsLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check credentials (trim whitespace, case-insensitive username)
        const trimmedUsername = username.trim().toLowerCase();
        const trimmedPassword = password.trim();

        // Get current credentials
        const creds = getCredentials();
        const demoCreds = getDemoCredentials();

        // Check against both real credentials and demo credentials
        const isRealLogin = trimmedUsername === creds.username.toLowerCase() && trimmedPassword === creds.password;
        const isDemoLogin = trimmedUsername === demoCreds.username.toLowerCase() && trimmedPassword === demoCreds.password;

        if (isRealLogin || isDemoLogin) {
            localStorage.setItem(AUTH_KEY, "true");
            localStorage.setItem(USER_KEY, username);
            toast.success("Login successful!");
            onLoginSuccess?.();
            navigate(from, { replace: true });
        } else {
            toast.error("Invalid username or password");
        }

        setIsLoading(false);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!resetEmail) {
            toast.error("Please enter your email address");
            return;
        }

        setIsResetting(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        // In production, this would send a reset email
        toast.success(`Password reset link sent to ${resetEmail}. Default password: admin123`);
        setShowForgotPassword(false);
        setResetEmail("");
        setIsResetting(false);
    };

    const handleLogout = () => {
        localStorage.removeItem(AUTH_KEY);
        localStorage.removeItem(USER_KEY);
        toast.info("Logged out successfully");
        navigate("/login");
    };

    // If already logged in, show logout option
    if (isLoggedIn) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md"
                >
                    <Card className="shadow-xl">
                        <CardHeader className="text-center">
                            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-8 h-8 text-primary" />
                            </div>
                            <CardTitle className="text-2xl">Already Logged In</CardTitle>
                            <CardDescription>
                                Logged in as: <span className="font-semibold text-primary">{savedUser}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Button
                                onClick={() => navigate("/")}
                                className="w-full"
                            >
                                Go to Dashboard
                            </Button>
                            <Button
                                onClick={handleLogout}
                                variant="outline"
                                className="w-full"
                            >
                                Logout
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md"
            >
                <Card className="shadow-xl">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Lock className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">
                            {showForgotPassword ? "Reset Password" : "Admin Login"}
                        </CardTitle>
                        <CardDescription>
                            {showForgotPassword
                                ? "Enter your email to receive a reset link"
                                : "Enter your credentials to access the admin panel"
                            }
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        {showForgotPassword ? (
                            <form onSubmit={handleForgotPassword} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="resetEmail">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="resetEmail"
                                            type="email"
                                            placeholder="admin@example.com"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                </div>

                                <Button type="submit" className="w-full" disabled={isResetting}>
                                    {isResetting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : (
                                        "Send Reset Link"
                                    )}
                                </Button>

                                <Button
                                    type="button"
                                    variant="link"
                                    className="w-full"
                                    onClick={() => setShowForgotPassword(false)}
                                >
                                    Back to Login
                                </Button>
                            </form>
                        ) : (
                            <form onSubmit={handleLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="username">Username</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="username"
                                            type="text"
                                            placeholder="Enter username"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="pl-10"
                                            autoComplete="username"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="pl-10 pr-10"
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end">
                                    <Button
                                        type="button"
                                        variant="link"
                                        className="text-xs"
                                        onClick={() => setShowForgotPassword(true)}
                                    >
                                        Forgot Password?
                                    </Button>
                                </div>

                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Logging in...
                                        </>
                                    ) : (
                                        "Login"
                                    )}
                                </Button>

                                <div className="text-center text-xs text-muted-foreground">
                                    Default: {getDemoCredentials().username} / {getDemoCredentials().password}
                                </div>
                            </form>
                        )}
                    </CardContent>
                </Card>

                <div className="text-center mt-4">
                    <Button variant="ghost" onClick={() => navigate("/")}>
                        ← Back to Home
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
