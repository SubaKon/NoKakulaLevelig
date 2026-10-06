// Ждем, пока DOM загрузится
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup загружен');

  // Получаем все тумблеры
  const toggle1 = document.getElementById('toggle1');
  const toggle2 = document.getElementById('toggle2');
  const toggle3 = document.getElementById('toggle3');

  // Поле ввода ника
  const nicknameInput = document.getElementById('nicknameInput');
  const saveNicknameBtn = document.getElementById('saveNickname');

  // Загружаем сохраненное состояние первого тумблера
  chrome.storage.sync.get(['hideAllKakula'], function(result) {
    toggle1.checked = result.hideAllKakula || false;
    console.log('Загружено состояние toggle1:', toggle1.checked);
  });

  // Загружаем сохраненное состояние второго тумблера
  chrome.storage.sync.get(['hideOthersKakula'], function(result) {
    toggle2.checked = result.hideOthersKakula || false;
    console.log('Загружено состояние toggle2:', toggle2.checked);
  });

  // Загружаем сохраненный ник
  chrome.storage.sync.get(['twitchNickname'], function(result) {
    nicknameInput.value = result.twitchNickname || '';
    console.log('Загружен ник:', nicknameInput.value);
  });

  // Обработчик для первого тумблера (рабочий)
  toggle1.addEventListener('change', function() {
    console.log('Toggle 1:', this.checked);

    // Сохраняем состояние в storage
    chrome.storage.sync.set({ hideAllKakula: this.checked }, function() {
      console.log('Сохранено hideAllKakula:', this.checked);
    }.bind(this));

    // Взаимное исключение
    if (this.checked) {
      toggle2.checked = false;
      chrome.storage.sync.set({ hideOthersKakula: false });
    }
  });

  // Обработчик для второго тумблера
  toggle2.addEventListener('change', function() {
    console.log('Toggle 2:', this.checked);

    // Требует заполненный ник
    if (this.checked && !nicknameInput.value.trim()) {
      this.checked = false; // Сбрасываем обратно
      alert('Сначала укажите ваш Twitch ник в поле ниже!');
      return;
    }

    chrome.storage.sync.set({ hideOthersKakula: this.checked });

    // Взаимное исключение
    if (this.checked) {
      toggle1.checked = false;
      chrome.storage.sync.set({ hideAllKakula: false });
    }
  });

  // Сохранение ника (по кнопке и по Enter)
  function saveNickname() {
    const nick = nicknameInput.value.trim();

    // Ник на Twitch не может содержать пробелов
    if (nick.includes(' ')) {
      alert('Ник не может содержать пробелы!');
      return;
    }

    chrome.storage.sync.set({ twitchNickname: nick }, function() {
      console.log('Сохранен ник:', nick);
    });

    // Если включен второй тумблер, а ник убрали — выключаем его
    if (!nick && toggle2.checked) {
      toggle2.checked = false;
      chrome.storage.sync.set({ hideOthersKakula: false });
    }
  }

  saveNicknameBtn.addEventListener('click', saveNickname);
  nicknameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') saveNickname();
  });

  // Обработчик для третьего тумблера (заглушка)
  toggle3.addEventListener('change', function() {
    console.log('Toggle 3: пока не реализовано');
    this.checked = false; // Сбрасываем обратно
    alert('Функция "Авто какула левелинг" пока не реализована');
  });
});