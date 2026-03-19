import { Navigate, useLocation } from "react-router-dom";

const AUTH_KEY = "imgopt_auth";

interface AuthGuardProps {
    children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
    const location = useLocation();
    const isAuthenticated = localStorage.getItem(AUTH_KEY) === "true";

    if (!isAuthenticated) {
        // Redirect to login page with return url
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}

// Hook to check auth status
export function useAuth() {
    const isAuthenticated = localStorage.getItem(AUTH_KEY) === "true";
    const user = localStorage.getItem("imgopt_user");

    return {
        isAuthenticated,
        user,
        login: (username: string) => {
            localStorage.setItem(AUTH_KEY, "true");
            localStorage.setItem("imgopt_user", username);
        },
        logout: () => {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem("imgopt_user");
        }
    };
}

// Higher-order component for protecting routes
export function withAuth<P extends object>(
    Component: React.ComponentType<P>
) {
    return function AuthenticatedComponent(props: P) {
        return (
            <AuthGuard>
                <Component {...props} />
            </AuthGuard>
        );
    };
}
