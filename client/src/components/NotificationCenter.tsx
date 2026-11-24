import React, { useState, useEffect } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Flame,
  Compass,
  AlertTriangle,
  Info,
  X,
  Trash2,
} from 'lucide-react';
import { apiClient, type NotificationDeliveryItem } from '../api/client';
import { NotificationItem } from '../types';

interface NotificationCenterProps {
  onSelectLead?: (leadId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onSelectLead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDeliveryItem[]>([]);
  const [deliveryError, setDeliveryError] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    try {
      const [listRes, count] = await Promise.all([
        apiClient.getNotifications(20, 0, false),
        apiClient.getUnreadNotificationsCount(),
      ]);
      setNotifications(listRes.items || []);
      setUnreadCount(count || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      apiClient.getUnreadNotificationsCount().then((count) => {
        setUnreadCount(count || 0);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenToggle = () => {
    if (!isOpen) {
      fetchNotifications();
      setDeliveryError(false);
      void apiClient.getNotificationDeliveries().then(setDeliveries).catch(() => setDeliveryError(true));
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'LEAD_QUALIFIED':
        return <Flame className="h-4 w-4 text-amber-400" />;
      case 'LEAD_DISCOVERED':
        return <Compass className="h-4 w-4 text-electric-400" />;
      case 'PROVIDER_ERROR':
        return <AlertTriangle className="h-4 w-4 text-rose-400" />;
      default:
        return <Info className="h-4 w-4 text-cyan-400" />;
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={handleOpenToggle}
        className="relative flex items-center justify-center h-9 w-9 rounded-xl border border-slate-800 bg-navy-900/60 hover:bg-navy-900 text-slate-300 hover:text-white transition"
        title="In-App Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-extrabold text-white shadow-glow-rose">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Drawer */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-navy-900 border border-slate-700/80 shadow-2xl z-50 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-navy-950/60">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-electric-400" />
                <span className="text-xs font-bold text-white">Notification Center</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 text-[10px] font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white transition"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/80">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                  <Bell className="h-6 w-6 text-slate-600 mx-auto mb-1" />
                  <div className="font-semibold text-slate-400">No Notifications</div>
                  <p className="text-[11px]">When high-opportunity leads are discovered, alerts appear here.</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!item.read) handleMarkAsRead(item.id);
                      if (item.leadId && onSelectLead) onSelectLead(item.leadId);
                    }}
                    className={`p-3 transition cursor-pointer flex items-start gap-3 hover:bg-navy-800/50 ${
                      item.read ? 'bg-transparent opacity-75' : 'bg-electric-950/15'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 rounded-lg bg-navy-950 p-1.5 border border-slate-800">
                      {getIconForType(item.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">{item.title}</span>
                        {!item.read && (
                          <span className="h-2 w-2 rounded-full bg-electric-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                      <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                        <span>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          {!item.read && (
                            <button
                              onClick={(e) => handleMarkAsRead(item.id, e)}
                              className="text-slate-400 hover:text-white"
                              title="Mark read"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(item.id, e)}
                            className="text-slate-500 hover:text-rose-400"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {(deliveries.length > 0 || deliveryError) && (
              <div className="max-h-36 overflow-y-auto space-y-2 border-t border-slate-800 p-3 text-xs">
                <h3 className="font-semibold text-white">External delivery</h3>
                {deliveryError && <p role="alert" className="text-rose-300">Delivery status is unavailable.</p>}
                {deliveries.map((item) => (
                  <div key={item.id} className="text-slate-300">
                    <button type="button" onClick={() => onSelectLead?.(item.leadId)} className="text-left font-medium text-white">
                      {item.businessName}
                    </button>
                    <span className={item.status === 'FAILED' ? 'ml-2 text-rose-300' : 'ml-2 text-slate-400'}>
                      {item.channel === 'EMAIL' ? 'Email' : 'Telegram'} · {item.status.toLowerCase()}
                    </span>
                    {item.lastError && <p className="mt-0.5 text-[11px] text-slate-400">{item.lastError}</p>}
                  </div>
                ))}
              </div>
            )}
            {/* Footer */}
            <div className="p-2 border-t border-slate-800 bg-navy-950/60 text-center">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-1 text-center text-[11px] text-slate-400 hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
