(() => {
  const status = document.getElementById('offline-status');
  const installGuide = document.getElementById('install-guide');
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (appleMobile && !standalone) {
    installGuide.hidden = false;
    installGuide.addEventListener('click', () => document.getElementById('install-sheet').showModal());
  }
  window.diaryOfflineReady = false;
  function report(ready, message) {
    window.diaryOfflineReady = ready;
    status.textContent = message;
    status.dataset.ready = String(ready);
    window.dispatchEvent(new Event('diaryofflinechange'));
  }
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    report(false, '请用 Safari 打开安全网址以启用离线使用');
    return;
  }
  function checkCache() {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (navigator.serviceWorker.controller !== controller) return;
      report(data.ready === true, data.ready ? '离线已就绪' : '离线资源不完整，请联网重新打开');
    };
    controller.postMessage({ type: 'check-diary-cache' }, [channel.port2]);
  }
  function track(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !navigator.serviceWorker.controller) {
        report(false, '离线准备未完成，请联网后重新打开');
      }
    });
  }
  navigator.serviceWorker.addEventListener('controllerchange', checkCache);
  window.addEventListener('pageshow', checkCache);
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(registration => {
    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration.installing));
    checkCache();
  }).catch(() => {
    if (navigator.serviceWorker.controller) checkCache();
    else report(false, '离线准备未完成，请联网后重新打开');
  });
})();
