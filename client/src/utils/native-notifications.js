// ==========================================================================
// BRISOFT SHOP - NATIVE NOTIFICATIONS HELPER (Android / iOS / Desktop)
// ==========================================================================

let swRegistration = null;

// Registra o Service Worker e guarda a referência
export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    return reg;
  } catch (err) {
    console.warn('Falha ao registrar Service Worker:', err.message);
    return null;
  }
}

// Solicita permissão de notificação nativa ao usuário
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Erro ao solicitar permissão de notificações:', err);
    return 'default';
  }
}

// Dispara uma notificação nativa do sistema (mesmo em segundo plano ou tela bloqueada)
export async function sendNativeNotification(title, body, { tag, data, icon = '/icon-192.png' } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options = {
    body: body || 'Nova mensagem recebida',
    icon,
    badge: '/icon-192.png',
    tag: tag || 'brisoft-shop-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: data || { url: '/' }
  };

  try {
    // 1. Tenta via Service Worker (padrão obrigatório no Android PWA e navegadores móveis)
    if (swRegistration?.showNotification) {
      await swRegistration.showNotification(title, options);
      return;
    }

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    }

    // 2. Fallback para Desktop com Notification API direta
    new Notification(title, options);
  } catch (err) {
    console.warn('Erro ao emitir notificação nativa:', err);
  }
}
