import { useState, useEffect, useCallback } from "react";
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";

export type UserRole = "admin" | "tester";

interface AuthUser {
  email: string;
  userId: string;
  roles: UserRole[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const checkUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const groups =
        (session.tokens?.accessToken?.payload["cognito:groups"] as
          | string[]
          | undefined) ?? [];

      const roles: UserRole[] = [];
      if (groups.includes("admin")) roles.push("admin");
      if (groups.includes("tester")) roles.push("tester");
      if (roles.length === 0) roles.push("tester");

      setState({
        user: {
          email:
            session.tokens?.idToken?.payload["email"] as string ??
            currentUser.username,
          userId: currentUser.userId,
          roles,
        },
        loading: false,
        error: null,
      });
    } catch {
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const login = async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null, loading: true }));
    try {
      await signOut();
      await signIn({ username: email, password });
      await checkUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setState((s) => ({ ...s, error: message, loading: false }));
      throw err;
    }
  };

  const register = async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null, loading: true }));
    try {
      const result = await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      setState((s) => ({ ...s, loading: false }));
      return result;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      setState((s) => ({ ...s, error: message, loading: false }));
      throw err;
    }
  };

  const confirmAccount = async (email: string, code: string) => {
    setState((s) => ({ ...s, error: null, loading: true }));
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setState((s) => ({ ...s, loading: false }));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Confirmation failed";
      setState((s) => ({ ...s, error: message, loading: false }));
      throw err;
    }
  };

  const logout = async () => {
    await signOut();
    setState({ user: null, loading: false, error: null });
  };

  const isAdmin = state.user?.roles.includes("admin") ?? false;

  return {
    ...state,
    login,
    register,
    confirmAccount,
    logout,
    isAdmin,
  };
}
