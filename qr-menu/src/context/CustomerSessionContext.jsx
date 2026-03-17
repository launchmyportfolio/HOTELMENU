import { createContext, useContext, useEffect, useState } from "react";

const DEFAULT_RESTAURANT = import.meta.env.VITE_DEFAULT_RESTAURANT_ID || "defaultRestaurant";

const CustomerSessionContext = createContext(null);

export function CustomerSessionProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const stored = localStorage.getItem("customerSessionV2");
      return stored ? JSON.parse(stored) : null;
    } catch (_err) {
      return null;
    }
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem("customerSessionV2", JSON.stringify(session));
    } else {
      localStorage.removeItem("customerSessionV2");
    }
  }, [session]);

  const updateSession = (data) => setSession(prev => (prev ? { ...prev, ...data } : data));
  const clearSession = () => setSession(null);

  return (
    <CustomerSessionContext.Provider value={{ session, setSession: updateSession, clearSession, defaultRestaurant: DEFAULT_RESTAURANT }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  return useContext(CustomerSessionContext);
}

export function useRestaurantIdFromPath(pathname) {
  const match = pathname?.match(/\/restaurant\/([^/]+)/);
  return match?.[1] || null;
}
