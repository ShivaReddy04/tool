import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import api from "../api/client";
import type { User, UserRole } from "../types";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  loginWithCredentials: (email: string, password: string) => Promise<string | null>;
  signup: (firstName: string, lastName: string, email: string, password: string, role?: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = user !== null;


  // Restore session on app load via refresh token
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await api.post("/auth/refresh-token");
        // Fetch user profile with new token
        const profile = await api.get("/auth/profile", {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        const userObj = {
          id: profile.data.id,
          name: `${profile.data.firstName} ${profile.data.lastName}`,
          email: profile.data.email,
          role: profile.data.role,
        };
        setUser(userObj);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('user', JSON.stringify(userObj));
      } catch {
        // No valid session — user needs to log in
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const loginWithCredentials = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { data } = await api.post("/auth/login", { email, password });
        const userObj = {
          id: data.user.id,
          name: `${data.user.firstName} ${data.user.lastName}`,
          email: data.user.email,
          role: data.user.role,
        };
        setUser(userObj);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('user', JSON.stringify(userObj));
        return null;
      } catch (err: any) {
        return err.response?.data?.error || "Login failed. Please try again.";
      }
    },
    []
  );

  const signup = useCallback(
    async (firstName: string, lastName: string, email: string, password: string, role: string = 'developer'): Promise<string | null> => {
      try {
        const { data } = await api.post("/auth/signup", {
          email,
          password,
          firstName,
          lastName,
          role,
        });
        const userObj = {
          id: data.user.id,
          name: `${data.user.firstName} ${data.user.lastName}`,
          email: data.user.email,
          role: data.user.role,
        };
        setUser(userObj);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('user', JSON.stringify(userObj));
        return null;
      } catch (err: any) {
        return err.response?.data?.error || "Signup failed. Please try again.";
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Logout even if API call fails
    }
    setUser(null);
    // Drop the auth blob so the API client stops sending the previous user's
    // bearer token, and the next signed-in user doesn't start with a stale
    // session. Per-user dashboard state is namespaced by user.id in
    // DashboardContext, so it's already isolated; we don't touch those.
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, hasRole, loginWithCredentials, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
