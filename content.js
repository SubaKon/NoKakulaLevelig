// content.js — только наблюдение за чатом и само действие (скрытие).
// Вся логика фильтрации вынесена в filter.js (window.NKLFilter.shouldHide).

console.log('NoKakulaLeveling: Скрипт запущен');

// 1. Ждем появления контейнера #live-page-chat
function waitForChatContainer() {
  const existingContainer = document.querySelector('#live-page-chat');
  if (existingContainer) {
    console.log('✅ #live-page-chat уже найден!');
    startChatObserver(existingContainer);
    return;
  }

  console.log('👁️ Ждем появления #live-page-chat...');
  const tempObserver = new MutationObserver((mutations, obs) => {
    const container = document.querySelector('#live-page-chat');
    if (container) {
      console.log('✅ #live-page-chat появился!');
      obs.disconnect();
      startChatObserver(container);
    }
  });

  tempObserver.observe(document.body, { childList: true, subtree: true });
}

// 2. Наблюдатель за сообщениями
function startChatObserver(container) {
  console.log('🚀 Запускаем наблюдение и фильтрацию...');

  const chatObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // Простая проверка: если функция проверки на скрытие вернула true — скрываем
        if (window.NKLFilter.shouldHide(node)) {
          node.style.display = 'none';
        }
      });
    });
  });

  chatObserver.observe(container, {
    childList: true,
    subtree: true
  });
}

// 3. Инициализация
async function init() {
  await window.NKLFilter.init();       // загрузка паттернов (filter.js)
  window.NKLFilter.loadToggleState();  // загрузка тумблеров и ника (filter.js)
  waitForChatContainer();
}

// Запуск
init();
