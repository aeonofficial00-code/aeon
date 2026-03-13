self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body,
                icon: data.icon || '/images/favicon.png', // Add a default icon if missing
                image: data.image || null, // Optional heroic image
                badge: data.badge || '/images/favicon.png',
                data: {
                    url: data.url || '/'
                }
            };
            event.waitUntil(
                self.registration.showNotification(data.title || 'AEON Jewellery', options)
            );
        } catch (e) {
            // Fallback for simple text payloads
            event.waitUntil(
                self.registration.showNotification('AEON Jewellery', {
                    body: event.data.text(),
                    icon: '/images/favicon.png'
                })
            );
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
