// Ждем, пока DOM загрузится
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup загружен');
  
  // Получаем все тумблеры
  const toggle1 = document.getElementById('toggle1');
  const toggle2 = document.getElementById('toggle2');
  const toggle3 = document.getElementById('toggle3');
  
  // Загружаем сохраненное состояние первого тумблера
  chrome.storage.sync.get(['hideAllKakula'], function(result) {
    toggle1.checked = result.hideAllKakula || false;
    console.log('Загружено состояние toggle1:', toggle1.checked);
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
  
  // Обработчик для второго тумблера (заглушка)
  toggle2.addEventListener('change', function() {
    console.log('Toggle 2: пока не реализовано');
    this.checked = false; // Сбрасываем обратно
    alert('Функция "Скрыть чужой какула левелинг" пока не реализована');
  });
  
  // Обработчик для третьего тумблера (заглушка)
  toggle3.addEventListener('change', function() {
    console.log('Toggle 3: пока не реализовано');
    this.checked = false; // Сбрасываем обратно
    alert('Функция "Авто какула левелинг" пока не реализована');
  });
});