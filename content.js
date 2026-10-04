console.log('NoKakulaLeveling: Скрипт запущен');

// Глобальные переменные
let patterns = [];
let isFilterEnabled = false;

// 1. Загружаем паттерны из файла
async function loadPatterns() {
  try {
    const response = await fetch(chrome.runtime.getURL('patterns.json'));
    const data = await response.json();
    patterns = data.kakulaLeveling || [];
    console.log('✅ Загружено паттернов:', patterns.length);
  } catch (error) {
    console.error('❌ Ошибка загрузки паттернов:', error);
  }
}

// 2. Загружаем состояние тумблера из storage
function loadToggleState() {
  chrome.storage.sync.get(['hideAllKakula'], function(result) {
    isFilterEnabled = result.hideAllKakula || false;
    console.log('🔘 Состояние тумблера:', isFilterEnabled);
  });
}

// 3. Проверяем, является ли первый символ смайликом или @
function isEmojiOrAt(text, node) {
  if (!text) return false;
  
  // 1. Проверяем на @
  if (text.charAt(0) === '@') {
    return true;
  }
  
  // 2. Проверяем на кастомный эмодзи Twitch (картинка в самом начале)
  const textContainer = node.querySelector('[data-a-target="chat-message-text"]');
  if (textContainer) {
    const firstChild = textContainer.firstElementChild;
    if (firstChild && firstChild.tagName === 'IMG' && (firstChild.classList.contains('chat-emoticon') || firstChild.classList.contains('emoticon'))) {
      return true;
    }
  }
  
  // 3. ЖЕЛЕЗОБЕТОННАЯ ПРОВЕРКА:
  // Проверяем, является ли первый символ ОБЫЧНОЙ буквой или цифрой
  const firstCodePoint = text.codePointAt(0);
  if (firstCodePoint !== undefined) {
    const firstCharFull = String.fromCodePoint(firstCodePoint);
    
    // \p{L} = любая буква (включая кириллицу), \p{N} = любая цифра
    const isNormalChar = /^\p{L}|\p{N}/u.test(firstCharFull);
    
    // Если это НЕ обычная буква и НЕ цифра, значит это смайлик, символ (𖡎, ‼️, 💸) или спецзнак
    if (!isNormalChar) {
      return true;
    }
  }
  
  return false;
}

// 4. Логика проверки паттерна
function matchesPattern(messageText, pattern) {
  const startsWithStar = pattern.startsWith('*');
  const endsWithStar = pattern.endsWith('*');

  if (startsWithStar && endsWithStar) {
    const substring = pattern.slice(1, -1);
    return messageText.includes(substring);
  } 
  else if (endsWithStar) {
    const prefix = pattern.slice(0, -1);
    return messageText.startsWith(prefix);
  } 
  else if (startsWithStar) {
    const suffix = pattern.slice(1);
    return messageText.endsWith(suffix);
  } 
  else {
    return messageText === pattern;
  }
}

// 5. Проверяем текст сообщения по всем паттернам
function containsPattern(messageText) {
  for (const pattern of patterns) {
    if (matchesPattern(messageText, pattern)) {
      //console.log('🎯 СОВПАДЕНИЕ! Паттерн:', pattern, '| Текст:', messageText);
      return true;
    }
  }
  return false;
}

// 6. Скрытие сообщения
function hideMessage(messageElement) {
  messageElement.style.display = 'none';
  //console.log('🚫 Сообщение скрыто');
}

// 7. Ждем появления контейнера #live-page-chat
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

// 8. Наблюдатель за сообщениями и ФИЛЬТРАЦИЯ
function startChatObserver(container) {
  console.log('🚀 Запускаем наблюдение и фильтрацию...');
  
  const chatObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          
          // Фильтр: реагируем только на LI (VOD) и DIV (Live)
          if (node.tagName !== 'LI' && node.tagName !== 'DIV') {
            return;
          }
          
          // Извлекаем имя
          const usernameEl = node.querySelector('[data-a-target="chat-message-username"]');
          const username = usernameEl ? usernameEl.textContent.trim() : '';
          
          // Извлекаем полный текст
          const textParts = node.querySelectorAll('[data-a-target="chat-message-text"], [data-a-target="chat-message-mention"]');
          let fullText = '';
          textParts.forEach(part => {
            fullText += part.textContent;
          });
          fullText = fullText.trim();
          
          // Если это не полноценное сообщение, пропускаем
          if (!username || !fullText) {
            return;
          }
          
          // ПРИМЕНЯЕМ ФИЛЬТР
          if (isFilterEnabled) {
            let shouldHide = false;
            
			//console.log(username);
			
            // Если это AlextraWho - специальная логика
            if (username === 'AlexstraWho') {
              if (isEmojiOrAt(fullText, node)) {
                //console.log('🎯 AlextraWho: первый символ - смайлик или @, скрываем');
                shouldHide = true;
              } else {
                // Проверяем по паттернам
                shouldHide = containsPattern(fullText);
              }
            } else {
              // Для всех остальных - только паттерны
              shouldHide = containsPattern(fullText);
            }
            
            if (shouldHide) {
              hideMessage(node);
            }
          }
        }
      });
    });
  });
  
  chatObserver.observe(container, {
    childList: true,
    subtree: true
  });
}

// 9. Слушаем изменения в настройках
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && changes.hideAllKakula) {
    isFilterEnabled = changes.hideAllKakula.newValue || false;
    console.log('🔄 Состояние тумблера изменилось на:', isFilterEnabled);
  }
});

// 10. Инициализация
async function init() {
  await loadPatterns();
  loadToggleState();
  waitForChatContainer();
}

// Запуск
init();