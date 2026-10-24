export function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notifications');
    return Promise.resolve(false);
  }

  if (Notification.permission === 'granted') {
    return Promise.resolve(true);
  }

  if (Notification.permission !== 'denied') {
    return Notification.requestPermission().then((permission) => {
      return permission === 'granted';
    });
  }

  return Promise.resolve(false);
}

export function sendDesktopNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window)) {
    console.log('[Notification Fallback]', title, options?.body);
    return;
  }

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80',
        ...options,
      });
    } catch (err) {
      console.warn('Failed to dispatch native desktop notification:', err);
    }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        try {
          new Notification(title, {
            icon: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&auto=format&fit=crop&q=80',
            ...options,
          });
        } catch {}
      }
    });
  }
}
