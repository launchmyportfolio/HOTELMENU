import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import newOrderAlertSound from "../assets/sounds/new-order-alert.wav";
import { dedupeAndSortNotifications, getNotificationThreadKey, isHighPriority } from "../utils/notificationUtils";

const API_BASE = import.meta.env.VITE_API_URL;
const SOUND_PREF_KEY = "notificationSoundEnabledV1";
const SOUND_COOLDOWN_MS = 3000;
const TOAST_LIFETIME_MS = 8500;

const NotificationContext = createContext(null);

function getStoredSoundPreference() {
  try {
    const stored = localStorage.getItem(SOUND_PREF_KEY);
    if (stored === null) return true;
    return JSON.parse(stored) !== false;
  } catch (_err) {
    return true;
  }
}

function createToast(notification) {
  return {
    ...notification,
    createdAt: notification.updatedAt || notification.createdAt || new Date().toISOString(),
    toastId: `toast-${notification._id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  };
}

function buildOwnerRequests(actor) {
  const roles = actor.listenRoles?.length ? actor.listenRoles : [actor.role || "ADMIN"];
  return roles.map(role => {
    const params = new URLSearchParams({
      role,
      limit: "80"
    });

    return {
      role,
      url: `${API_BASE}/api/notifications/owner?${params.toString()}`,
      options: {
        headers: {
          Authorization: `Bearer ${actor.token}`
        }
      }
    };
  });
}

function buildCustomerRequest(actor) {
  const params = new URLSearchParams({
    restaurantId: actor.restaurantId,
    tableNumber: String(actor.tableNumber),
    sessionId: actor.sessionId,
    limit: "80"
  });

  return {
    url: `${API_BASE}/api/notifications/customer?${params.toString()}`,
    options: {}
  };
}

function isOwnerActor(actor) {
  return actor?.kind === "OWNER" && Boolean(actor?.token);
}

export function NotificationProvider({ children, actor }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(getStoredSoundPreference);

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const audioElementRef = useRef(null);
  const userInteractedRef = useRef(false);
  const lastSoundAtRef = useRef(0);
  const allowRemoteSoundSyncRef = useRef(false);

  const actorKey = useMemo(() => {
    if (!actor) return "none";
    return [
      actor.kind,
      actor.role,
      actor.restaurantId,
      actor.tableNumber,
      actor.sessionId
    ].join(":");
  }, [actor]);

  const unreadCount = useMemo(() => {
    return (notifications || []).reduce((count, item) => {
      return item?.isRead === true ? count : count + 1;
    }, 0);
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(soundEnabled));
    } catch (_err) {
      // ignore localStorage write failures
    }
  }, [soundEnabled]);

  useEffect(() => {
    function activateAudio() {
      userInteractedRef.current = true;
    }

    window.addEventListener("pointerdown", activateAudio);
    window.addEventListener("keydown", activateAudio);
    window.addEventListener("touchstart", activateAudio);

    return () => {
      window.removeEventListener("pointerdown", activateAudio);
      window.removeEventListener("keydown", activateAudio);
      window.removeEventListener("touchstart", activateAudio);
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(newOrderAlertSound);
    audio.preload = "auto";
    audio.volume = 1;
    audioElementRef.current = audio;

    return () => {
      try {
        audio.pause();
      } catch (_err) {
        // ignore
      }
      audioElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isOwnerActor(actor) || !API_BASE) {
      allowRemoteSoundSyncRef.current = false;
      return;
    }

    let active = true;
    allowRemoteSoundSyncRef.current = false;

    fetch(`${API_BASE}/api/notifications/owner/preferences/sound`, {
      headers: {
        Authorization: `Bearer ${actor.token}`
      }
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!active || !res.ok) return;
        if (typeof data.soundEnabled === "boolean") {
          setSoundEnabled(data.soundEnabled);
        }
      })
      .catch(() => {
        // preference fetch is best-effort only
      })
      .finally(() => {
        if (active) {
          allowRemoteSoundSyncRef.current = true;
        }
      });

    return () => {
      active = false;
    };
  }, [actorKey, actor]);

  useEffect(() => {
    if (!isOwnerActor(actor) || !API_BASE) return;
    if (!allowRemoteSoundSyncRef.current) return;

    fetch(`${API_BASE}/api/notifications/owner/preferences/sound`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${actor.token}`
      },
      body: JSON.stringify({ soundEnabled })
    }).catch(() => {
      // preference sync is best-effort only
    });
  }, [actorKey, actor, soundEnabled]);

  const dismissToast = useCallback((toastId) => {
    if (!toastId) return;
    setToasts(prev => prev.filter(item => item.toastId !== toastId));
  }, []);

  const queueToast = useCallback((notification, options = {}) => {
    const { force = false } = options;
    const isNewOrder = String(notification?.type || "").toUpperCase() === "NEW_ORDER";
    if (!force && !isNewOrder) return;

    const toast = createToast(notification);
    const threadKey = getNotificationThreadKey(notification);

    setToasts(prev => {
      const next = prev.filter(item => item.threadKey !== threadKey);
      return [{ ...toast, threadKey }, ...next].slice(0, 6);
    });

    window.setTimeout(() => {
      setToasts(prev => prev.filter(item => item.toastId !== toast.toastId));
    }, TOAST_LIFETIME_MS + 240);
  }, []);

  const playSound = useCallback((notification) => {
    if (!soundEnabled) return;
    if (!userInteractedRef.current) return;

    const type = String(notification?.type || "").toUpperCase();
    if (type !== "NEW_ORDER") return;

    const now = Date.now();
    if (now - lastSoundAtRef.current < SOUND_COOLDOWN_MS) return;
    lastSoundAtRef.current = now;

    try {
      const audio = audioElementRef.current;
      if (!audio) return;

      const AudioContextRef = window.AudioContext || window.webkitAudioContext;
      if (AudioContextRef) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextRef();
        }

        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        if (!mediaSourceRef.current) {
          mediaSourceRef.current = ctx.createMediaElementSource(audio);
          gainNodeRef.current = ctx.createGain();
          gainNodeRef.current.gain.value = 1.65;
          mediaSourceRef.current.connect(gainNodeRef.current);
          gainNodeRef.current.connect(ctx.destination);
        }
      }

      audio.currentTime = 0;
      audio.volume = 1.0;
      audio.play().catch(() => {
        // autoplay/user-gesture constraints
      });
    } catch (_err) {
      // Audio is best-effort and should never break notifications
    }

    try {
      if ("vibrate" in navigator && isHighPriority(notification?.priority || "HIGH")) {
        navigator.vibrate([180, 60, 180]);
      }
    } catch (_err) {
      // Ignore vibration failures
    }
  }, [soundEnabled]);

  const notificationMatchesActor = useCallback((notification) => {
    if (!actor || !notification) return false;

    if (actor.kind === "OWNER") {
      if (notification.restaurantId !== actor.restaurantId) return false;
      const acceptedRoles = actor.listenRoles?.length
        ? actor.listenRoles
        : [actor.role || "ADMIN"];
      return acceptedRoles.includes(notification.targetRole);
    }

    if (actor.kind === "CUSTOMER") {
      if (notification.targetRole !== "CUSTOMER") return false;
      if (notification.restaurantId !== actor.restaurantId) return false;
      if (Number(notification.tableNumber) !== Number(actor.tableNumber)) return false;
      if (notification.sessionId && actor.sessionId && notification.sessionId !== actor.sessionId) return false;
      return true;
    }

    return false;
  }, [actor]);

  const addIncomingNotification = useCallback((notification, source = "socket") => {
    if (!notificationMatchesActor(notification)) return;

    const incoming = {
      ...notification,
      isRead: notification?.isRead === true ? true : false
    };
    const incomingKey = getNotificationThreadKey(incoming);

    setNotifications(prev => {
      const existingIndex = prev.findIndex(item => {
        if (item._id && incoming._id && item._id === incoming._id) return true;
        return getNotificationThreadKey(item) === incomingKey;
      });

      if (existingIndex >= 0) {
        const merged = { ...prev[existingIndex], ...incoming, isRead: false };
        const next = [merged, ...prev.filter((_, idx) => idx !== existingIndex)];
        return dedupeAndSortNotifications(next).slice(0, 200);
      }

      return dedupeAndSortNotifications([incoming, ...prev]).slice(0, 200);
    });

    if (source === "socket") {
      queueToast(incoming);
      playSound(incoming);
    }
  }, [notificationMatchesActor, playSound, queueToast]);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!actor) {
      setNotifications([]);
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      if (actor.kind === "OWNER") {
        const requests = buildOwnerRequests(actor);
        const responses = await Promise.all(requests.map(request => fetch(request.url, request.options)));
        const payloads = await Promise.all(responses.map(res => res.json()));

        responses.forEach((res, index) => {
          if (!res.ok) {
            throw new Error(payloads[index].error || "Unable to load notifications");
          }
        });

        const merged = payloads.flatMap(payload => (
          Array.isArray(payload.notifications) ? payload.notifications : []
        ));
        const deduped = dedupeAndSortNotifications(merged);
        setNotifications(deduped.slice(0, 200));
      } else {
        const request = buildCustomerRequest(actor);
        const res = await fetch(request.url, request.options);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load notifications");

        const list = Array.isArray(data.notifications) ? data.notifications : [];
        setNotifications(dedupeAndSortNotifications(list).slice(0, 200));
      }
    } catch (err) {
      console.error("Notification fetch failed", err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [actor]);

  useEffect(() => {
    fetchNotifications(false);
    const interval = window.setInterval(() => {
      fetchNotifications(true);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [actorKey, fetchNotifications]);

  useEffect(() => {
    if (!actor || !API_BASE) return undefined;

    const socket = io(API_BASE, { transports: ["websocket", "polling"], reconnection: true });
    socketRef.current = socket;

    const joinPayload = {
      restaurantId: actor.restaurantId,
      role: actor.role,
      roles: actor.listenRoles || [actor.role],
      tableNumber: actor.tableNumber
    };

    function handleConnect() {
      socket.emit("join-room", joinPayload);
    }

    socket.on("connect", handleConnect);
    socket.on("notification:new", payload => addIncomingNotification(payload, "socket"));

    return () => {
      socket.off("connect", handleConnect);
      socket.off("notification:new");
      socket.disconnect();
    };
  }, [actorKey, actor, addIncomingNotification]);

  const markAsRead = useCallback(async (notificationId, isRead = true, roleOverride = "") => {
    if (!actor) return false;

    try {
      if (actor.kind === "OWNER") {
        const role = roleOverride || actor.role || "ADMIN";
        const res = await fetch(`${API_BASE}/api/notifications/owner/${notificationId}/read`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${actor.token}`
          },
          body: JSON.stringify({
            role,
            isRead
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to update notification");
      } else {
        const res = await fetch(`${API_BASE}/api/notifications/customer/${notificationId}/read`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            restaurantId: actor.restaurantId,
            tableNumber: actor.tableNumber,
            sessionId: actor.sessionId,
            isRead
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to update notification");
      }

      setNotifications(prev => prev.map(item => {
        if (item._id !== notificationId) return item;
        return {
          ...item,
          isRead,
          readAt: isRead ? new Date().toISOString() : null
        };
      }));

      return true;
    } catch (err) {
      console.error("markAsRead failed", err);
      return false;
    }
  }, [actor]);

  const markAllAsRead = useCallback(async (isRead = true) => {
    if (!actor) return false;

    try {
      if (actor.kind === "OWNER") {
        const roles = actor.listenRoles?.length ? actor.listenRoles : [actor.role || "ADMIN"];
        const responses = await Promise.all(roles.map(role => {
          return fetch(`${API_BASE}/api/notifications/owner/read-all`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${actor.token}`
            },
            body: JSON.stringify({
              role,
              isRead
            })
          });
        }));
        const payloads = await Promise.all(responses.map(res => res.json()));
        responses.forEach((res, index) => {
          if (!res.ok) throw new Error(payloads[index].error || "Unable to update notifications");
        });
      } else {
        const res = await fetch(`${API_BASE}/api/notifications/customer/read-all`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantId: actor.restaurantId,
            tableNumber: actor.tableNumber,
            sessionId: actor.sessionId,
            isRead
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to update notifications");
      }

      setNotifications(prev => prev.map(item => ({ ...item, isRead, readAt: isRead ? new Date().toISOString() : null })));
      return true;
    } catch (err) {
      console.error("markAllAsRead failed", err);
      return false;
    }
  }, [actor]);

  const removeNotification = useCallback(async (notificationId, roleOverride = "") => {
    if (!actor || actor.kind !== "OWNER") return false;

    try {
      const params = new URLSearchParams({ role: roleOverride || actor.role || "ADMIN" });
      const res = await fetch(`${API_BASE}/api/notifications/owner/${notificationId}?${params.toString()}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${actor.token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to delete notification");

      setNotifications(prev => prev.filter(item => item._id !== notificationId));
      return true;
    } catch (err) {
      console.error("removeNotification failed", err);
      return false;
    }
  }, [actor]);

  const pushLocalToast = useCallback((partial) => {
    const local = {
      _id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: partial.title || "Notification",
      message: partial.message || "",
      type: partial.type || "SYSTEM_ALERT",
      priority: partial.priority || "LOW",
      createdAt: new Date().toISOString(),
      isRead: true,
      targetRole: actor?.role || "CUSTOMER"
    };
    queueToast(local, { force: true });
  }, [actor, queueToast]);

  const value = useMemo(() => ({
    actor,
    notifications,
    unreadCount,
    loading,
    toasts,
    isBellOpen,
    soundEnabled,
    setSoundEnabled,
    setIsBellOpen,
    refreshNotifications: () => fetchNotifications(false),
    dismissToast,
    markAsRead,
    markAllAsRead,
    removeNotification,
    pushLocalToast
  }), [
    actor,
    notifications,
    unreadCount,
    loading,
    toasts,
    isBellOpen,
    soundEnabled,
    fetchNotifications,
    dismissToast,
    markAsRead,
    markAllAsRead,
    removeNotification,
    pushLocalToast
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
